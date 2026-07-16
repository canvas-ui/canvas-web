// Canvas querySpec — features may be a string array (treated as anyOf)
// or the explicit object form. Filters are SynapsD filter strings
// (bitmap keys or "datetime:..." expressions).
export interface CanvasFeatureBuckets {
  allOf?: string[]
  anyOf?: string[]
  noneOf?: string[]
}

export interface CanvasQuerySpec {
  features: string[] | CanvasFeatureBuckets | null
  filters: string[]
  query?: string | null
  // Default ordering the canvas view is saved with (timeline sort). Applied
  // server-side on list so the whole canvas — folder view, widgets, public
  // shares — inherits it. `sortBy` is a timeline name (crud:created/updated/
  // content/…); empty/absent means the DB default (newest-id order).
  sort?: { sortBy: string; order: 'asc' | 'desc' } | null
}

// Toolbox filter state — stored in metadata.toolbox on canvas/context objects,
// or in localStorage for regular-layer (session) navigation.
export interface ToolboxFeatureFilters {
  allOf: string[]
  anyOf: string[]
  noneOf: string[]
}

export interface TimelineRange {
  start: string
  end: string
}

export interface ToolboxTimelineFilters {
  quickFilter: string | null
  // Explicit date ranges (ISO YYYY-MM-DD) from the rail or calendar. Multiple
  // disjoint ranges are OR'd server-side (one t:<name>:<start..end> token per
  // range, default anyOf sigil) — e.g. "these 3 Mondays". Takes precedence
  // over quickFilter when non-empty.
  customRanges: TimelineRange[]
  // Legacy single-range field (pre-multi-range saved filters/sessions). Only
  // read as a fallback when customRanges is absent; never written anymore.
  customRange?: TimelineRange | null
  indexCreated: boolean
  indexUpdated: boolean
  indexDeleted: boolean
  // "content" is the other built-in timeline (content-derived events: EXIF
  // timestamps, log timestamps, extracted time periods) alongside crud:*.
  contentEvents: boolean
  // Additional custom domain timelines (e.g. "wikipedia", "personal") to
  // include in the query.
  selectedTimelines: string[]
}

// Server-side ordering for the whole content view, by a named timeline.
export interface ToolboxSort {
  sortBy: string
  order: 'asc' | 'desc'
}

// Spatial filter: a bounding box selected on the map. The backend geo grammar
// (synapsd filters.js) supports bbox / near / cell; the map UI draws a box, so
// we model a bbox. A polygon selection is reduced to its bounding box until the
// backend gains a polygon coverer.
export interface GeoBBox {
  minLat: number
  minLon: number
  maxLat: number
  maxLon: number
}
export interface ToolboxGeoFilters {
  bbox: GeoBBox | null
}

// Ephemeral, client-side map selection used by the toolbox Map filter. Unlike
// `ToolboxGeoFilters` (which feeds the backend `geo:bbox` query), this refines
// the ALREADY-fetched result set in the browser — so it can be an arbitrary
// polygon, not just a bbox, and never triggers a new fetch. It is not persisted
// with saved canvases.
export type GeoSelection =
  | { kind: 'rect'; bbox: GeoBBox }
  | { kind: 'polygon'; points: Array<{ lat: number; lon: number }> }

export interface ToolboxFilters {
  features: ToolboxFeatureFilters
  timeline: ToolboxTimelineFilters
  geo: ToolboxGeoFilters
  sort: ToolboxSort
}

// Default view order: CRUD "created" timeline, newest first (≈ DB default).
export const DEFAULT_TOOLBOX_SORT: ToolboxSort = { sortBy: 'crud:created', order: 'desc' }

export const DEFAULT_TOOLBOX_FILTERS: ToolboxFilters = {
  features: { allOf: [], anyOf: [], noneOf: [] },
  timeline: {
    quickFilter: null,
    customRanges: [],
    indexCreated: true,
    indexUpdated: true,
    indexDeleted: false,
    contentEvents: false,
    selectedTimelines: [],
  },
  geo: { bbox: null },
  sort: { ...DEFAULT_TOOLBOX_SORT },
}

/**
 * Convert the toolbox geo filter state → SynapsD geo filter strings.
 * Grammar: `geo:bbox:<minLat>,<minLon>,<maxLat>,<maxLon>` (synapsd filters.js).
 * Returns an empty array when no area is selected.
 */
export function buildGeoFilters(geo: ToolboxGeoFilters): string[] {
  const b = geo.bbox
  if (!b) return []
  return [`geo:bbox:${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}`]
}

/**
 * Convert toolbox timeline filter state → SynapsD timeline filter strings.
 *
 * The backend filter grammar is `t:<name>:<spec>` (see synapsd filters.js).
 * One active spec — a named wall-clock token ("today", "nextWeek", ...) or an
 * explicit `start..end` range — applies uniformly to every selected timeline:
 * the server resolves quick tokens on ANY timeline name (parseTimelineToken),
 * so `t:tasks:tomorrow` = "due tomorrow" and `t:wikipedia:thisCentury` work
 * the same as the crud:* lifecycle stamps.
 *
 * Multiple actions/timelines are OR'd (default sigil = anyOf).
 * Returns an empty array when no quick filter/range is active.
 */
// Active explicit ranges, with legacy single-range fallback (old saved
// filters/sessions carry `customRange`; new state always writes `customRanges`).
export function getTimelineRanges(timeline: ToolboxTimelineFilters): TimelineRange[] {
  if (timeline.customRanges?.length) return timeline.customRanges
  return timeline.customRange ? [timeline.customRange] : []
}

export function buildDatetimeFilters(timeline: ToolboxTimelineFilters): string[] {
  const { quickFilter, indexCreated, indexUpdated, indexDeleted, contentEvents, selectedTimelines } = timeline
  // Explicit ranges (calendar/rail) win over a quick token. Each range emits
  // its own token per timeline; the sigil algebra ORs them (anyOf default).
  const ranges = getTimelineRanges(timeline)
  const specs = ranges.length > 0
    ? ranges.map(r => `${r.start}..${r.end}`)
    : (quickFilter ? [quickFilter] : [])
  if (specs.length === 0) return []
  const names: string[] = []
  if (indexCreated) names.push('crud:created')
  if (indexUpdated) names.push('crud:updated')
  if (indexDeleted) names.push('crud:deleted')
  if (contentEvents) names.push('content')
  names.push(...selectedTimelines)
  return names.flatMap(name => specs.map(spec => `t:${name}:${spec}`))
}

// Timeline types
export interface TimelineInfo {
  name: string
  scales?: string[]
}

export interface TimelineQueryInterval {
  start: string | number
  end?: string | number
  scale?: string
}

export interface TimelineQueryOptions {
  mode?: 'union' | 'layers'
  scales?: string[]
}

// Opaque metadata blob the backend never introspects. Any layer can carry it
// (UI styling, share info, applet config, etc.); for canvases it usually
// contains a `ui` block plus future share/applet keys.
export type LayerMetadata = Record<string, unknown>

// Workspace tree node structure. `querySpec` is only present on canvas-typed
// nodes; `metadata` is always emitted (defaults to {}).
export interface TreeNode {
  id: string
  type: string
  name: string
  label: string
  description: string
  color: string | null
  locked?: boolean
  lockedBy?: string[]
  metadata?: LayerMetadata
  querySpec?: CanvasQuerySpec
  children: TreeNode[]
}

// Where a document's location came from. Ranked server-side (core/workspace/lib/geo.js)
// as manual > exif > device, so re-indexing a photo never reverts a hand-fixed pin:
// `exif` is where the shot was TAKEN, `device` where the client was when it uploaded.
export type GeoSource = 'device' | 'exif' | 'manual'

// Any document type can carry a location — photos and notes most commonly, but
// also todos, files and emails. Indexed by synapsd from metadata.geo.{lat,lon}.
export interface DocumentGeo {
  lat: number
  lon: number
  alt?: number
  // Horizontal error radius in metres (Geolocation coords.accuracy, or EXIF
  // GPSHPositioningError) — why a pin can sit a block off from the real spot.
  accuracy?: number
  source?: GeoSource
}

// Document structure from API
export interface Document {
  id: number
  schema: string
  schemaVersion: string
  data: Record<string, any>
  // Optional user-authored free-text note (top-level, never regenerated).
  comment?: string
  metadata: {
    contentType: string
    contentEncoding: string
    size?: number
    // tag/<name> entries — see components/toolbox/add/tags.ts's tagsToFeatures
    features?: string[]
    geo?: DocumentGeo
  }
  locations?: Array<{ url: string; metadata?: Record<string, any> }>
  indexOptions: {
    checksumAlgorithms: string[]
    primaryChecksumAlgorithm: string
    checksumFields: string[]
    ftsSearchFields: string[]
    vectorEmbeddingFields: string[]
    embeddingOptions: {
      embeddingModel: string
      embeddingDimensions: number
      embeddingProvider: string
      embeddingProviderOptions: Record<string, any>
      chunking: {
        type: string
        chunkSize: number
        chunkOverlap: number
      }
    }
  }
  createdAt: string
  updatedAt: string
  checksumArray: string[]
  embeddingsArray: any[]
  parentId: number | null
  versions: any[]
  versionNumber: number
  latestVersion: number
}

// API response structure for documents
export interface DocumentsResponse {
  data: Document[]
  count: number
  totalCount?: number
  error: string | null
}

// API response structure for tree
export interface TreeResponse {
  payload: TreeNode
}

// API response structure for documents
export interface DocumentsApiResponse {
  status: string
  statusCode: number
  message: string
  payload: DocumentsResponse
  count: number | null
}

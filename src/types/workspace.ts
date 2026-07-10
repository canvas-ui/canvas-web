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
}

// Toolbox filter state — stored in metadata.toolbox on canvas/context objects,
// or in localStorage for regular-layer (session) navigation.
export interface ToolboxFeatureFilters {
  allOf: string[]
  anyOf: string[]
  noneOf: string[]
}

export interface ToolboxTimelineFilters {
  quickFilter: string | null
  // Explicit date range (ISO YYYY-MM-DD), e.g. from dragging the timeline rail.
  // Takes precedence over quickFilter when set.
  customRange: { start: string; end: string } | null
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

export interface ToolboxFilters {
  features: ToolboxFeatureFilters
  timeline: ToolboxTimelineFilters
}

export const DEFAULT_TOOLBOX_FILTERS: ToolboxFilters = {
  features: { allOf: [], anyOf: [], noneOf: [] },
  timeline: {
    quickFilter: null,
    customRange: null,
    indexCreated: true,
    indexUpdated: true,
    indexDeleted: false,
    contentEvents: false,
    selectedTimelines: [],
  },
}

/**
 * Convert toolbox timeline filter state → SynapsD timeline filter strings.
 *
 * The backend filter grammar is `t:<name>:<spec>` (see synapsd filters.js).
 * Only `crud:*` timeline names resolve relative quick tokens ("today",
 * "thisWeek", ...) server-side (parseTimelineToken's CRUD_TIMEFRAMES check) —
 * any other timeline name (the built-in "content" timeline, or a custom
 * domain timeline like "wikipedia") requires a literal `start..end` spec.
 * So quick-token-only filters (no explicit drag range) only ever apply to
 * crud:*; content/domain timelines need an explicit customRange.
 *
 * Multiple actions/timelines are OR'd (default sigil = anyOf).
 * Returns an empty array when no quick filter/range is active.
 */
export function buildDatetimeFilters(timeline: ToolboxTimelineFilters): string[] {
  const { quickFilter, customRange, indexCreated, indexUpdated, indexDeleted, contentEvents, selectedTimelines } = timeline
  // Explicit drag range wins over a quick token; otherwise use the quick token.
  const spec = customRange ? `${customRange.start}..${customRange.end}` : quickFilter
  if (!spec) return []
  const filters: string[] = []
  if (indexCreated) filters.push(`t:crud:created:${spec}`)
  if (indexUpdated) filters.push(`t:crud:updated:${spec}`)
  if (indexDeleted) filters.push(`t:crud:deleted:${spec}`)
  if (customRange) {
    if (contentEvents) filters.push(`t:content:${spec}`)
    for (const name of selectedTimelines) filters.push(`t:${name}:${spec}`)
  }
  return filters
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

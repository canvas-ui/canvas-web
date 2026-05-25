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
  indexCreated: boolean
  indexUpdated: boolean
  indexDeleted: boolean
  searchContent: boolean
  // Custom domain timelines to include in query (empty = all)
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
    indexCreated: true,
    indexUpdated: true,
    indexDeleted: false,
    searchContent: false,
    selectedTimelines: [],
  },
}

/**
 * Convert toolbox timeline filter state → SynapsD `datetime:ACTION:TIMEFRAME` strings.
 * Returns an empty array when no quick filter is active.
 */
export function buildDatetimeFilters(timeline: ToolboxTimelineFilters): string[] {
  const { quickFilter, indexCreated, indexUpdated, indexDeleted } = timeline
  if (!quickFilter) return []
  const filters: string[] = []
  if (indexCreated) filters.push(`datetime:created:${quickFilter}`)
  if (indexUpdated) filters.push(`datetime:updated:${quickFilter}`)
  if (indexDeleted) filters.push(`datetime:deleted:${quickFilter}`)
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
  metadata: {
    contentType: string
    contentEncoding: string
    dataPaths?: string[]
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

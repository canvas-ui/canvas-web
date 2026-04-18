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

// Canonical canvas payload returned by /workspaces/:wid/canvases endpoints.
export interface Canvas {
  schemaVersion: string
  id: string
  type: 'canvas'
  name: string
  label: string
  description: string
  color: string | null
  locked: boolean
  lockedBy: string[]
  metadata: LayerMetadata
  acl: Record<string, unknown>
  querySpec: CanvasQuerySpec
  // Joined fields the route adds for convenience
  treeId: string
  treeName: string
  path: string | null
  // Only present on the top-level /canvases alias responses
  workspaceId?: string
  workspaceName?: string
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
    dataPaths: string[]
  }
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

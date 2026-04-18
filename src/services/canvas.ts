import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'
import type {
  Canvas,
  CanvasQuerySpec,
  Document,
  LayerMetadata,
} from '@/types/workspace'

// ─────────────────────────────────────────────────────────────────────────
// Workspace-scoped canvas CRUD (/workspaces/:wid/canvases)
// ─────────────────────────────────────────────────────────────────────────

function workspaceCanvasesUrl(workspaceId: string, treeName?: string): string {
  const base = `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/canvases`
  return treeName ? `${base}?tree=${encodeURIComponent(treeName)}` : base
}

function workspaceCanvasUrl(workspaceId: string, canvasIdOrName: string, treeName?: string): string {
  const base = `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/canvases/${encodeURIComponent(canvasIdOrName)}`
  return treeName ? `${base}?tree=${encodeURIComponent(treeName)}` : base
}

export interface ListCanvasesOptions {
  treeName?: string
}

export async function listCanvases(workspaceId: string, options: ListCanvasesOptions = {}): Promise<Canvas[]> {
  const res = await api.get<{ payload: Canvas[] }>(workspaceCanvasesUrl(workspaceId, options.treeName))
  return res.payload || []
}

export interface CreateCanvasInput {
  /** Tree path the canvas should sit at, e.g. /projects/acme/reports */
  path: string
  /** Defaults to the workspace's default context tree */
  treeName?: string
  querySpec?: Partial<CanvasQuerySpec>
  metadata?: LayerMetadata
}

export async function createCanvas(workspaceId: string, input: CreateCanvasInput): Promise<Canvas> {
  const { treeName, ...body } = input
  const payload: Record<string, unknown> = { ...body }
  if (treeName) { payload.tree = treeName }
  const res = await api.post<{ payload: Canvas }>(workspaceCanvasesUrl(workspaceId), payload)
  return res.payload
}

export async function getCanvas(workspaceId: string, canvasIdOrName: string, treeName?: string): Promise<Canvas> {
  const res = await api.get<{ payload: Canvas }>(workspaceCanvasUrl(workspaceId, canvasIdOrName, treeName))
  return res.payload
}

export interface UpdateCanvasInput {
  label?: string
  description?: string
  color?: string | null
  /** Replaces wholesale — read-modify-write. */
  querySpec?: Partial<CanvasQuerySpec>
  /** Replaces wholesale — read-modify-write. */
  metadata?: LayerMetadata
}

export async function updateCanvas(
  workspaceId: string,
  canvasIdOrName: string,
  input: UpdateCanvasInput,
  treeName?: string,
): Promise<Canvas> {
  const res = await api.patch<{ payload: Canvas }>(workspaceCanvasUrl(workspaceId, canvasIdOrName, treeName), input)
  return res.payload
}

export async function deleteCanvas(
  workspaceId: string,
  canvasIdOrName: string,
  treeName?: string,
): Promise<boolean> {
  await api.delete(workspaceCanvasUrl(workspaceId, canvasIdOrName, treeName))
  return true
}

// ─────────────────────────────────────────────────────────────────────────
// Canvas documents — applies path AND querySpec, composed with caller filters
// ─────────────────────────────────────────────────────────────────────────

export interface CanvasDocumentsOptions {
  treeName?: string
  allOf?: string[]
  anyOf?: string[]
  noneOf?: string[]
  filters?: string[]
  limit?: number
  offset?: number
  page?: number
  /** Search query — when set, server uses /search semantics. */
  q?: string
}

export interface CanvasDocumentsResponse {
  payload: Document[]
  count: number | null
  totalCount: number | null
  status: string
  statusCode: number
  message: string
}

function appendListParam(params: URLSearchParams, key: string, values?: string[]) {
  if (!values?.length) { return }
  for (const v of values) {
    if (v) { params.append(key, v) }
  }
}

export async function getCanvasDocuments(
  workspaceId: string,
  canvasIdOrName: string,
  options: CanvasDocumentsOptions = {},
): Promise<CanvasDocumentsResponse> {
  const params = new URLSearchParams()
  if (options.treeName) { params.append('tree', options.treeName) }
  appendListParam(params, 'allOf', options.allOf)
  appendListParam(params, 'anyOf', options.anyOf)
  appendListParam(params, 'noneOf', options.noneOf)
  appendListParam(params, 'filters', options.filters)
  if (options.limit !== undefined) { params.append('limit', String(options.limit)) }
  if (options.offset !== undefined) { params.append('offset', String(options.offset)) }
  if (options.page !== undefined) { params.append('page', String(options.page)) }
  if (options.q) { params.append('q', options.q) }

  const qs = params.toString()
  const url = `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/canvases/${encodeURIComponent(canvasIdOrName)}/documents${qs ? '?' + qs : ''}`
  return await api.get<CanvasDocumentsResponse>(url)
}

// ─────────────────────────────────────────────────────────────────────────
// Top-level /canvases convenience alias (read-only)
// ─────────────────────────────────────────────────────────────────────────

export interface CanvasAliasOptions {
  /** Workspace hint — disambiguates name lookups across workspaces. */
  workspace?: string
}

export async function getCanvasByAlias(canvasIdOrName: string, options: CanvasAliasOptions = {}): Promise<Canvas> {
  const params = new URLSearchParams()
  if (options.workspace) { params.append('workspace', options.workspace) }
  const qs = params.toString()
  const url = `${API_ROUTES.canvases}/${encodeURIComponent(canvasIdOrName)}${qs ? '?' + qs : ''}`
  const res = await api.get<{ payload: Canvas }>(url)
  return res.payload
}

export async function getCanvasDocumentsByAlias(
  canvasIdOrName: string,
  options: CanvasDocumentsOptions & CanvasAliasOptions = {},
): Promise<CanvasDocumentsResponse> {
  const params = new URLSearchParams()
  if (options.workspace) { params.append('workspace', options.workspace) }
  appendListParam(params, 'allOf', options.allOf)
  appendListParam(params, 'anyOf', options.anyOf)
  appendListParam(params, 'noneOf', options.noneOf)
  appendListParam(params, 'filters', options.filters)
  if (options.limit !== undefined) { params.append('limit', String(options.limit)) }
  if (options.offset !== undefined) { params.append('offset', String(options.offset)) }
  if (options.page !== undefined) { params.append('page', String(options.page)) }
  if (options.q) { params.append('q', options.q) }

  const qs = params.toString()
  const url = `${API_ROUTES.canvases}/${encodeURIComponent(canvasIdOrName)}/documents${qs ? '?' + qs : ''}`
  return await api.get<CanvasDocumentsResponse>(url)
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Walks a tree node and returns every canvas-typed descendant alongside its
 * full path. Useful for surfacing all canvases without a separate API call
 * once the tree payload is in hand.
 */
export function collectCanvasNodes(
  root: import('@/types/workspace').TreeNode,
  parentPath = '',
): Array<{ node: import('@/types/workspace').TreeNode; path: string }> {
  const out: Array<{ node: import('@/types/workspace').TreeNode; path: string }> = []
  const walk = (n: import('@/types/workspace').TreeNode, path: string) => {
    const nextPath = n.name === '/' ? '/' : (path === '/' || !path ? `/${n.name}` : `${path}/${n.name}`)
    if (n.type === 'canvas') { out.push({ node: n, path: nextPath }) }
    for (const child of n.children || []) { walk(child, nextPath) }
  }
  walk(root, parentPath)
  return out
}

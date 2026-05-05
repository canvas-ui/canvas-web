import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'
import type {
  Canvas,
  CanvasQuerySpec,
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
// Canvas documents — list via the standard `GET /workspaces/:id/documents?context=<canvas-path>`.
// Workspace.list/search composes the canvas's querySpec server-side, so no canvas-specific docs
// service helper is needed.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Top-level /canvases convenience alias (read-only — canvas object lookup)
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

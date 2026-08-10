import { API_ROUTES, API_URL } from '@/config/api';
import { api } from '@/lib/api';
import type { Document as CanvasDocument, TreeNode, TimelineInfo, TimelineQueryInterval, TimelineQueryOptions } from '@/types/workspace';
// GLOBAL Workspace type from src/types/api.d.ts will be used.
// No local Workspace interface should be defined here.

export const DEFAULT_WORKSPACE_TREE_NAME = 'context'
export const BACKENDS_TREE_NAME = 'backends'

// Tree type from a well-known tree name. The pre-created trees are 'context'
// (context type), 'directory' and 'backends' (both directory type); custom
// trees should be resolved via listWorkspaceTrees instead.
export const treeTypeForName = (treeName?: string | null): 'context' | 'directory' =>
  treeName === 'directory' || treeName === BACKENDS_TREE_NAME ? 'directory' : 'context'

// Resolve an absolute tree path to its node. Returns null for the root path
// (which is the tree itself, not a node) and for any path that no longer exists.
export function findTreeNodeByPath(root: TreeNode | null, path: string): TreeNode | null {
  if (!root || path === '/') return null
  const segments = path.split('/').filter(Boolean)
  let node: TreeNode | undefined = root
  for (const seg of segments) {
    node = node?.children?.find(c => c.name === seg)
    if (!node) return null
  }
  return node ?? null
}

type WorkspaceTreeResponse = { payload: TreeNode; status: string; statusCode: number; message: string }

const workspaceTreeCache = new Map<string, WorkspaceTreeResponse>()
const workspaceTreeInflight = new Map<string, Promise<WorkspaceTreeResponse>>()

function appendWorkspaceContext(params: URLSearchParams, contextSpec: string = '/', treeName = DEFAULT_WORKSPACE_TREE_NAME, treeType: 'context' | 'directory' = 'context') {
  params.append('treeNameOrTreeId', treeName)
  params.append('treeType', treeType)
  if (contextSpec) params.append('context', contextSpec)
}

function appendAllOf(params: URLSearchParams, featureArray: string[] = []) {
  featureArray.filter(Boolean).forEach(feature => params.append('allOf', feature))
}

function appendAnyOf(params: URLSearchParams, anyOf: string[] = []) {
  anyOf.filter(Boolean).forEach(k => params.append('anyOf', k))
}

function appendNoneOf(params: URLSearchParams, noneOf: string[] = []) {
  noneOf.filter(Boolean).forEach(k => params.append('noneOf', k))
}

function appendFilters(params: URLSearchParams, filterArray: string[] = []) {
  filterArray.filter(Boolean).forEach(filter => params.append('filters', filter))
}

// Literal id-set constraint (lens camera/desktop refine): ANDs the listing
// down to these ids. Empty/absent appends nothing — the server treats an
// explicit [] as "match nothing", which is never what a filter UI means.
function appendIds(params: URLSearchParams, ids?: number[] | null) {
  for (const id of ids ?? []) params.append('ids', String(id))
}

// Append the text-query stack as repeated ?q params (server AND-narrows them);
// falls back to a single `q` for the legacy one-shot search shape.
function appendQueries(params: URLSearchParams, queries?: string[], q?: string) {
  const list = (queries && queries.length ? queries : (q ? [q] : []))
    .map(s => s.trim()).filter(Boolean)
  for (const s of list) { params.append('q', s) }
}

function getWorkspaceTreeBaseRoute(workspaceId: string, treeName = DEFAULT_WORKSPACE_TREE_NAME) {
  return `${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}`
}

function workspaceTreeCacheKey(workspaceId: string, treeName = DEFAULT_WORKSPACE_TREE_NAME) {
  return `${workspaceId}\0${treeName}`
}

function encodeTreePath(path: string) {
  return String(path || '/')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
}

function getWorkspaceTreePathRoute(workspaceId: string, treeName: string, path: string) {
  const encodedPath = encodeTreePath(path)
  return `${getWorkspaceTreeBaseRoute(workspaceId, treeName)}/path/${encodedPath}`
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const response = await api.get<{ payload: { workspace: Workspace } | Workspace }>(`${API_ROUTES.workspaces}/${id}`)
  const p = response.payload
  return (p && 'workspace' in p) ? p.workspace : p as Workspace
}

// listWorkspaces should return a Promise where Workspace is the global type.
export async function listWorkspaces(): Promise<Workspace[]> {
  try {
    // The API returns a ResponseObject with workspaces in the payload field
    const response = await api.get<{ payload: Workspace[]; message: string; status: string; statusCode: number }>(API_ROUTES.workspaces);

    // Ensure we always return an array even if the response structure is unexpected
    if (Array.isArray(response.payload)) {
      return response.payload;
    } else {
      console.warn('listWorkspaces: response.payload is not an array:', response.payload);
      return [];
    }
  } catch (error) {
    console.error('Failed to list workspaces:', error);
    throw error;
  }
}

// createWorkspace payload and response should align with the global Workspace type.
// Note: Global Workspace has owner, createdAt, updatedAt, status, type - some set by backend.
interface CreateWorkspacePayload {
    name: string;
    description?: string;
    color?: string;
    icon?: string | null;
    order?: number;
    label?: string;
    type?: string; // This aligns with optional 'type' in global Workspace
    // Folder structure, fixed at creation. Omitted => server default ('full').
    layout?: WorkspaceLayout;
}
export async function createWorkspace(payload: CreateWorkspacePayload): Promise<Workspace> {
  try {
    // The backend returns a ResponseObject with the workspace in the payload property
    const response = await api.post<{ payload: Workspace; message: string; status: string; statusCode: number }>(API_ROUTES.workspaces, payload);
    return response.payload;
  } catch (error) {
    console.error('Failed to create workspace:', error);
    throw error;
  }
}

// Pull a workspace from another canvas-server using a workspace share token.
// The server resolves the token remotely, exports the workspace there,
// downloads the archive and imports it as a local workspace.
export async function importWorkspaceFromRemote(url: string, token: string): Promise<Workspace> {
  try {
    const response = await api.post<{ payload: Workspace; message: string; status: string; statusCode: number }>(
      `${API_ROUTES.workspaces}/import`,
      { url, token }
    );
    return response.payload;
  } catch (error) {
    console.error('Failed to import workspace from remote:', error);
    throw error;
  }
}

export async function startWorkspace(id: string): Promise<Workspace> {
  try {
    const response = await api.post<{ payload: Workspace; message: string; status: string; statusCode: number }>(`${API_ROUTES.workspaces}/${id}/start`);
    return response.payload;
  } catch (error) {
    console.error('Failed to start workspace:', error);
    throw error;
  }
}

export async function stopWorkspace(id: string): Promise<Workspace> {
  try {
    const response = await api.post<{ payload: Workspace; message: string; status: string; statusCode: number }>(`${API_ROUTES.workspaces}/${id}/stop`);
    return response.payload;
  } catch (error) {
    console.error('Failed to stop workspace:', error);
    throw error;
  }
}


export async function removeWorkspace(id: string): Promise<Workspace> {
  try {
    const response = await api.delete<{ payload: Workspace; message: string; status: string; statusCode: number }>(`${API_ROUTES.workspaces}/${id}`);
    return response.payload;
  } catch (error) {
    console.error('Failed to remove workspace:', error);
    throw error;
  }
}



// List all trees for a workspace
export async function listWorkspaceTrees(workspaceId: string): Promise<any[]> {
  try {
    const res = await api.get<{ payload: any[] }>(`${API_ROUTES.workspaces}/${workspaceId}/trees`);
    return res.payload || [];
  } catch (error) {
    console.error(`Failed to list workspace trees ${workspaceId}:`, error);
    throw error;
  }
}

// Get workspace tree
export async function getWorkspaceTree(
  id: string
): Promise<{ payload: TreeNode; status: string; statusCode: number; message: string }> {
  try {
    return await api.get<{ payload: TreeNode; status: string; statusCode: number; message: string }>(
      getWorkspaceTreeBaseRoute(id)
    );
  } catch (error) {
    console.error(`Failed to get workspace tree ${id}:`, error);
    throw error;
  }
}

// Get a specific tree by name
export async function getWorkspaceTreeByName(
  workspaceId: string,
  treeName: string
): Promise<WorkspaceTreeResponse> {
  try {
    return await api.get<WorkspaceTreeResponse>(
      `${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}`
    );
  } catch (error) {
    console.error(`Failed to get workspace tree ${workspaceId}/${treeName}:`, error);
    throw error;
  }
}

export function invalidateWorkspaceTreeCache(workspaceId?: string, treeName?: string) {
  if (!workspaceId) {
    workspaceTreeCache.clear()
    workspaceTreeInflight.clear()
    return
  }
  if (!treeName) {
    const prefix = `${workspaceId}\0`
    for (const key of workspaceTreeCache.keys()) {
      if (key.startsWith(prefix)) workspaceTreeCache.delete(key)
    }
    for (const key of workspaceTreeInflight.keys()) {
      if (key.startsWith(prefix)) workspaceTreeInflight.delete(key)
    }
    return
  }
  const key = workspaceTreeCacheKey(workspaceId, treeName)
  workspaceTreeCache.delete(key)
  workspaceTreeInflight.delete(key)
}

// Where a filesystem-style delete parks orphaned documents. It has its own UI
// (Settings → Trash) and its own semantics; showing it as an ordinary folder in
// the tree would be a second door into it that bypasses both.
export const TRASH_PATH_NAME = '.trash'

function withoutTrashNode(node: TreeNode | null | undefined): TreeNode | null {
  if (!node) return null
  if (!Array.isArray(node.children)) return node
  return { ...node, children: node.children.filter(child => child?.name !== TRASH_PATH_NAME) }
}

export async function getCachedWorkspaceTreeByName(
  workspaceId: string,
  treeName: string,
  options: { force?: boolean } = {}
): Promise<WorkspaceTreeResponse> {
  const key = workspaceTreeCacheKey(workspaceId, treeName)
  if (!options.force && workspaceTreeCache.has(key)) {
    return workspaceTreeCache.get(key)!
  }
  if (!options.force && workspaceTreeInflight.has(key)) {
    return workspaceTreeInflight.get(key)!
  }

  const request = getWorkspaceTreeByName(workspaceId, treeName)
    .then((response) => {
      // Prune at the root only: `.trash` is a top-level path of the default
      // directory tree, and a user folder called `.trash` deeper in the tree is
      // theirs to see.
      const pruned = { ...response, payload: withoutTrashNode(response.payload) as TreeNode }
      workspaceTreeCache.set(key, pruned)
      return pruned
    })
    .finally(() => {
      workspaceTreeInflight.delete(key)
    })

  workspaceTreeInflight.set(key, request)
  return request
}

// Get workspace documents
export async function getWorkspaceDocuments(
  id: string,
  contextSpec: string = '/',
  featureArray: string[] = [],
  options: { limit?: number; offset?: number; page?: number; treeName?: string; treeType?: string; q?: string; queries?: string[]; anyOf?: string[]; noneOf?: string[]; filters?: string[]; ids?: number[] | null; scope?: 'path' | 'workspace'; sortBy?: string; order?: 'asc' | 'desc'; applyCanvasSpec?: boolean; debug?: boolean; debugLimit?: number } = {}
): Promise<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string; debug?: { distances?: Array<{ id: number; distance: number }>; imageDistances?: Array<{ id: number; distance: number }> } }> {
  try {
    const params = new URLSearchParams();
    const wholeWorkspace = options.scope === 'workspace'
    if (wholeWorkspace) params.append('scope', 'workspace')
    // Live canvas preview: opt out of server-side canvas querySpec folding so the
    // client's (toolbox) filters fully drive the read, incl. removing a filter.
    if (options.applyCanvasSpec === false) params.append('applyCanvasSpec', 'false')
    params.append('treeNameOrTreeId', options.treeName || DEFAULT_WORKSPACE_TREE_NAME)
    if (options.treeType) params.append('treeType', options.treeType)
    if (contextSpec && !wholeWorkspace) params.append('context', contextSpec)
    appendAllOf(params, featureArray)
    appendAnyOf(params, options.anyOf)
    appendNoneOf(params, options.noneOf)
    appendFilters(params, options.filters)
    appendIds(params, options.ids)
    if (options.limit !== undefined) params.append('limit', options.limit.toString());
    if (options.offset !== undefined) params.append('offset', options.offset.toString());
    if (options.page !== undefined) params.append('page', options.page.toString());
    // Timeline sort: server sorts the candidate set by the named timeline
    // (crud:created/crud:updated/content/…) then paginates. Default (no sortBy)
    // is id-desc ≈ newest-first.
    // Calibration aid: asks the server to attach raw (unfloored) image kNN
    // distances so the relevance floor can be picked from real numbers.
    if (options.debug) params.append('debug', 'true');
    if (options.debug && options.debugLimit) params.append('debugLimit', String(options.debugLimit));
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.order) params.append('order', options.order);
    appendQueries(params, options.queries, options.q);

    const queryString = params.toString();
    const url = `${API_ROUTES.workspaces}/${id}/documents${queryString ? '?' + queryString : ''}`;

    return await api.get<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string; debug?: { distances?: Array<{ id: number; distance: number }>; imageDistances?: Array<{ id: number; distance: number }> } }>(url);
  } catch (error) {
    console.error(`Failed to get workspace documents ${id}:`, error);
    throw error;
  }
}

// List documents visible on a canvas path. Uses the workspace documents endpoint
// so parent-layer AND semantics apply and the canvas leaf's querySpec is composed
// server-side — do NOT use getWorkspaceLayerDocuments with the canvas layer id.
export async function getCanvasPathDocuments(
  id: string,
  path: string,
  treeName = DEFAULT_WORKSPACE_TREE_NAME,
  options: { limit?: number; offset?: number; page?: number; q?: string; queries?: string[]; allOf?: string[]; anyOf?: string[]; noneOf?: string[]; filters?: string[]; ids?: number[] | null; sortBy?: string; order?: 'asc' | 'desc'; applyCanvasSpec?: boolean } = {}
): Promise<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string }> {
  const treeType = treeName === 'directory' ? 'directory' : 'context'
  return getWorkspaceDocuments(id, path, options.allOf || [], {
    treeName,
    treeType,
    limit: options.limit,
    page: options.page,
    offset: options.offset,
    q: options.q,
    queries: options.queries,
    anyOf: options.anyOf,
    noneOf: options.noneOf,
    filters: options.filters,
    sortBy: options.sortBy,
    order: options.order,
    applyCanvasSpec: options.applyCanvasSpec,
  })
}

export async function getWorkspaceLayerDocuments(
  id: string,
  treeName: string,
  layerId: string,
  options: { limit?: number; offset?: number; page?: number; q?: string; queries?: string[]; allOf?: string[]; anyOf?: string[]; noneOf?: string[]; filters?: string[]; ids?: number[] | null; sortBy?: string; order?: 'asc' | 'desc' } = {}
): Promise<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string }> {
  try {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.append('limit', options.limit.toString());
    if (options.offset !== undefined) params.append('offset', options.offset.toString());
    if (options.page !== undefined) params.append('page', options.page.toString());
    appendQueries(params, options.queries, options.q);
    appendAllOf(params, options.allOf);
    appendAnyOf(params, options.anyOf);
    appendNoneOf(params, options.noneOf);
    appendFilters(params, options.filters);
    appendIds(params, options.ids);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.order) params.append('order', options.order);
    const queryString = params.toString();
    const url = `${API_ROUTES.workspaces}/${id}/trees/${encodeURIComponent(treeName)}/layers/${encodeURIComponent(layerId)}/documents${queryString ? '?' + queryString : ''}`;
    return await api.get<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string; debug?: { distances?: Array<{ id: number; distance: number }>; imageDistances?: Array<{ id: number; distance: number }> } }>(url);
  } catch (error) {
    console.error(`Failed to get workspace layer documents ${id}/${treeName}/${layerId}:`, error);
    throw error;
  }
}

export async function updateWorkspace(id: string, payload: Partial<CreateWorkspacePayload>): Promise<Workspace> {
  try {
    const response = await api.patch<{ payload: Workspace; message: string; status: string; statusCode: number }>(`${API_ROUTES.workspaces}/${id}`, payload);
    return response.payload;
  } catch (error) {
    console.error('Failed to update workspace:', error);
    throw error;
  }
}

// Workspace tree operations
export async function insertWorkspacePath(workspaceId: string, path: string, autoCreateLayers = true, treeName = DEFAULT_WORKSPACE_TREE_NAME, type: 'context' | 'canvas' = 'context'): Promise<boolean> {
  try {
    await api.put<{ payload: unknown; message: string; status: string; statusCode: number }>(
      getWorkspaceTreePathRoute(workspaceId, treeName, path),
      { type, autoCreateLayers }
    );
    return true;
  } catch (error) {
    console.error(`Failed to insert workspace path ${path}:`, error);
    throw error;
  }
}

export async function createWorkspaceCanvas(workspaceId: string, path: string, treeName = DEFAULT_WORKSPACE_TREE_NAME, options: { querySpec?: object; metadata?: object } = {}): Promise<boolean> {
  try {
    await api.put<{ payload: unknown; message: string; status: string; statusCode: number }>(
      getWorkspaceTreePathRoute(workspaceId, treeName, path),
      { type: 'canvas', ...options }
    )
    return true
  } catch (error) {
    console.error(`Failed to create workspace canvas ${path}:`, error)
    throw error
  }
}

// Persist a canvas' UI state (widget layout + config) into its layer metadata.
// The caller passes the full, already-merged metadata object so sibling keys
// (e.g. metadata.toolbox) are preserved regardless of server merge semantics.
// `querySpec` is optional: pass it to bake a widget-configured view order (sort)
// into the canvas so the frozen view — folder listing and public shares — sorts
// the same way. Omit to leave the stored querySpec untouched.
export async function saveCanvasUi(workspaceId: string, path: string, treeName: string, metadata: Record<string, unknown>, querySpec?: Record<string, unknown>): Promise<boolean> {
  const body: Record<string, unknown> = { metadata }
  if (querySpec) body.querySpec = querySpec
  await api.patch(getWorkspaceTreePathRoute(workspaceId, treeName, path), body)
  return true
}

export async function createPublicCanvasShare(workspaceId: string, path: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<{ code: string; url: string }> {
  const response = await api.post<{ payload: { code: string; url: string } }>(
    `${API_URL}/pub/c`,
    { workspaceId, path, treeName }
  )
  return response.payload
}

export async function getPublicCanvasShare(workspaceId: string, path: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<{ code: string; url: string } | null> {
  const params = new URLSearchParams({ workspaceId, path, treeName })
  const response = await api.get<{ payload: { code: string; url: string } | null }>(
    `${API_URL}/pub/c?${params.toString()}`
  )
  return response.payload
}

export async function deletePublicCanvasShare(code: string): Promise<boolean> {
  await api.delete<{ payload: boolean }>(`${API_URL}/pub/c/${encodeURIComponent(code)}`)
  return true
}

export interface WorkspacePublicCanvasShare {
  type: 'public-canvas'
  code: string
  url: string
  workspaceId: string
  owner: string
  treeName: string
  treeType: string
  path: string
  layerId: string
  createdAt: string
  locked: boolean
  lockedBy: string[]
  canvas: {
    id: string
    name: string
    label?: string
    description?: string
    color?: string | null
    locked: boolean
    lockedBy: string[]
  } | null
}

export async function listWorkspaceShares(workspaceId: string): Promise<{ publicCanvasShares: WorkspacePublicCanvasShare[]; emailShares: any[] }> {
  const response = await api.get<{ payload: { publicCanvasShares?: WorkspacePublicCanvasShare[]; emailShares?: any[] } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/shares`
  )
  return {
    publicCanvasShares: response.payload?.publicCanvasShares || [],
    emailShares: response.payload?.emailShares || [],
  }
}

export async function revokeWorkspacePublicCanvasShare(workspaceId: string, code: string): Promise<boolean> {
  await api.delete<{ payload: boolean }>(
    `${API_ROUTES.workspaces}/${workspaceId}/shares/public-canvas/${encodeURIComponent(code)}`
  )
  return true
}

export async function updateWorkspacePath(workspaceId: string, path: string, updates: Record<string, unknown>, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<boolean> {
  try {
    await api.patch<{ payload: unknown; message: string; status: string; statusCode: number }>(
      getWorkspaceTreePathRoute(workspaceId, treeName, path),
      updates
    )
    return true
  } catch (error) {
    console.error(`Failed to update workspace path ${path}:`, error)
    throw error
  }
}

// `purge` only has an effect inside the backends tree:
// it deletes the documents under the folder from the index ("Remove and purge").
// `destroy` (implies purge) additionally deletes the mirrored resources ON the
// backend (rw backends only). Elsewhere (and by default) the documents are
// kept — only the folder is dropped.
export async function removeWorkspacePath(workspaceId: string, path: string, recursive = false, treeName = DEFAULT_WORKSPACE_TREE_NAME, purge = false, destroy = false): Promise<boolean> {
  try {
    const params = new URLSearchParams({ recursive: recursive.toString() });
    if (purge) params.set('purge', 'true');
    if (destroy) params.set('destroy', 'true');
    await api.delete<{ payload: unknown; message: string; status: string; statusCode: number }>(
      `${getWorkspaceTreePathRoute(workspaceId, treeName, path)}?${params.toString()}`
    );
    return true;
  } catch (error) {
    console.error(`Failed to remove workspace path ${path}:`, error);
    throw error;
  }
}

export async function moveWorkspacePath(workspaceId: string, fromPath: string, toPath: string, recursive = false, treeName = DEFAULT_WORKSPACE_TREE_NAME, targetTreeName?: string): Promise<boolean> {
  try {
    await api.patch<{ payload: unknown; message: string; status: string; statusCode: number }>(
      getWorkspaceTreePathRoute(workspaceId, treeName, fromPath),
      { to: toPath, recursive, ...(targetTreeName && targetTreeName !== treeName ? { targetTreeNameOrTreeId: targetTreeName } : {}) }
    );
    return true;
  } catch (error) {
    console.error(`Failed to move workspace path from ${fromPath} to ${toPath}:`, error);
    throw error;
  }
}

export async function copyWorkspacePath(workspaceId: string, fromPath: string, toPath: string, recursive = false, treeName = DEFAULT_WORKSPACE_TREE_NAME, targetTreeName?: string): Promise<boolean> {
  try {
    await api.post<{ payload: unknown; message: string; status: string; statusCode: number }>(
      getWorkspaceTreePathRoute(workspaceId, treeName, fromPath),
      { to: toPath, recursive, ...(targetTreeName && targetTreeName !== treeName ? { targetTreeNameOrTreeId: targetTreeName } : {}) }
    );
    return true;
  } catch (error) {
    console.error(`Failed to copy workspace path from ${fromPath} to ${toPath}:`, error);
    throw error;
  }
}

export async function pasteDocumentsToWorkspacePath(workspaceId: string, path: string, documentIds: number[], treeName = DEFAULT_WORKSPACE_TREE_NAME, treeType: 'context' | 'directory' = 'context'): Promise<boolean> {
  try {
    const ids = normalizeDocumentIds(Array.isArray(documentIds) ? documentIds : [documentIds])
    await api.post<{ payload: unknown; message: string; status: string; statusCode: number }>(
      `${API_ROUTES.workspaces}/${workspaceId}/documents`,
      { documentIds: ids, treeNameOrTreeId: treeName, treeType, context: path }
    );
    return true;
  } catch (error) {
    console.error(`Failed to paste documents to workspace path ${path}:`, error);
    throw error;
  }
}

// Returns the created document ids — callers that need to link the same
// document into additional paths (multi-select Save/Link To) reuse the id
// instead of re-creating the document.
export async function importDocumentsToWorkspacePath(workspaceId: string, path: string, documents: unknown[], treeName = DEFAULT_WORKSPACE_TREE_NAME, treeType: 'context' | 'directory' = 'context'): Promise<number[]> {
  try {
    const docs = Array.isArray(documents) ? documents : [documents]
    const response = await api.post<{ payload: number[]; message: string; status: string; statusCode: number }>(
      `${API_ROUTES.workspaces}/${workspaceId}/documents`,
      { documents: docs, treeNameOrTreeId: treeName, treeType, context: path }
    );
    return Array.isArray(response.payload) ? response.payload : [];
  } catch (error) {
    console.error(`Failed to import documents to workspace path ${path}:`, error);
    throw error;
  }
}

// Layers API
export interface Layer {
  id: string;
  type: string;
  name: string;
  label: string;
  description: string;
  color: string | null;
  locked?: boolean;
  lockedBy?: string[];
}

export async function listWorkspaceLayers(workspaceId: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<Layer[]> {
  const res = await api.get<{ payload: Layer[] }>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers`)
  return res.payload || []
}

export async function getWorkspaceLayer(workspaceId: string, layerId: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<Layer> {
  const res = await api.get<{ payload: Layer }>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/${layerId}`)
  return res.payload
}

export async function renameWorkspaceLayer(workspaceId: string, layerId: string, newName: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<Layer> {
  const res = await api.patch<{ payload: Layer }>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/${layerId}`, { name: newName })
  return res.payload
}

export async function lockWorkspaceLayer(workspaceId: string, layerId: string, lockBy: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<boolean> {
  await api.post(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/${layerId}/lock`, { lockBy })
  return true
}

export async function unlockWorkspaceLayer(workspaceId: string, layerId: string, lockBy: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<boolean> {
  await api.post(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/${layerId}/unlock`, { lockBy })
  return true
}

export async function destroyWorkspaceLayer(workspaceId: string, layerId: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<boolean> {
  await api.delete(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/${layerId}`)
  return true
}

export async function mergeWorkspaceLayer(workspaceId: string, layerId: string, targetLayers: string[], treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<any> {
  const res = await api.post<{ payload: any }>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/merge`, { layerId, targetLayers })
  return res.payload
}

export async function subtractWorkspaceLayer(workspaceId: string, layerId: string, targetLayers: string[], treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<any> {
  const res = await api.post<{ payload: any }>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/subtract`, { layerId, targetLayers })
  return res.payload
}

// ─────────────────────────────────────────────────────────────────────────
// Workspace documents
// ─────────────────────────────────────────────────────────────────────────

function normalizeDocumentIds(documentIds: readonly (string | number)[]): number[] {
  const ids = documentIds.map((v) => (typeof v === 'number' ? v : Number(v)))
  if (ids.some((n) => !Number.isFinite(n))) {
    throw new Error(`Invalid document ID(s): expected numbers (or numeric strings), got ${JSON.stringify(documentIds)}`)
  }
  return ids
}

/**
 * Detach documents from a path.
 *
 * `trashIfOrphaned` applies the same rule the mounts use: if this removes a
 * document's LAST placement it goes to the trash instead of becoming reachable
 * only through the whole-workspace list. Pass it for a user-initiated remove;
 * leave it off for the source half of a move (the document is already filed at
 * the destination, so it is not orphaned anyway).
 */
export async function removeWorkspaceDocuments(
  workspaceId: string,
  documentIds: readonly (string | number)[],
  contextSpec: string = '/',
  featureArray: string[] = [],
  treeName = DEFAULT_WORKSPACE_TREE_NAME,
  treeType: 'context' | 'directory' = 'context',
  options: { trashIfOrphaned?: boolean } = {}
): Promise<boolean> {
  const params = new URLSearchParams()
  appendWorkspaceContext(params, contextSpec, treeName, treeType)
  appendAllOf(params, featureArray)
  if (options.trashIfOrphaned) params.append('trashIfOrphaned', 'true')
  const ids = normalizeDocumentIds(documentIds)
  await api.delete(`${API_ROUTES.workspaces}/${workspaceId}/documents/remove?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids),
  })
  return true
}

export async function deleteWorkspaceDocuments(
  workspaceId: string,
  documentIds: readonly (string | number)[],
  contextSpec: string = '/',
  featureArray: string[] = [],
  treeName = DEFAULT_WORKSPACE_TREE_NAME,
  treeType: 'context' | 'directory' = 'context'
): Promise<boolean> {
  const params = new URLSearchParams()
  appendWorkspaceContext(params, contextSpec, treeName, treeType)
  appendAllOf(params, featureArray)
  const ids = normalizeDocumentIds(documentIds)
  await api.delete(`${API_ROUTES.workspaces}/${workspaceId}/documents?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids),
  })
  return true
}

export interface DestroyResult {
  successful: { id: number; deleted: string[]; droppedRefs: string[]; kept: string[]; docDeleted: boolean }[]
  failed: { id: number; reason: string }[]
}

export async function updateWorkspaceDocument(
  workspaceId: string,
  document: { id: number; schema: string; schemaVersion: string; data?: Record<string, any>; metadata?: Record<string, any>; comment?: string }
): Promise<boolean> {
  await api.put<{ payload: unknown }>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents`,
    { documents: [document] }
  )
  return true
}

export async function destroyWorkspaceDocuments(
  workspaceId: string,
  documentIds: readonly (string | number)[],
  options: { urls?: string[]; keepDocument?: boolean } = {}
): Promise<DestroyResult> {
  const ids = normalizeDocumentIds(documentIds)
  const body: Record<string, unknown> = { documentIds: ids }
  if (options.urls) body.urls = options.urls
  if (options.keepDocument) body.keepDocument = true
  const response = await api.delete<{ payload: DestroyResult }>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/destroy`,
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  return response.payload
}

// ── Document sub-resources (object properties card) ─────────────────────────

export interface DocumentLocationInfo {
  url: string
  scheme?: string
  backend?: string
  kind: 'stored' | 'workspace-file' | 'imap' | 'readonly' | 'unknown' | string
  deletable: boolean
}

export async function getDocumentLocations(workspaceId: string, documentId: number | string): Promise<DocumentLocationInfo[]> {
  const response = await api.get<{ payload: DocumentLocationInfo[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/locations`
  )
  return response.payload || []
}

export interface DocumentTreeMembership {
  tree: string
  treeId: string
  type: 'context' | 'directory' | string
  paths: string[]
}

export async function getDocumentMemberships(
  workspaceId: string,
  documentId: number | string,
  tree?: string
): Promise<DocumentTreeMembership[]> {
  const qs = tree ? `?tree=${encodeURIComponent(tree)}` : ''
  const response = await api.get<{ payload: { documentId: number; memberships: DocumentTreeMembership[] } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/memberships${qs}`
  )
  return response.payload?.memberships || []
}

function buildContentApiPath(workspaceId: string, documentId: number | string, opts: { download?: boolean; url?: string } = {}): string {
  const params = new URLSearchParams()
  if (opts.download) params.set('download', '1')
  // Target a specific location/attachment URL (must belong to the document).
  if (opts.url) params.set('url', opts.url)
  const qs = params.toString()
  return `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/content${qs ? `?${qs}` : ''}`
}

/** Authed fetch of the on-demand server thumbnail (image docs only). */
export async function fetchDocumentThumbnail(workspaceId: string, documentId: number | string, size = 256): Promise<{ blob: Blob; mime: string }> {
  const token = localStorage.getItem('authToken')
  const res = await fetch(`${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/thumbnail?size=${size}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mime = res.headers.get('content-type') || 'image/webp'
  return { blob: await res.blob(), mime }
}

/**
 * Fetch document bytes with bearer auth and wrap them in a blob: URL safe
 * to drop into <img>, <audio>, <video>, <iframe>. Caller is responsible for
 * calling URL.revokeObjectURL when the URL is no longer needed.
 */
export async function fetchDocumentBlob(workspaceId: string, documentId: number | string, opts: { url?: string } = {}): Promise<{ blob: Blob; mime: string }> {
  const token = localStorage.getItem('authToken')
  const res = await fetch(buildContentApiPath(workspaceId, documentId, opts), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mime = res.headers.get('content-type') || 'application/octet-stream'
  return { blob: await res.blob(), mime }
}

export async function fetchDocumentBlobUrl(workspaceId: string, documentId: number | string, opts: { url?: string } = {}): Promise<{ url: string; mime: string; size: number }> {
  const { blob, mime } = await fetchDocumentBlob(workspaceId, documentId, opts)
  return { url: URL.createObjectURL(blob), mime, size: blob.size }
}

/**
 * Direct, range-streamable content URL for a media element (<video>/<audio>).
 * Auth rides on the short-lived media cookie minted by requestContentTicket —
 * a media element can't send an Authorization header, so we never put a token
 * in this URL. Requires the ticket to have been minted first.
 */
export function documentStreamUrl(workspaceId: string, documentId: number | string, opts: { url?: string } = {}): string {
  return buildContentApiPath(workspaceId, documentId, opts)
}

/**
 * Mint the short-lived, HttpOnly media cookie so a subsequent <video>/<audio>
 * GET to documentStreamUrl authenticates via the cookie. `credentials:'include'`
 * lets the browser store the Set-Cookie (same-origin API).
 */
export async function requestContentTicket(workspaceId: string, documentId: number | string): Promise<boolean> {
  const token = localStorage.getItem('authToken')
  const res = await fetch(`${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/content-ticket`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  })
  return res.ok
}

/**
 * Stream the document bytes to disk via the browser's download UI. Uses the
 * authed fetch + blob roundtrip so no token ever appears in the URL.
 */
export async function downloadDocument(workspaceId: string, documentId: number | string, filename: string, opts: { url?: string } = {}): Promise<void> {
  const token = localStorage.getItem('authToken')
  const res = await fetch(buildContentApiPath(workspaceId, documentId, { download: true, url: opts.url }), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function purgeWorkspaceDocuments(
  workspaceId: string,
  contextSpec: string = '/',
  featureArray: string[] = [],
  filterArray: string[] = [],
  _options: Record<string, never> = {},
  treeName: string = DEFAULT_WORKSPACE_TREE_NAME
): Promise<{ requested: number; deleted: number }> {
  const params = new URLSearchParams()
  // Send the tree NAME only (no treeType): the server resolves the type from the
  // name, which also works for virtual directory trees. Omitting treeName here was
  // why "Purge All" silently no-op'd on directory trees (defaulted to context).
  params.append('treeNameOrTreeId', treeName)
  if (contextSpec) params.append('context', contextSpec)
  appendAllOf(params, featureArray)
  appendFilters(params, filterArray)
  const response = await api.delete<{ payload: { requested: number; deleted: number } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/purge?${params.toString()}`
  )
  return response.payload
}

// ─────────────────────────────────────────────────────────────────────────
// Workspace Services API
// ─────────────────────────────────────────────────────────────────────────

export interface WorkspaceServiceStatus {
  enabled: boolean;
  initialized?: boolean;
  path?: string;
  transports?: string[];
  backend?: string;
  mailboxCount?: number;
  activeMailboxCount?: number;
}

export interface WorkspaceServicesStatus {
  dotfiles: WorkspaceServiceStatus;
  git?: WorkspaceServiceStatus;
  home?: WorkspaceServiceStatus;
  webdav?: WorkspaceServiceStatus;
  imap?: WorkspaceServiceStatus;
  imapSync?: WorkspaceServiceStatus;
}

/**
 * Get status of all services for a workspace
 */
export async function getWorkspaceServicesStatus(workspaceId: string): Promise<WorkspaceServicesStatus> {
  try {
    const response = await api.get<{ payload: WorkspaceServicesStatus }>(`${API_ROUTES.workspaces}/${workspaceId}/services`);
    return response.payload;
  } catch (error) {
    console.error(`Failed to get workspace services status:`, error);
    throw error;
  }
}

/**
 * Enable a service for a workspace
 */
export async function enableWorkspaceService(
  workspaceId: string,
  serviceName: 'dotfiles' | 'git' | 'home' | 'webdav' | 'imap' | 'imapSync'
): Promise<{ success: boolean; path?: string }> {
  try {
    const response = await api.post<{ payload: { success: boolean; path?: string } }>(
      `${API_ROUTES.workspaces}/${workspaceId}/services/${serviceName}/enable`
    );
    return response.payload;
  } catch (error) {
    console.error(`Failed to enable ${serviceName} service:`, error);
    throw error;
  }
}

/**
 * Disable a service for a workspace
 */
export async function disableWorkspaceService(
  workspaceId: string,
  serviceName: 'dotfiles' | 'git' | 'home' | 'webdav' | 'imap' | 'imapSync'
): Promise<{ success: boolean }> {
  try {
    const response = await api.post<{ payload: { success: boolean } }>(
      `${API_ROUTES.workspaces}/${workspaceId}/services/${serviceName}/disable`
    );
    return response.payload;
  } catch (error) {
    console.error(`Failed to disable ${serviceName} service:`, error);
    throw error;
  }
}

// ─── Unified backend/connector API (/:id/backends) ──────────────────────────
// One surface over storage backends (file/cacache/s3) and message connectors
// (imap accounts), mirroring the backends tree (/<anchor>/<address>). Supersedes
// the data-backends + services/imap split; driver dispatch is server-side.

export interface BackendCapabilities {
  sync: boolean;
  test: boolean;
  containers: boolean;
  mutableContainers: boolean;
  deleteObject: boolean;
}

export interface BackendContainer {
  name: string;
  mailboxId?: string;
  enabled?: boolean;
  status?: string;
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export interface BackendDiskUsage {
  backend: string;
  bytes: number;
  computedAt: string;
}

export interface WorkspaceDiskUsage {
  workspaceId: string;
  bytes: number;
  // Per top-level directory of the workspace root (db, data, home, cache, …).
  breakdown: Record<string, number>;
  computedAt: string;
}

export interface Backend {
  driver: string;
  address: string;
  kind: 'storage' | 'messages' | 'hybrid';
  enabled: boolean;
  status: 'running' | 'idle' | 'stopped' | 'error' | 'syncing' | string;
  // Live resync state (initial/catch-up scan running in the background).
  resyncing?: boolean;
  progress?: { scanned: number; total: number | null } | null;
  lastSyncAt: string | null;
  lastError: string | null;
  // Mirror node in the backends tree (/device/<device>/<mount> for fs mounts).
  treePath?: string | null;
  // Last on-demand disk usage, if computed this server runtime.
  usage?: BackendDiskUsage | null;
  capabilities: BackendCapabilities;
  containers?: BackendContainer[];
  config?: Record<string, unknown>;
}

const backendsBase = (workspaceId: string) => `${API_ROUTES.workspaces}/${workspaceId}/backends`;
const backendPath = (workspaceId: string, driver: string, address: string) =>
  `${backendsBase(workspaceId)}/${encodeURIComponent(driver)}/${encodeURIComponent(address)}`;

export async function listBackends(workspaceId: string, driver?: string): Promise<Backend[]> {
  const url = driver ? `${backendsBase(workspaceId)}/${encodeURIComponent(driver)}` : backendsBase(workspaceId);
  const response = await api.get<{ payload: Backend[] }>(url);
  return response.payload || [];
}

export async function getBackend(workspaceId: string, driver: string, address: string): Promise<Backend> {
  const response = await api.get<{ payload: Backend }>(backendPath(workspaceId, driver, address));
  return response.payload;
}

// On-demand on-disk size of a local storage backend. Walks the backend root
// server-side — potentially slow on large trees, so only call on user action.
export async function getBackendDiskUsage(workspaceId: string, driver: string, address: string): Promise<BackendDiskUsage> {
  const response = await api.get<{ payload: BackendDiskUsage }>(`${backendPath(workspaceId, driver, address)}/usage`);
  return response.payload;
}

// Wipe the on-demand thumbnail cache (derived artifacts — regenerated on
// demand, always safe to clear).
export async function clearThumbnailCache(workspaceId: string): Promise<{ removed: number }> {
  const response = await api.delete<{ payload: { removed: number } }>(`${API_ROUTES.workspaces}/${workspaceId}/thumbnails`);
  return response.payload;
}

// On-demand on-disk size of the whole workspace root (per-dir breakdown
// included) — the export/sync planning number. Slow on large workspaces.
export async function getWorkspaceDiskUsage(workspaceId: string): Promise<WorkspaceDiskUsage> {
  const response = await api.get<{ payload: WorkspaceDiskUsage }>(`${API_ROUTES.workspaces}/${workspaceId}/usage`);
  return response.payload;
}

// Human-readable byte size (1024-based, one decimal above KB).
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 'B'
  for (const next of units) {
    if (value < 1024) break
    value /= 1024
    unit = next
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`
}

export async function addBackend(workspaceId: string, driver: string, config: Record<string, unknown>): Promise<Backend> {
  const response = await api.post<{ payload: Backend }>(`${backendsBase(workspaceId)}/${encodeURIComponent(driver)}`, config);
  return response.payload;
}

export async function updateBackend(workspaceId: string, driver: string, address: string, patch: Record<string, unknown>): Promise<Backend> {
  const response = await api.patch<{ payload: Backend }>(backendPath(workspaceId, driver, address), patch);
  return response.payload;
}

export async function removeBackend(workspaceId: string, driver: string, address: string): Promise<{ removed: boolean }> {
  const response = await api.delete<{ payload: { removed: boolean } }>(backendPath(workspaceId, driver, address));
  return response.payload;
}

export async function syncBackend(workspaceId: string, driver: string, address: string): Promise<unknown> {
  const response = await api.post<{ payload: unknown }>(`${backendPath(workspaceId, driver, address)}/sync`);
  return response.payload;
}

// Stop an in-flight resync. The server aborts the walk at the next file;
// already-indexed files stay indexed and a later sync resumes cheaply via the
// checksum cache — so stop + later re-sync behaves like pause/resume.
export async function cancelBackendSync(workspaceId: string, driver: string, address: string): Promise<unknown> {
  const response = await api.post<{ payload: unknown }>(`${backendPath(workspaceId, driver, address)}/sync/cancel`);
  return response.payload;
}

export async function testBackend(workspaceId: string, driver: string, address: string): Promise<unknown> {
  const response = await api.post<{ payload: unknown }>(`${backendPath(workspaceId, driver, address)}/test`);
  return response.payload;
}

export async function listBackendContainers(workspaceId: string, driver: string, address: string): Promise<BackendContainer[]> {
  const response = await api.get<{ payload: BackendContainer[] }>(`${backendPath(workspaceId, driver, address)}/containers`);
  return response.payload || [];
}

export async function syncBackendContainer(workspaceId: string, driver: string, address: string, name: string): Promise<unknown> {
  const response = await api.post<{ payload: unknown }>(`${backendPath(workspaceId, driver, address)}/containers/${encodeURIComponent(name)}/sync`);
  return response.payload;
}

// Connector folders (imap boxes, …) — used for the subscribe picker.
export interface BackendFolder {
  name: string;
  path: string;
  delimiter: string;
  selectable: boolean;
  attributes: string[];
}

// ?available=1 lists folders that can still be subscribed (server-side).
export async function listBackendFoldersAvailable(workspaceId: string, driver: string, address: string): Promise<BackendFolder[]> {
  const response = await api.get<{ payload: BackendFolder[] }>(`${backendPath(workspaceId, driver, address)}/containers?available=1`);
  return response.payload || [];
}

export async function addBackendContainers(workspaceId: string, driver: string, address: string, folders: string[]): Promise<unknown> {
  const response = await api.post<{ payload: unknown }>(`${backendPath(workspaceId, driver, address)}/containers`, { folders });
  return response.payload;
}

export async function removeBackendContainer(workspaceId: string, driver: string, address: string, name: string): Promise<{ removed: boolean }> {
  const response = await api.delete<{ payload: { removed: boolean } }>(`${backendPath(workspaceId, driver, address)}/containers/${encodeURIComponent(name)}`);
  return response.payload;
}

// Rename/move a container (file-backend folder). `name` is the current key, the
// body carries the new name/key. Returns the new key.
export async function renameBackendContainer(workspaceId: string, driver: string, address: string, name: string, newName: string): Promise<unknown> {
  const response = await api.patch<{ payload: unknown }>(`${backendPath(workspaceId, driver, address)}/containers/${encodeURIComponent(name)}`, { name: newName });
  return response.payload;
}

// Match a backends-tree node path to a known backend by its server-provided
// mirror node (treePath) — required for device-scoped fs mounts, whose nodes
// are /device/<device>/<mount> (three segments, not two). Returns the backend
// and the sub-path below its node, or null.
function matchBackendByTreePath(path: string, backends?: Backend[]): { backend: Backend; key: string } | null {
  if (!backends?.length) return null;
  const clean = '/' + String(path || '').split('/').filter(Boolean).join('/');
  for (const backend of backends) {
    if (!backend.treePath) continue;
    if (clean === backend.treePath) return { backend, key: '' };
    if (clean.startsWith(backend.treePath + '/')) return { backend, key: clean.slice(backend.treePath.length + 1) };
  }
  return null;
}

// Parse a backends-tree /file/<address>/<sub…> node to its folder target.
// key === '' means the backend root node (can create children, but not rename/delete).
// Pass the workspace's backends when available — device-scoped mounts
// (/device/<device>/<mount>) can only be resolved via their treePath.
export function backendFolderTarget(path: string, backends?: Backend[]): { driver: string; address: string; key: string } | null {
  const match = matchBackendByTreePath(path, backends);
  if (match) {
    if (match.backend.driver !== 'file') return null;
    return { driver: 'file', address: match.backend.address, key: match.key };
  }
  // Structural fallback for the anchor-first grammar (and the legacy
  // driver-first /file/<address> form) when no backends list is at hand.
  const parts = String(path || '').split('/').filter(Boolean);
  if (parts[0] === 'workspace' && parts.length >= 2) return { driver: 'file', address: `workspace:${parts[1]}`, key: parts.slice(2).join('/') };
  if (parts[0] === 'device' && parts.length >= 3) return { driver: 'file', address: parts[2], key: parts.slice(3).join('/') };
  if (parts[0] === 'file' && parts.length >= 2) return { driver: 'file', address: parts[1], key: parts.slice(2).join('/') };
  return null;
}

// Documents mirrored under a backend address, filtered by linkage into other
// trees. linked=false → present ONLY on the backend, never filed into any
// context/directory tree (safe-to-purge candidates); linked=true → the
// inverse; undefined → everything under the address.
export async function listBackendDocuments(
  workspaceId: string,
  driver: string,
  address: string,
  options: { linked?: boolean; limit?: number; offset?: number } = {},
): Promise<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number }> {
  const params = new URLSearchParams()
  if (options.linked !== undefined) params.append('linked', String(options.linked))
  if (options.limit !== undefined) params.append('limit', String(options.limit))
  if (options.offset !== undefined) params.append('offset', String(options.offset))
  const qs = params.toString()
  return await api.get(`${backendPath(workspaceId, driver, address)}/documents${qs ? `?${qs}` : ''}`)
}

// Pre-create folder discovery for the "add account" flow (no instance yet).
export async function discoverBackendFolders(workspaceId: string, driver: string, config: Record<string, unknown>): Promise<BackendFolder[]> {
  const response = await api.post<{ payload: BackendFolder[] }>(`${backendsBase(workspaceId)}/${encodeURIComponent(driver)}/discover`, config);
  return response.payload || [];
}

// Parse a backends-tree /<driver>/<address>/… node path to its addressable
// (driver, address) pair. Returns null for the tree root / driver level.
// Pass the workspace's backends when available — device-scoped mounts
// (/device/<device>/<mount>) can only be resolved via their treePath.
export function backendAddressFromTreePath(path: string, backends?: Backend[]): { driver: string; address: string } | null {
  const match = matchBackendByTreePath(path, backends);
  if (match) return { driver: match.backend.driver, address: match.backend.address };
  // Structural fallback for the anchor-first grammar; connector paths
  // (/imap/<account>/…) keep driver-first shape.
  const parts = String(path || '').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  if (parts[0] === 'workspace') return { driver: 'file', address: `workspace:${parts[1]}` };
  if (parts[0] === 'device') return parts.length >= 3 ? { driver: 'file', address: parts[2] } : null;
  return { driver: parts[0], address: parts[1] };
}

export interface WorkspaceHookFile {
  path: string;
  size?: number;
  modifiedAt?: string;
}

export async function listWorkspaceHooks(workspaceId: string): Promise<WorkspaceHookFile[]> {
  const response = await api.get<{ payload: WorkspaceHookFile[] }>(`${API_ROUTES.workspaces}/${workspaceId}/hooks`);
  return response.payload || [];
}

export async function getWorkspaceHook(workspaceId: string, hookPath: string): Promise<{ path: string; content: string }> {
  const response = await api.get<{ payload: { path: string; content: string } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/hooks/${encodeURIComponent(hookPath).replace(/%2F/g, '/')}`
  );
  return response.payload;
}

export async function saveWorkspaceHook(workspaceId: string, hookPath: string, content: string): Promise<{ path: string }> {
  const response = await api.put<{ payload: { path: string } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/hooks/${encodeURIComponent(hookPath).replace(/%2F/g, '/')}`,
    { content }
  );
  return response.payload;
}

export async function deleteWorkspaceHook(workspaceId: string, hookPath: string): Promise<{ path: string }> {
  const response = await api.delete<{ payload: { path: string } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/hooks/${encodeURIComponent(hookPath).replace(/%2F/g, '/')}`
  );
  return response.payload;
}

// ─── Bitmaps ────────────────────────────────────────────────────────────────

// Prefixes that are structural/internal and not shown to users in the toolbox.
const EXCLUDED_BITMAP_PREFIXES = ['internal/', 'context/', 'vfs/']

export async function listWorkspaceBitmaps(workspaceId: string): Promise<string[]> {
  try {
    const response = await api.get<{ payload: unknown[] }>(
      `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/bitmaps`
    )
    const items = response.payload || []
    // Response is string[] or { key: string }[] depending on workspace version
    const keys = items.map(item =>
      typeof item === 'string' ? item : (item as Record<string, string>).key ?? String(item)
    )
    return keys.filter(k => k && !EXCLUDED_BITMAP_PREFIXES.some(p => k.startsWith(p)))
  } catch {
    return []
  }
}

// Tag suggestions for TagInput: existing `tag/*` bitmaps, prefix stripped.
export async function listWorkspaceTagSuggestions(workspaceId: string): Promise<string[]> {
  const keys = await listWorkspaceBitmaps(workspaceId)
  return keys
    .filter(k => k.startsWith('tag/'))
    .map(k => k.slice('tag/'.length))
    .filter(Boolean)
    .sort()
}

export async function deleteWorkspaceBitmap(workspaceId: string, bitmapKey: string): Promise<boolean> {
  const cleaned = bitmapKey.replace(/^\/+|\/+$/g, '')
  if (!cleaned) throw new Error('Bitmap key is required')
  if (cleaned.startsWith('data/') || cleaned === 'data') {
    throw new Error('data/* bitmaps are protected and cannot be deleted manually')
  }
  await api.delete<{ payload: { key: string } }>(
    `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/bitmaps/${cleaned.split('/').map(encodeURIComponent).join('/')}`
  )
  return true
}

// ─── Datasets ─────────────────────────────────────────────────────────────────
// Path-independent ingest provenance (data/dataset/<name>). The 'default'
// dataset is virtual (unstamped documents) — engine-side, never listed here.

export interface WorkspaceDataset {
  name: string
  key: string
  documentCount: number
}

export async function listWorkspaceDatasets(workspaceId: string): Promise<WorkspaceDataset[]> {
  const res = await api.get<{ payload: WorkspaceDataset[] }>(
    `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/datasets`
  )
  return res.payload || []
}

export async function deleteWorkspaceDataset(
  workspaceId: string,
  name: string,
  dropDocuments = true
): Promise<{ name: string; documentsDeleted: number }> {
  const cleaned = name.replace(/^data\/dataset\//, '').replace(/^\/+|\/+$/g, '')
  if (!cleaned) throw new Error('Dataset name is required')
  if (cleaned === 'default') throw new Error('The "default" dataset is virtual and cannot be deleted')
  const res = await api.delete<{ payload: { name: string; documentsDeleted: number } }>(
    `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/datasets/${cleaned.split('/').map(encodeURIComponent).join('/')}?dropDocuments=${dropDocuments}`
  )
  return res.payload
}

// ─── Timeline API ─────────────────────────────────────────────────────────────

function timelineBase(workspaceId: string) {
  return `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/timelines`
}

export async function listWorkspaceTimelines(workspaceId: string): Promise<string[]> {
  try {
    const res = await api.get<{ payload: string[] }>(timelineBase(workspaceId))
    return res.payload || []
  } catch {
    return []
  }
}

export async function createWorkspaceTimeline(workspaceId: string, name: string): Promise<TimelineInfo> {
  const res = await api.post<{ payload: TimelineInfo }>(timelineBase(workspaceId), { name })
  return res.payload
}

export async function deleteWorkspaceTimeline(workspaceId: string, name: string): Promise<boolean> {
  await api.delete<{ payload: unknown }>(`${timelineBase(workspaceId)}/${encodeURIComponent(name)}`)
  return true
}

// Per-bucket document counts for one or more timelines — the data behind the
// toolbox timeline density rail. Buckets are caller-supplied intervals (the
// rail knows its visible periods); counts are intersected server-side with the
// same candidate scope as the documents listing (context path, features,
// filters, canvas querySpec folding).
export interface TimelineHistogramBucket {
  start: string
  end: string
  counts: Record<string, number>
  total: number
}

export interface TimelineHistogramRequest {
  names: string[]
  buckets: Array<{ start: string; end: string }>
  context?: string
  treeNameOrTreeId?: string
  treeType?: 'context' | 'directory'
  allOf?: string[]
  anyOf?: string[]
  noneOf?: string[]
  filters?: string[]
  scope?: 'path' | 'workspace'
  applyCanvasSpec?: boolean
}

export async function fetchTimelineHistogram(
  workspaceId: string,
  request: TimelineHistogramRequest,
): Promise<TimelineHistogramBucket[]> {
  const res = await api.post<{ payload: { buckets: TimelineHistogramBucket[] } }>(
    `${timelineBase(workspaceId)}/histogram`,
    request,
  )
  return res.payload?.buckets ?? []
}

export async function queryWorkspaceTimeline(
  workspaceId: string,
  timelineName: string,
  interval: TimelineQueryInterval,
  options: TimelineQueryOptions = {},
): Promise<number[]> {
  const res = await api.post<{ payload: number[] }>(
    `${timelineBase(workspaceId)}/${encodeURIComponent(timelineName)}/query`,
    { ...interval, ...options },
  )
  return res.payload || []
}

export interface WorkspaceDbStats {
  dbBackend: string
  dbPath: string
  status: string
  documentCount: number
  metadataCount: number
  bitmapCacheSize: number
  bitmapStoreSize: number
  checksumIndexSize: number
  deletedDocumentsCount: number
  fts?: { ready: boolean; rowCount?: number; error?: string } | Record<string, unknown>
  semantic?: {
    enabled: boolean
    model?: string
    dim?: number
    cacheDir?: string
    inferdableSchemas?: string[]
    imageMaxDistance?: number | null
    imageFloorMode?: 'relative' | 'absolute'
    imageRelativeMargin?: number
    searchWeights?: { fts?: number; dense?: number; image?: number }
    vector?: { ready: boolean; rowCount?: number; error?: string } | Record<string, unknown>
    vectorSpaces?: Record<string, { ready: boolean; dim?: number; chunkRows?: number; embeddedDocs?: number; error?: string }>
    inferder?: Record<string, unknown>
    queue?: { pending: number; draining: boolean } | null
  }
  inferder?: {
    // THIS workspace's queue — each workspace owns one, so the backlog shown is
    // its own work rather than a server-wide total.
    queue?: { pending: number; draining: boolean; paused?: boolean; ingestDisabled?: boolean } | null
    // Actual embed routing per space (schema ids / `mime <pattern>`), from the
    // inferd router rules — what really embeds where, not just the gap default.
    routing?: Record<string, string[]>
    // Provider/model filling each space. Both are config now, so the UI reports
    // what is actually running instead of implying the old hardcoded pair.
    spaces?: Record<string, { provider: string; model: string; dim: number }>
  }
}

// Pause/resume embedding (admin). Pause holds the backlog after the in-flight
// batch — the CPU-heavy inference goes quiet — and resume drains it; a server
// restart also clears the pause. Queues are per-workspace: pass a workspaceId to
// pause just that one, omit it to pause every workspace.
export async function setInferdPaused(
  paused: boolean,
  workspaceId?: string,
): Promise<{ paused: boolean; pending: number; workspace?: string }> {
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
  const res = await api.post<{ payload: { paused: boolean; pending: number; workspace?: string } }>(
    `${API_ROUTES.admin.inferd}/${paused ? 'pause' : 'resume'}${query}`,
  )
  return res.payload
}

export async function getWorkspaceDbStats(workspaceId: string): Promise<WorkspaceDbStats> {
  const res = await api.get<{ payload: WorkspaceDbStats }>(`${API_ROUTES.workspaces}/${workspaceId}/db/stats`)
  return res.payload
}

export interface SearchWeights {
  fts?: number
  dense?: number
  image?: number
}

/** Live-tune search knobs (image relevance floor + hybrid fusion weights). Persisted + applied without restart. */
export async function setWorkspaceSearchTuning(
  workspaceId: string,
  tuning: { imageMaxDistance?: number | null; imageFloorMode?: 'relative' | 'absolute'; imageRelativeMargin?: number; searchWeights?: SearchWeights },
): Promise<{ semantic: { imageMaxDistance?: number | null; imageFloorMode?: 'relative' | 'absolute'; imageRelativeMargin?: number; searchWeights?: SearchWeights } }> {
  const res = await api.put<{ payload: { semantic: { imageMaxDistance?: number | null; imageFloorMode?: 'relative' | 'absolute'; imageRelativeMargin?: number; searchWeights?: SearchWeights } } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/db/tuning`,
    tuning,
  )
  return res.payload
}


// ── Trash ───────────────────────────────────────────────────────────────────
// See docs/data-representation.md. Listing is a plain read; restore re-files a
// document where it was; emptying is the one hard delete.

export interface TrashedDocument extends CanvasDocument {
  trashed?: {
    trashedAt: string
    placements: Array<{ tree: string; treeId: string; type: string; paths: string[] }>
  } | null
}

export async function listTrash(workspaceId: string): Promise<TrashedDocument[]> {
  const response = await api.get<{ payload: TrashedDocument[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/trash`
  )
  return Array.isArray(response.payload) ? response.payload : []
}

export async function restoreFromTrash(
  workspaceId: string,
  documentIds: readonly (string | number)[]
): Promise<{ restored: number[]; failed: Array<{ id: number; error: string }> }> {
  const response = await api.post<{ payload: { restored: number[]; failed: Array<{ id: number; error: string }> } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/trash/restore`,
    { documentIds: normalizeDocumentIds(documentIds) }
  )
  return response.payload
}

export async function emptyTrash(
  workspaceId: string,
  documentIds?: readonly (string | number)[]
): Promise<{ destroyed: number[]; failed: unknown[] }> {
  const response = await api.delete<{ payload: { destroyed: number[]; failed: unknown[] } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/trash`,
    documentIds?.length
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentIds: normalizeDocumentIds(documentIds) }) }
      : {}
  )
  return response.payload
}

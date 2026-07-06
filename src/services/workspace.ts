import { API_ROUTES, API_URL } from '@/config/api';
import { api } from '@/lib/api';
import type { TreeNode, TimelineInfo, TimelineQueryInterval, TimelineQueryOptions } from '@/types/workspace';
// GLOBAL Workspace type from src/types/api.d.ts will be used.
// No local Workspace interface should be defined here.

export const BACKENDS_ROOT_CONTEXT = '/.backends'
export const DEFAULT_WORKSPACE_TREE_NAME = 'context'

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
    label?: string;
    type?: string; // This aligns with optional 'type' in global Workspace
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
      workspaceTreeCache.set(key, response)
      return response
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
  options: { limit?: number; offset?: number; page?: number; includeBackends?: boolean; treeName?: string; treeType?: string; q?: string; queries?: string[]; anyOf?: string[]; noneOf?: string[]; filters?: string[]; scope?: 'path' | 'workspace' } = {}
): Promise<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string }> {
  try {
    const params = new URLSearchParams();
    const wholeWorkspace = options.scope === 'workspace'
    if (wholeWorkspace) params.append('scope', 'workspace')
    params.append('treeNameOrTreeId', options.treeName || DEFAULT_WORKSPACE_TREE_NAME)
    if (options.treeType) params.append('treeType', options.treeType)
    if (contextSpec && !wholeWorkspace) params.append('context', contextSpec)
    appendAllOf(params, featureArray)
    appendAnyOf(params, options.anyOf)
    appendNoneOf(params, options.noneOf)
    appendFilters(params, options.filters)
    if (options.includeBackends) params.append('includeBackends', 'true')
    if (options.limit !== undefined) params.append('limit', options.limit.toString());
    if (options.offset !== undefined) params.append('offset', options.offset.toString());
    if (options.page !== undefined) params.append('page', options.page.toString());
    appendQueries(params, options.queries, options.q);

    const queryString = params.toString();
    const url = `${API_ROUTES.workspaces}/${id}/documents${queryString ? '?' + queryString : ''}`;

    return await api.get<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string }>(url);
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
  options: { limit?: number; offset?: number; page?: number; q?: string; queries?: string[]; allOf?: string[]; anyOf?: string[]; noneOf?: string[]; filters?: string[] } = {}
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
  })
}

export async function getWorkspaceLayerDocuments(
  id: string,
  treeName: string,
  layerId: string,
  options: { limit?: number; offset?: number; page?: number; q?: string; queries?: string[]; allOf?: string[]; anyOf?: string[]; noneOf?: string[]; filters?: string[] } = {}
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
    const queryString = params.toString();
    const url = `${API_ROUTES.workspaces}/${id}/trees/${encodeURIComponent(treeName)}/layers/${encodeURIComponent(layerId)}/documents${queryString ? '?' + queryString : ''}`;
    return await api.get<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string }>(url);
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
export async function saveCanvasUi(workspaceId: string, path: string, treeName: string, metadata: Record<string, unknown>): Promise<boolean> {
  await api.patch(getWorkspaceTreePathRoute(workspaceId, treeName, path), { metadata })
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

// `purge` only has an effect on the /.backends subtree of a directory tree:
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

export async function removeWorkspaceDocuments(
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
  document: { id: number; schema: string; schemaVersion: string; data: Record<string, any>; metadata?: Record<string, any> }
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
  options: { includeBackends?: boolean } = {},
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
  if (options.includeBackends) params.append('includeBackends', 'true')
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

export interface WorkspaceDataBackendStatus {
  enabled: boolean;
  supported?: boolean;
  driver?: string;
  root?: string;
  watch?: boolean;
  watching?: boolean;
  resync?: boolean;
  managed?: boolean;
  indexIncoming?: boolean;
  incomingPathMode?: 'sourceDirectories' | string;
  readOnly?: boolean;
  running?: boolean;
  lastScanAt?: string | null;
  lastError?: string | null;
  cacheStats?: { entries: number; size: number } | null;
}

export interface WorkspaceImapMailbox {
  id: string;
  enabled: boolean;
  host: string;
  port: number;
  tls: boolean;
  allowSelfSigned: boolean;
  user: string;
  folder: string;
  mode: 'poll';
  pollInterval: number;
  initialSyncDays: number;
  lastUid: number;
  lastSyncAt: string | null;
  lastError: string | null;
  passwordConfigured: boolean;
  runtime: {
    active: boolean;
    syncing: boolean;
    status: string;
  };
}

export interface WorkspaceImapFolder {
  name: string;
  path: string;
  delimiter: string;
  selectable: boolean;
  attributes: string[];
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

export async function getWorkspaceDataBackends(workspaceId: string): Promise<Record<string, WorkspaceDataBackendStatus>> {
  const response = await api.get<{ payload: Record<string, WorkspaceDataBackendStatus> }>(
    `${API_ROUTES.workspaces}/${workspaceId}/data-backends`
  );
  return response.payload || {};
}

export async function updateWorkspaceDataBackends(
  workspaceId: string,
  dataBackends: Record<string, Partial<WorkspaceDataBackendStatus>>
): Promise<Record<string, WorkspaceDataBackendStatus>> {
  const response = await api.patch<{ payload: Record<string, WorkspaceDataBackendStatus> }>(
    `${API_ROUTES.workspaces}/${workspaceId}/data-backends`,
    { dataBackends }
  );
  return response.payload || {};
}

export async function resyncWorkspaceDataBackend(workspaceId: string, backendId: string): Promise<{ backend: string; count: number }> {
  const response = await api.post<{ payload: { backend: string; count: number } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/data-backends/${encodeURIComponent(backendId)}/resync`
  );
  return response.payload;
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

export interface WorkspaceImapMailboxInput {
  id?: string;
  enabled?: boolean;
  host: string;
  port?: number;
  tls?: boolean;
  allowSelfSigned?: boolean;
  user: string;
  password?: string;
  folder?: string;
  mode?: 'poll';
  pollInterval?: number;
  initialSyncDays?: number;
  lastUid?: number;
}

export async function listWorkspaceImapMailboxes(workspaceId: string): Promise<WorkspaceImapMailbox[]> {
  const response = await api.get<{ payload: WorkspaceImapMailbox[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes`
  );
  return response.payload || [];
}

export async function createWorkspaceImapMailbox(
  workspaceId: string,
  payload: WorkspaceImapMailboxInput
): Promise<WorkspaceImapMailbox> {
  const response = await api.post<{ payload: WorkspaceImapMailbox }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes`,
    payload
  );
  return response.payload;
}

export async function discoverWorkspaceImapFolders(
  workspaceId: string,
  payload: WorkspaceImapMailboxInput
): Promise<WorkspaceImapFolder[]> {
  const response = await api.post<{ payload: WorkspaceImapFolder[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes/folders`,
    payload
  );
  return response.payload || [];
}

export async function listWorkspaceImapFolders(
  workspaceId: string,
  mailboxId: string
): Promise<WorkspaceImapFolder[]> {
  const response = await api.get<{ payload: WorkspaceImapFolder[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes/folders/${encodeURIComponent(mailboxId)}`
  );
  return response.payload || [];
}

export async function subscribeWorkspaceImapFolders(
  workspaceId: string,
  mailboxId: string,
  folders: string[]
): Promise<WorkspaceImapMailbox[]> {
  const response = await api.post<{ payload: WorkspaceImapMailbox[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes/folders/${encodeURIComponent(mailboxId)}`,
    { folders }
  );
  return response.payload || [];
}

export async function updateWorkspaceImapMailbox(
  workspaceId: string,
  mailboxId: string,
  payload: Partial<WorkspaceImapMailboxInput>
): Promise<WorkspaceImapMailbox> {
  const response = await api.patch<{ payload: WorkspaceImapMailbox }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes/${encodeURIComponent(mailboxId)}`,
    payload
  );
  return response.payload;
}

export async function deleteWorkspaceImapMailbox(workspaceId: string, mailboxId: string): Promise<void> {
  await api.delete(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes/${encodeURIComponent(mailboxId)}`
  );
}

export async function testWorkspaceImapMailbox(workspaceId: string, mailboxId: string): Promise<unknown> {
  const response = await api.post<{ payload: unknown }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes/${encodeURIComponent(mailboxId)}/test`
  );
  return response.payload;
}

export async function syncWorkspaceImapMailbox(workspaceId: string, mailboxId: string): Promise<unknown> {
  const response = await api.post<{ payload: unknown }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes/${encodeURIComponent(mailboxId)}/sync`
  );
  return response.payload;
}

export async function startWorkspaceImapMailbox(workspaceId: string, mailboxId: string): Promise<unknown> {
  const response = await api.post<{ payload: unknown }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes/${encodeURIComponent(mailboxId)}/start`
  );
  return response.payload;
}

export async function stopWorkspaceImapMailbox(workspaceId: string, mailboxId: string): Promise<unknown> {
  const response = await api.post<{ payload: unknown }>(
    `${API_ROUTES.workspaces}/${workspaceId}/services/imap/mailboxes/${encodeURIComponent(mailboxId)}/stop`
  );
  return response.payload;
}

// ─── Bitmaps ────────────────────────────────────────────────────────────────

// Prefixes that are structural/internal and not shown to users in the toolbox.
const EXCLUDED_BITMAP_PREFIXES = ['internal/', 'context/', 'vfs/', 'nested/']

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
    embeddableSchemas?: string[]
    vector?: { ready: boolean; rowCount?: number; error?: string } | Record<string, unknown>
    embedder?: Record<string, unknown>
    queue?: { pending: number; draining: boolean } | null
  }
}

export async function getWorkspaceDbStats(workspaceId: string): Promise<WorkspaceDbStats> {
  const res = await api.get<{ payload: WorkspaceDbStats }>(`${API_ROUTES.workspaces}/${workspaceId}/db/stats`)
  return res.payload
}

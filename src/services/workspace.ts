import type { ResponseEnvelope } from '@augmentd-labs/canvas-protocol';
import { API_ROUTES, API_URL } from '@/config/api';
import { api } from '@/lib/api';
import type { Document as CanvasDocument, TreeNode, TimelineInfo, TimelineQueryInterval, TimelineQueryOptions } from '@/types/workspace';
import { beginDocumentSave, endDocumentSave } from '@/lib/remote-mirror'

// Document lists stay enveloped: their pagination counts (count/totalCount)
// live on the envelope, not in the payload. Every other call in this file
// resolves to its payload directly.
export type DocumentsEnvelope = ResponseEnvelope<CanvasDocument[]>;

// Calibration reads (?debug=true) get raw kNN distances attached; the base
// envelope types `debug` as unknown, so narrow it here.
export type DocumentsEnvelopeWithDebug = DocumentsEnvelope & {
  debug?: {
    distances?: Array<{ id: number; distance: number }>;
    imageDistances?: Array<{ id: number; distance: number }>;
  };
};
// GLOBAL Workspace type from src/types/api.d.ts will be used.
// No local Workspace interface should be defined here.

export const DEFAULT_WORKSPACE_TREE_NAME = 'context'
// Duplicated from components/renderers/types.ts on purpose: services must not
// import from components (the import boundary the /next work relies on).
const IDENTITY_SCHEMA_KEY = 'data/schema/identity'
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

const workspaceTreeCache = new Map<string, TreeNode>()
const workspaceTreeInflight = new Map<string, Promise<TreeNode>>()

function appendWorkspaceContext(params: URLSearchParams, contextSpec: string = '/', treeName = DEFAULT_WORKSPACE_TREE_NAME, treeType: 'context' | 'directory' = 'context') {
  params.append('treeNameOrTreeId', treeName)
  params.append('treeType', treeType)
  if (contextSpec) params.append('context', contextSpec)
}

/**
 * The closed synapsd predicate registry (indexes/edges/predicates.js). Kept in
 * sync by hand — it is append-only there, and the server echoes the live list
 * on every relations read (`DocumentRelations.predicates`), which is what the
 * pickers render. This constant is only the ordering/label fallback.
 */
export const RELATION_PREDICATES = [
  'includes', 'references', 'derived-from', 'mentions', 'replies-to', 'depicts', 'authored-by',
  // affiliation between two identities (person -> organization), synapsd 3.11.0
  'member-of',
] as const
export type RelationPredicate = (typeof RELATION_PREDICATES)[number]

export interface RelFilter {
  p: string
  of: number
  // Which adjacency axis to scan: 'out' = documents `of` points at,
  // 'in' = documents pointing at `of`.
  dir?: 'in' | 'out'
  op?: 'anyOf' | 'allOf' | 'noneOf'
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

// Graph-adjacency constraint, one hop from a known document. Serialized as the
// server's repeatable `rel` token: `[+!]<predicate>:<documentId>[:in|:out]`,
// with the same sigil trio as features (+ = allOf, ! = noneOf, bare = anyOf).
// Direction is an AXIS, never a predicate name — hence the trailing `:in`.
function appendRel(params: URLSearchParams, rel?: RelFilter[] | null) {
  for (const r of rel ?? []) {
    const sigil = r.op === 'allOf' ? '+' : r.op === 'noneOf' ? '!' : ''
    params.append('rel', `${sigil}${r.p}:${r.of}:${r.dir ?? 'out'}`)
  }
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
  const response = await api.get<{ workspace: Workspace } | Workspace>(`${API_ROUTES.workspaces}/${id}`)
  const p = response
  return (p && 'workspace' in p) ? p.workspace : p as Workspace
}

// listWorkspaces should return a Promise where Workspace is the global type.
export async function listWorkspaces(): Promise<Workspace[]> {
  try {
    // The API returns a ResponseObject with workspaces in the payload field
    const response = await api.get<Workspace[]>(API_ROUTES.workspaces);

    // Ensure we always return an array even if the response structure is unexpected
    if (Array.isArray(response)) {
      return response;
    } else {
      console.warn('listWorkspaces: response.payload is not an array:', response);
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
    const response = await api.post<Workspace>(API_ROUTES.workspaces, payload);
    return response;
  } catch (error) {
    console.error('Failed to create workspace:', error);
    throw error;
  }
}

// ─── Remote workspaces ───────────────────────────────────────────────────────

export type ImportPhase = 'resolving' | 'exporting' | 'downloading' | 'extracting' | 'loading' | 'done'

export interface ImportJob {
  id: string
  status: 'running' | 'done' | 'failed'
  phase: ImportPhase
  received: number
  total: number | null
  result: Workspace | null
  error: { message: string; code: string | null } | null
}

/** Human-readable label for an import phase, for progress UI. */
export const IMPORT_PHASE_LABELS: Record<ImportPhase, string> = {
  resolving: 'Resolving token on the remote server…',
  exporting: 'Remote server is packing the workspace…',
  downloading: 'Downloading archive…',
  extracting: 'Extracting…',
  loading: 'Validating and loading…',
  done: 'Done',
}

export async function getImportJob(jobId: string): Promise<ImportJob> {
  return api.get(`${API_ROUTES.workspaces}/import/jobs/${encodeURIComponent(jobId)}`)
}

/**
 * Poll an import job to completion.
 *
 * Imports move GBs and run for minutes, which is why the server answers 202
 * with a job instead of holding the request open — a request that long dies on
 * Node's 5-minute requestTimeout or, sooner, on a reverse proxy's read timeout,
 * and the browser reports it as an opaque network/CORS failure.
 */
export async function waitForImportJob(
  jobId: string,
  onProgress?: (job: ImportJob) => void,
  { intervalMs = 1500, signal }: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<Workspace> {
  for (;;) {
    if (signal?.aborted) throw new Error('Import tracking cancelled')
    const job = await getImportJob(jobId)
    onProgress?.(job)
    if (job.status === 'done') {
      if (!job.result) throw new Error('Import finished without returning a workspace')
      return job.result
    }
    if (job.status === 'failed') throw new Error(job.error?.message || 'Import failed')
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

/**
 * Pull a full copy of a workspace from another canvas-server using a workspace
 * share token. The server exports it there, downloads, extracts and registers
 * it; this returns once the resulting job completes.
 */
export async function importWorkspaceFromRemote(
  url: string,
  token: string,
  onProgress?: (job: ImportJob) => void,
): Promise<Workspace> {
  const job = await api.post<ImportJob>(`${API_ROUTES.workspaces}/import`, { url, token })
  return waitForImportJob(job.id, onProgress)
}

/**
 * A workspace that stays on another canvas-server, registered here as a
 * regular workspace entry named `<name>@<host>` (origin 'remote'). Every
 * /workspaces/<address>/* call is forwarded to the remote by the server.
 */
export interface RemoteWorkspaceRef {
  id: string
  /** `<name>@<host>` — the identifier to use in routes and API calls. */
  name: string
  address: string
  label: string
  host: string
  origin: 'remote'
  status: string
  remote: {
    url: string
    workspaceId: string
    workspaceName: string | null
    permissions: string[]
    addedAt: string | null
  }
  openable: boolean
}

export async function listRemoteWorkspaces(): Promise<RemoteWorkspaceRef[]> {
  return api.get(`${API_ROUTES.workspaces}/remotes`)
}

/**
 * Register a reference to a workspace that STAYS on its own server. The server
 * validates the token against the remote before storing anything.
 */
export async function addRemoteWorkspace(url: string, token: string, label?: string): Promise<RemoteWorkspaceRef> {
  return api.post(`${API_ROUTES.workspaces}/remotes`, { url, token, ...(label ? { label } : {}) })
}

export async function removeRemoteWorkspace(id: string): Promise<void> {
  await api.delete(`${API_ROUTES.workspaces}/remotes/${encodeURIComponent(id)}`)
}

// ─── Portability: export / import ────────────────────────────────────────────

export interface WorkspaceExportArchive {
  name: string
  size: number
  createdAt: string
  url: string
}

/**
 * Stop the workspace (when `stop`) and archive its folder into the user's
 * Exports dir. Returns the archive, including whether the workspace was
 * stopped to produce it — the caller decides whether to offer a restart.
 */
export async function exportWorkspace(id: string, opts: { stop?: boolean } = {}): Promise<WorkspaceExportArchive & { stoppedWorkspace: boolean }> {
  return api.post(`${API_ROUTES.workspaces}/${id}/export`, { stop: opts.stop === true })
}

export async function listWorkspaceExports(id: string): Promise<WorkspaceExportArchive[]> {
  return api.get(`${API_ROUTES.workspaces}/${id}/exports`)
}

/** Every archive in the user's Exports dir, whichever workspace produced it. */
export async function listAllExports(): Promise<WorkspaceExportArchive[]> {
  return api.get(`${API_ROUTES.workspaces}/exports`)
}

export async function deleteWorkspaceExport(name: string): Promise<void> {
  await api.delete(`${API_ROUTES.workspaces}/exports/${encodeURIComponent(name)}`)
}

/**
 * Download an archive to disk. Archives run to GBs, so this deliberately does
 * NOT fetch into a Blob: it mints a short-lived HttpOnly cookie and then lets
 * the browser navigate, which streams straight to disk with no token in the
 * URL and no copy in memory.
 */
export async function downloadWorkspaceExport(name: string): Promise<void> {
  await api.post(`${API_ROUTES.workspaces}/exports/ticket`)
  const href = `${API_URL}${API_ROUTES.workspaces}/exports/${encodeURIComponent(name)}`
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Import a workspace from the user's local drive: the file is streamed to the
 * server as a raw body, landing in the user's own Exports dir (the client
 * never names a path), then extracted, validated and registered.
 *
 * XMLHttpRequest rather than fetch — it is the only way to get upload progress,
 * and a workspace archive is big enough that progress is not a nicety.
 */
export async function importWorkspaceFromFile(
  file: File,
  onProgress?: (fraction: number) => void,
  onJobProgress?: (job: ImportJob) => void,
): Promise<Workspace> {
  const job = await uploadWorkspaceArchive(file, onProgress)
  // The bytes are up; extraction/validation/registration continue as a job.
  return waitForImportJob(job.id, onJobProgress)
}

/** Streams the archive up and returns the import job the server started. */
function uploadWorkspaceArchive(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<ImportJob> {
  const token = localStorage.getItem('authToken')
  const url = `${API_URL}${API_ROUTES.workspaces}/import/upload?filename=${encodeURIComponent(file.name)}`

  return new Promise<ImportJob>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.withCredentials = true
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let body: { payload?: { job?: ImportJob }; message?: string } | null = null
      try { body = JSON.parse(xhr.responseText) } catch { /* non-JSON error body */ }
      const job = body?.payload?.job
      if (xhr.status >= 200 && xhr.status < 300 && job) resolve(job)
      else reject(new Error(body?.message || `Import failed (HTTP ${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Upload failed — the connection dropped'))
    xhr.onabort = () => reject(new Error('Upload cancelled'))
    xhr.send(file)
  })
}

/** Import an archive already sitting in the user's Exports dir. */
export async function importWorkspaceFromExport(name: string): Promise<Workspace> {
  return api.post(`${API_ROUTES.workspaces}/import`, { export: name })
}

export async function startWorkspace(id: string): Promise<Workspace> {
  try {
    const response = await api.post<Workspace>(`${API_ROUTES.workspaces}/${id}/start`);
    return response;
  } catch (error) {
    console.error('Failed to start workspace:', error);
    throw error;
  }
}

export async function stopWorkspace(id: string): Promise<Workspace> {
  try {
    const response = await api.post<Workspace>(`${API_ROUTES.workspaces}/${id}/stop`);
    return response;
  } catch (error) {
    console.error('Failed to stop workspace:', error);
    throw error;
  }
}


export async function removeWorkspace(id: string): Promise<Workspace> {
  try {
    const response = await api.delete<Workspace>(`${API_ROUTES.workspaces}/${id}`);
    return response;
  } catch (error) {
    console.error('Failed to remove workspace:', error);
    throw error;
  }
}



// Summary row of a workspace tree as returned by GET /workspaces/:id/trees.
export interface WorkspaceTreeSummary {
  id: string;
  name: string;
  type: 'context' | 'directory' | string;
  label?: string;
  description?: string;
  color?: string | null;
}

// List all trees for a workspace
export async function listWorkspaceTrees(workspaceId: string): Promise<WorkspaceTreeSummary[]> {
  try {
    const res = await api.get<WorkspaceTreeSummary[]>(`${API_ROUTES.workspaces}/${workspaceId}/trees`);
    return res || [];
  } catch (error) {
    console.error(`Failed to list workspace trees ${workspaceId}:`, error);
    throw error;
  }
}

// Get workspace tree
export async function getWorkspaceTree(
  id: string
): Promise<TreeNode> {
  try {
    return await api.get<TreeNode>(
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
): Promise<TreeNode> {
  try {
    return await api.get<TreeNode>(
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
): Promise<TreeNode> {
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
      const pruned = withoutTrashNode(response) as TreeNode
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
  options: { limit?: number; offset?: number; page?: number; treeName?: string; treeType?: string; q?: string; queries?: string[]; anyOf?: string[]; noneOf?: string[]; filters?: string[]; rel?: RelFilter[]; ids?: number[] | null; scope?: 'path' | 'workspace'; sortBy?: string; order?: 'asc' | 'desc'; applyCanvasSpec?: boolean; debug?: boolean; debugLimit?: number } = {}
): Promise<DocumentsEnvelopeWithDebug> {
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
    appendRel(params, options.rel)
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

    return await api.getEnvelope<CanvasDocument[]>(url) as DocumentsEnvelopeWithDebug;
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
): Promise<DocumentsEnvelope> {
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
): Promise<DocumentsEnvelope> {
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
    return await api.getEnvelope<import('@/types/workspace').Document[]>(url);
  } catch (error) {
    console.error(`Failed to get workspace layer documents ${id}/${treeName}/${layerId}:`, error);
    throw error;
  }
}

export async function updateWorkspace(id: string, payload: Partial<CreateWorkspacePayload>): Promise<Workspace> {
  try {
    const response = await api.patch<Workspace>(`${API_ROUTES.workspaces}/${id}`, payload);
    return response;
  } catch (error) {
    console.error('Failed to update workspace:', error);
    throw error;
  }
}

// Workspace tree operations
export async function insertWorkspacePath(workspaceId: string, path: string, autoCreateLayers = true, treeName = DEFAULT_WORKSPACE_TREE_NAME, type: 'context' | 'canvas' = 'context'): Promise<boolean> {
  try {
    await api.put<unknown>(
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
    await api.put<unknown>(
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
  const response = await api.post<{ code: string; url: string }>(
    `${API_URL}/pub/c`,
    { workspaceId, path, treeName }
  )
  return response
}

export async function getPublicCanvasShare(workspaceId: string, path: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<{ code: string; url: string } | null> {
  const params = new URLSearchParams({ workspaceId, path, treeName })
  const response = await api.get<{ code: string; url: string } | null>(
    `${API_URL}/pub/c?${params.toString()}`
  )
  return response
}

export async function deletePublicCanvasShare(code: string): Promise<boolean> {
  await api.delete<boolean>(`${API_URL}/pub/c/${encodeURIComponent(code)}`)
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

// Email-based workspace share entry; shape is server-defined and only passed
// through to the UI, so it stays an open record.
export type WorkspaceEmailShare = Record<string, unknown>

export async function listWorkspaceShares(workspaceId: string): Promise<{ publicCanvasShares: WorkspacePublicCanvasShare[]; emailShares: WorkspaceEmailShare[] }> {
  const response = await api.get<{ publicCanvasShares?: WorkspacePublicCanvasShare[]; emailShares?: WorkspaceEmailShare[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/shares`
  )
  return {
    publicCanvasShares: response?.publicCanvasShares || [],
    emailShares: response?.emailShares || [],
  }
}

export async function revokeWorkspacePublicCanvasShare(workspaceId: string, code: string): Promise<boolean> {
  await api.delete<boolean>(
    `${API_ROUTES.workspaces}/${workspaceId}/shares/public-canvas/${encodeURIComponent(code)}`
  )
  return true
}

export async function updateWorkspacePath(workspaceId: string, path: string, updates: Record<string, unknown>, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<boolean> {
  try {
    await api.patch<unknown>(
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
    await api.delete<unknown>(
      `${getWorkspaceTreePathRoute(workspaceId, treeName, path)}?${params.toString()}`
    );
    return true;
  } catch (error) {
    console.error(`Failed to remove workspace path ${path}:`, error);
    throw error;
  }
}

export interface MovePathOptions {
  // Context trees: OR the moved layer into its new ancestors so the destination
  // path reads its documents right away (server → ContextTree.mergeDown).
  mergeDown?: boolean
}

export async function moveWorkspacePath(workspaceId: string, fromPath: string, toPath: string, recursive = false, treeName = DEFAULT_WORKSPACE_TREE_NAME, targetTreeName?: string, options: MovePathOptions = {}): Promise<boolean> {
  try {
    await api.patch<unknown>(
      getWorkspaceTreePathRoute(workspaceId, treeName, fromPath),
      {
        to: toPath,
        recursive,
        ...(options.mergeDown ? { mergeDown: true } : {}),
        ...(targetTreeName && targetTreeName !== treeName ? { targetTreeNameOrTreeId: targetTreeName } : {}),
      }
    );
    return true;
  } catch (error) {
    console.error(`Failed to move workspace path from ${fromPath} to ${toPath}:`, error);
    throw error;
  }
}

export async function copyWorkspacePath(workspaceId: string, fromPath: string, toPath: string, recursive = false, treeName = DEFAULT_WORKSPACE_TREE_NAME, targetTreeName?: string): Promise<boolean> {
  try {
    await api.post<unknown>(
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
    await api.post<unknown>(
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
    const response = await api.post<number[]>(
      `${API_ROUTES.workspaces}/${workspaceId}/documents`,
      { documents: docs, treeNameOrTreeId: treeName, treeType, context: path }
    );
    return Array.isArray(response) ? response : [];
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
  const res = await api.get<Layer[]>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers`)
  return res || []
}

export async function getWorkspaceLayer(workspaceId: string, layerId: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<Layer> {
  const res = await api.get<Layer>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/${layerId}`)
  return res
}

export async function renameWorkspaceLayer(workspaceId: string, layerId: string, newName: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<Layer> {
  const res = await api.patch<Layer>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/${layerId}`, { name: newName })
  return res
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

export async function mergeWorkspaceLayer(workspaceId: string, layerId: string, targetLayers: string[], treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<unknown> {
  const res = await api.post<unknown>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/merge`, { layerId, targetLayers })
  return res
}

export interface PathBitmapOpResult {
  path: string
  source: string
  targets: string[]
  affected: string[]
}

// "Merge down": OR the leaf layer of `path` into every ancestor on that path
// (source/targets derived server-side — no way to get them backwards).
export async function mergeDownWorkspacePath(workspaceId: string, path: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<PathBitmapOpResult | null> {
  const res = await api.post<{ data?: PathBitmapOpResult }>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/paths/merge-down`, { path })
  return res?.data ?? null
}

// Inverse of mergeDown: AND-NOT the leaf's bitmap out of every ancestor.
export async function subtractDownWorkspacePath(workspaceId: string, path: string, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<PathBitmapOpResult | null> {
  const res = await api.post<{ data?: PathBitmapOpResult }>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/paths/subtract-down`, { path })
  return res?.data ?? null
}

export async function subtractWorkspaceLayer(workspaceId: string, layerId: string, targetLayers: string[], treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<unknown> {
  const res = await api.post<unknown>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/subtract`, { layerId, targetLayers })
  return res
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

// Updating a document that mirrors a remote object (a synced GitHub issue, a
// calendar event) goes to that source before it touches the local index, so
// the call can take a second or more. The in-flight registry is marked here —
// the single place every surface's edit funnels through — so renderers can dim
// the item and say what it is waiting for. See lib/remote-mirror.ts.
export async function updateWorkspaceDocument(
  workspaceId: string,
  document: {
    id: number; schema: string; schemaVersion: string;
    data?: Record<string, unknown>; metadata?: Record<string, unknown>; comment?: string;
    // Blob-backed documents whose content moves on edit (drawings) replace
    // their identity + preview location in the same PUT.
    checksumArray?: string[];
    locations?: Array<{ url: string; metadata?: Record<string, unknown> }>;
  }
): Promise<boolean> {
  beginDocumentSave(document.id)
  try {
    await api.put<unknown>(
      `${API_ROUTES.workspaces}/${workspaceId}/documents`,
      { documents: [document] }
    )
  } finally {
    endDocumentSave(document.id)
  }
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
  const response = await api.delete<DestroyResult>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/destroy`,
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  return response
}

export type BackendTransferMode = 'copy' | 'move' | 'delete'

export interface BackendTransferResult {
  successful: Array<{
    id: number
    mode: BackendTransferMode
    // copy/move: one entry per target backend. `state` is 'pending' when the
    // destination is sync-queued — the move completes once the write lands.
    transfers?: Array<{ backend: string; state: 'complete' | 'pending' | 'unchanged' | string }>
    // delete: which locations went, and whether the index entry followed.
    deleted?: string[]
    kept?: string[]
    docDeleted?: boolean
  }>
  failed: Array<{ id: number; reason: string }>
}

/**
 * Copy / move documents to storage backends, or delete their bytes from the
 * given backends. Addressed by document id — the server resolves each
 * document's own source location, so external mounts work too.
 *
 * Partial success is normal (a document already living on the target fails
 * alone), so callers must report `failed` rather than assume all-or-nothing.
 */
export type BackendTransferConflict = 'error' | 'rename' | 'overwrite'

export interface BackendTransferOptions {
  to: string[]
  mode?: BackendTransferMode
  keepDocument?: boolean
  // copy/move onto path-keyed backends (see BackendCapabilities.paths):
  // backend-relative folder and, for a single document, the name on arrival.
  // Omitted → backend root, the document's own filename + extension.
  folder?: string
  filename?: string
  onConflict?: BackendTransferConflict
}

export async function transferDocumentsToBackends(
  workspaceId: string,
  documentIds: readonly (string | number)[],
  options: BackendTransferOptions
): Promise<BackendTransferResult> {
  const folder = options.folder?.trim().replace(/^\/+|\/+$/g, '')
  const filename = options.filename?.trim()
  const response = await api.post<BackendTransferResult>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/transfer`,
    {
      documentIds: normalizeDocumentIds(documentIds),
      to: options.to,
      mode: options.mode ?? 'copy',
      ...(options.keepDocument ? { keepDocument: true } : {}),
      ...(folder ? { folder } : {}),
      ...(filename ? { filename } : {}),
      ...(options.onConflict ? { onConflict: options.onConflict } : {}),
    }
  )
  return response
}

// Does a transfer onto this backend take a folder + filename? Server flag
// first; older servers without it are judged by driver.
export function backendKeepsPaths(backend: Backend): boolean {
  if (typeof backend.capabilities?.paths === 'boolean') return backend.capabilities.paths
  return backend.kind === 'storage' && backend.driver !== 'cacache'
}

// ── Document sub-resources (object properties card) ─────────────────────────

export interface DocumentLocationInfo {
  url: string
  scheme?: string
  backend?: string
  kind: 'stored' | 'workspace-file' | 'imap' | 'readonly' | 'unknown' | string
  deletable: boolean
}

/**
 * Re-read a single document by id. Detail hosts (properties modal / side card)
 * are opened with a snapshot owned by the list behind them, which an inline
 * edit does not update — they use this to pull the saved copy back.
 */
export async function getWorkspaceDocument(workspaceId: string, documentId: number | string): Promise<CanvasDocument> {
  return await api.get<CanvasDocument>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}`
  )
}

export async function getDocumentLocations(workspaceId: string, documentId: number | string): Promise<DocumentLocationInfo[]> {
  const response = await api.get<DocumentLocationInfo[]>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/locations`
  )
  return response || []
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
  const response = await api.get<{ documentId: number; memberships: DocumentTreeMembership[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/memberships${qs}`
  )
  return response?.memberships || []
}

/**
 * Every identity in the workspace of a given subtype, newest first.
 *
 * Closed-enum children are registered schema ids, so
 * `data/schema/identity/organization` filters server-side — no fetch-everything-then-filter.
 */
export async function listWorkspaceIdentities(
  workspaceId: string,
  type?: 'person' | 'organization' | 'service' | 'bot',
  limit = 500
): Promise<CanvasDocument[]> {
  const key = type ? `${IDENTITY_SCHEMA_KEY}/${type}` : IDENTITY_SCHEMA_KEY
  const res = await getWorkspaceDocuments(workspaceId, '/', [key], { scope: 'workspace', limit })
  return res.payload || []
}

// ── Document relations (typed doc<->doc edges) ───────────────────────────────
// The synapsd edge plane. Direction is an AXIS: `outgoing` holds edges where
// this document is the subject, `incoming` where it is the object. There are
// no inverse predicate names anywhere in the system.

export interface DocumentRelationMeta {
  // 'doc' = asserted (a person drew it); 'extractor:<name>' / 'agent:<id>' =
  // derived by a pipeline, which the UI shows but does not offer to delete.
  src: string
  ts?: number
  conf?: number
}

export interface DocumentRelation {
  p: string
  // Exactly one of these is set: `to` on an outgoing edge, `from` on an incoming one.
  to?: number
  from?: number
  meta: DocumentRelationMeta | null
  // The far side, resolved server-side. null when the target document is gone
  // (edges to missing documents are legal) or beyond the resolve cap.
  document?: CanvasDocument | null
}

export interface DocumentRelations {
  documentId: number
  // The live predicate registry from the server — render pickers from this.
  predicates: string[]
  outgoing: DocumentRelation[]
  incoming: DocumentRelation[]
}

export async function getDocumentRelations(
  workspaceId: string,
  documentId: number | string,
  options: { resolve?: boolean } = {}
): Promise<DocumentRelations> {
  const qs = options.resolve === false ? '?resolve=false' : ''
  const response = await api.get<DocumentRelations>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/relations${qs}`
  )
  return response ?? { documentId: Number(documentId), predicates: [...RELATION_PREDICATES], outgoing: [], incoming: [] }
}

/**
 * Create `documentId --p--> to` (dir 'out', the default) or `to --p--> documentId`
 * (dir 'in'). Idempotent — re-creating an existing edge is a no-op.
 */
export async function createDocumentRelations(
  workspaceId: string,
  documentId: number | string,
  p: string,
  to: readonly (number | string)[] | number | string,
  dir: 'in' | 'out' = 'out'
): Promise<boolean> {
  await api.post<unknown>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/relations`,
    { p, to: Array.isArray(to) ? normalizeDocumentIds(to) : to, dir }
  )
  return true
}

export async function removeDocumentRelation(
  workspaceId: string,
  documentId: number | string,
  p: string,
  to: number | string,
  dir: 'in' | 'out' = 'out'
): Promise<boolean> {
  await api.delete<unknown>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/relations`,
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p, to, dir }),
    }
  )
  return true
}

function buildContentApiPath(workspaceId: string, documentId: number | string, opts: { download?: boolean; url?: string; version?: string | null } = {}): string {
  const params = new URLSearchParams()
  // Cache identity for mutable-content docs (drawings): the offline SW keys
  // its content cache on the full URL, so the checksum in the URL rolls it.
  if (opts.version) params.set('v', opts.version)
  if (opts.download) params.set('download', '1')
  // Target a specific location/attachment URL (must belong to the document).
  if (opts.url) params.set('url', opts.url)
  const qs = params.toString()
  return `${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/content${qs ? `?${qs}` : ''}`
}

/** Authed fetch of the on-demand server thumbnail (image and PDF docs).
 * `version` (the doc's content checksum) goes into the URL so mutable-content
 * documents (drawings) get a fresh cache identity per edit — the offline SW
 * caches content URLs cache-first, keyed on the full URL. */
export async function fetchDocumentThumbnail(workspaceId: string, documentId: number | string, size = 256, version?: string | null): Promise<{ blob: Blob; mime: string }> {
  const token = localStorage.getItem('authToken')
  const v = version ? `&v=${encodeURIComponent(version)}` : ''
  const res = await fetch(`${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/thumbnail?size=${size}${v}`, {
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
export async function fetchDocumentBlob(workspaceId: string, documentId: number | string, opts: { url?: string; version?: string | null } = {}): Promise<{ blob: Blob; mime: string }> {
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
  const response = await api.delete<{ requested: number; deleted: number }>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/purge?${params.toString()}`
  )
  return response
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
    const response = await api.get<WorkspaceServicesStatus>(`${API_ROUTES.workspaces}/${workspaceId}/services`);
    return response;
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
    const response = await api.post<{ success: boolean; path?: string }>(
      `${API_ROUTES.workspaces}/${workspaceId}/services/${serviceName}/enable`
    );
    return response;
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
    const response = await api.post<{ success: boolean }>(
      `${API_ROUTES.workspaces}/${workspaceId}/services/${serviceName}/disable`
    );
    return response;
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
  // Connectors: write-back (create/update/delete remote objects) enabled.
  write?: boolean;
  // Objects live under person-chosen paths (directory share, drive): a
  // transfer there takes a folder + filename. False for the hash-keyed blob store.
  paths?: boolean;
}

export interface BackendContainer {
  name: string;
  id?: string;
  mailboxId?: string;
  enabled?: boolean;
  status?: string;
  lastSyncAt?: string | null;
  lastError?: string | null;
  // Connector containers: write-back enabled (rw backend) — destination
  // pickers (todo → GitHub repo, event → calendar) read this.
  writable?: boolean;
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
  kind: 'storage' | 'messages' | 'connector' | 'hybrid';
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
  const response = await api.get<Backend[]>(url);
  return response || [];
}

export async function getBackend(workspaceId: string, driver: string, address: string): Promise<Backend> {
  const response = await api.get<Backend>(backendPath(workspaceId, driver, address));
  return response;
}

// On-demand on-disk size of a local storage backend. Walks the backend root
// server-side — potentially slow on large trees, so only call on user action.
export async function getBackendDiskUsage(workspaceId: string, driver: string, address: string): Promise<BackendDiskUsage> {
  const response = await api.get<BackendDiskUsage>(`${backendPath(workspaceId, driver, address)}/usage`);
  return response;
}

// Wipe the on-demand thumbnail cache (derived artifacts — regenerated on
// demand, always safe to clear).
export async function clearThumbnailCache(workspaceId: string): Promise<{ removed: number }> {
  const response = await api.delete<{ removed: number }>(`${API_ROUTES.workspaces}/${workspaceId}/thumbnails`);
  return response;
}

// On-demand on-disk size of the whole workspace root (per-dir breakdown
// included) — the export/sync planning number. Slow on large workspaces.
export async function getWorkspaceDiskUsage(workspaceId: string): Promise<WorkspaceDiskUsage> {
  const response = await api.get<WorkspaceDiskUsage>(`${API_ROUTES.workspaces}/${workspaceId}/usage`);
  return response;
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
  const response = await api.post<Backend>(`${backendsBase(workspaceId)}/${encodeURIComponent(driver)}`, config);
  return response;
}

export async function updateBackend(workspaceId: string, driver: string, address: string, patch: Record<string, unknown>): Promise<Backend> {
  const response = await api.patch<Backend>(backendPath(workspaceId, driver, address), patch);
  return response;
}

export async function removeBackend(workspaceId: string, driver: string, address: string): Promise<{ removed: boolean }> {
  const response = await api.delete<{ removed: boolean }>(backendPath(workspaceId, driver, address));
  return response;
}

export async function syncBackend(workspaceId: string, driver: string, address: string): Promise<unknown> {
  const response = await api.post<unknown>(`${backendPath(workspaceId, driver, address)}/sync`);
  return response;
}

// Stop an in-flight resync. The server aborts the walk at the next file;
// already-indexed files stay indexed and a later sync resumes cheaply via the
// checksum cache — so stop + later re-sync behaves like pause/resume.
export async function cancelBackendSync(workspaceId: string, driver: string, address: string): Promise<unknown> {
  const response = await api.post<unknown>(`${backendPath(workspaceId, driver, address)}/sync/cancel`);
  return response;
}

export async function testBackend(workspaceId: string, driver: string, address: string): Promise<unknown> {
  const response = await api.post<unknown>(`${backendPath(workspaceId, driver, address)}/test`);
  return response;
}

export async function listBackendContainers(workspaceId: string, driver: string, address: string): Promise<BackendContainer[]> {
  const response = await api.get<BackendContainer[]>(`${backendPath(workspaceId, driver, address)}/containers`);
  return response || [];
}

/** Write-back: create a document in a connector container (GitHub issue, calendar event). */
export async function createBackendContainerDocument(
  workspaceId: string, driver: string, address: string, container: string,
  payload: Record<string, unknown>,
): Promise<{ uid?: string; href?: string; docId?: number | null }> {
  const response = await api.post<{ uid?: string; href?: string; docId?: number | null }>(
    `${backendPath(workspaceId, driver, address)}/containers/${encodeURIComponent(container)}/documents`, payload);
  return response;
}

export async function syncBackendContainer(workspaceId: string, driver: string, address: string, name: string): Promise<unknown> {
  const response = await api.post<unknown>(`${backendPath(workspaceId, driver, address)}/containers/${encodeURIComponent(name)}/sync`);
  return response;
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
  const response = await api.get<BackendFolder[]>(`${backendPath(workspaceId, driver, address)}/containers?available=1`);
  return response || [];
}

export async function addBackendContainers(workspaceId: string, driver: string, address: string, folders: string[]): Promise<unknown> {
  const response = await api.post<unknown>(`${backendPath(workspaceId, driver, address)}/containers`, { folders });
  return response;
}

export async function removeBackendContainer(workspaceId: string, driver: string, address: string, name: string): Promise<{ removed: boolean }> {
  const response = await api.delete<{ removed: boolean }>(`${backendPath(workspaceId, driver, address)}/containers/${encodeURIComponent(name)}`);
  return response;
}

// Rename/move a container (file-backend folder). `name` is the current key, the
// body carries the new name/key. Returns the new key.
export async function renameBackendContainer(workspaceId: string, driver: string, address: string, name: string, newName: string): Promise<unknown> {
  const response = await api.patch<unknown>(`${backendPath(workspaceId, driver, address)}/containers/${encodeURIComponent(name)}`, { name: newName });
  return response;
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

// Any storage backend node (file, gdrive, …) → its (driver, address, key);
// null outside the backends tree. What a folder picker for transfers needs,
// where backendFolderTarget's file-only filter is too narrow.
export function backendTreeTarget(path: string, backends?: Backend[]): { driver: string; address: string; key: string } | null {
  const match = matchBackendByTreePath(path, backends)
  if (match) return { driver: match.backend.driver, address: match.backend.address, key: match.key }
  const fallback = backendFolderTarget(path)
  return fallback ? { ...fallback, driver: backends?.find(b => b.address === fallback.address)?.driver || fallback.driver } : null
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
): Promise<DocumentsEnvelope> {
  const params = new URLSearchParams()
  if (options.linked !== undefined) params.append('linked', String(options.linked))
  if (options.limit !== undefined) params.append('limit', String(options.limit))
  if (options.offset !== undefined) params.append('offset', String(options.offset))
  const qs = params.toString()
  return await api.getEnvelope<CanvasDocument[]>(`${backendPath(workspaceId, driver, address)}/documents${qs ? `?${qs}` : ''}`)
}

// Pre-create folder discovery for the "add account" flow (no instance yet).
export async function discoverBackendFolders(workspaceId: string, driver: string, config: Record<string, unknown>): Promise<BackendFolder[]> {
  const response = await api.post<BackendFolder[]>(`${backendsBase(workspaceId)}/${encodeURIComponent(driver)}/discover`, config);
  return response || [];
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
  const response = await api.get<WorkspaceHookFile[]>(`${API_ROUTES.workspaces}/${workspaceId}/hooks`);
  return response || [];
}

export async function getWorkspaceHook(workspaceId: string, hookPath: string): Promise<{ path: string; content: string }> {
  const response = await api.get<{ path: string; content: string }>(
    `${API_ROUTES.workspaces}/${workspaceId}/hooks/${encodeURIComponent(hookPath).replace(/%2F/g, '/')}`
  );
  return response;
}

export async function saveWorkspaceHook(workspaceId: string, hookPath: string, content: string): Promise<{ path: string }> {
  const response = await api.put<{ path: string }>(
    `${API_ROUTES.workspaces}/${workspaceId}/hooks/${encodeURIComponent(hookPath).replace(/%2F/g, '/')}`,
    { content }
  );
  return response;
}

export async function deleteWorkspaceHook(workspaceId: string, hookPath: string): Promise<{ path: string }> {
  const response = await api.delete<{ path: string }>(
    `${API_ROUTES.workspaces}/${workspaceId}/hooks/${encodeURIComponent(hookPath).replace(/%2F/g, '/')}`
  );
  return response;
}

// ─── Bitmaps ────────────────────────────────────────────────────────────────

// Prefixes that are structural/internal and not shown to users in the toolbox.
const EXCLUDED_BITMAP_PREFIXES = ['internal/', 'context/', 'vfs/']

export async function listWorkspaceBitmaps(workspaceId: string): Promise<string[]> {
  try {
    const response = await api.get<unknown[]>(
      `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/bitmaps`
    )
    const items = response || []
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
  await api.delete<{ key: string }>(
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
  const res = await api.get<WorkspaceDataset[]>(
    `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/datasets`
  )
  return res || []
}

export async function deleteWorkspaceDataset(
  workspaceId: string,
  name: string,
  dropDocuments = true
): Promise<{ name: string; documentsDeleted: number }> {
  const cleaned = name.replace(/^data\/dataset\//, '').replace(/^\/+|\/+$/g, '')
  if (!cleaned) throw new Error('Dataset name is required')
  if (cleaned === 'default') throw new Error('The "default" dataset is virtual and cannot be deleted')
  const res = await api.delete<{ name: string; documentsDeleted: number }>(
    `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/datasets/${cleaned.split('/').map(encodeURIComponent).join('/')}?dropDocuments=${dropDocuments}`
  )
  return res
}

// ─── Timeline API ─────────────────────────────────────────────────────────────

function timelineBase(workspaceId: string) {
  return `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/timelines`
}

export async function listWorkspaceTimelines(workspaceId: string): Promise<string[]> {
  try {
    const res = await api.get<string[]>(timelineBase(workspaceId))
    return res || []
  } catch {
    return []
  }
}

// Verbose listing: one call returns each timeline with its observed scale
// tiers (coarse→fine; informational — tiling is adaptive, nothing to set).
export async function listWorkspaceTimelinesVerbose(workspaceId: string): Promise<TimelineInfo[]> {
  try {
    const res = await api.get<TimelineInfo[]>(`${timelineBase(workspaceId)}?verbose=true`)
    return res || []
  } catch {
    return []
  }
}

export async function createWorkspaceTimeline(workspaceId: string, name: string): Promise<TimelineInfo> {
  const res = await api.post<TimelineInfo>(timelineBase(workspaceId), { name })
  return res
}

export async function deleteWorkspaceTimeline(workspaceId: string, name: string): Promise<boolean> {
  await api.delete<unknown>(`${timelineBase(workspaceId)}/${encodeURIComponent(name)}`)
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
  const res = await api.post<{ buckets: TimelineHistogramBucket[] }>(
    `${timelineBase(workspaceId)}/histogram`,
    request,
  )
  return res?.buckets ?? []
}

export async function queryWorkspaceTimeline(
  workspaceId: string,
  timelineName: string,
  interval: TimelineQueryInterval,
  options: TimelineQueryOptions = {},
): Promise<number[]> {
  const res = await api.post<number[]>(
    `${timelineBase(workspaceId)}/${encodeURIComponent(timelineName)}/query`,
    { ...interval, ...options },
  )
  return res || []
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
    imageMaxDistance?: number | null
    imageFloorMode?: 'relative' | 'absolute'
    imageRelativeMargin?: number
    searchWeights?: { fts?: number; dense?: number; image?: number }
    vector?: { ready: boolean; rowCount?: number; error?: string } | Record<string, unknown>
    vectorSpaces?: Record<string, { ready: boolean; dim?: number; chunkRows?: number; embeddedDocs?: number; error?: string }>
    queue?: { pending: number; draining: boolean } | null
  }
  inferd?: {
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
  const res = await api.post<{ paused: boolean; pending: number; workspace?: string }>(
    `${API_ROUTES.admin.inferd}/${paused ? 'pause' : 'resume'}${query}`,
  )
  return res
}

export async function getWorkspaceDbStats(workspaceId: string): Promise<WorkspaceDbStats> {
  const res = await api.get<WorkspaceDbStats>(`${API_ROUTES.workspaces}/${workspaceId}/db/stats`)
  return res
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
  const res = await api.put<{ semantic: { imageMaxDistance?: number | null; imageFloorMode?: 'relative' | 'absolute'; imageRelativeMargin?: number; searchWeights?: SearchWeights } }>(
    `${API_ROUTES.workspaces}/${workspaceId}/db/tuning`,
    tuning,
  )
  return res
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
  const response = await api.get<TrashedDocument[]>(
    `${API_ROUTES.workspaces}/${workspaceId}/trash`
  )
  return Array.isArray(response) ? response : []
}

export async function restoreFromTrash(
  workspaceId: string,
  documentIds: readonly (string | number)[]
): Promise<{ restored: number[]; failed: Array<{ id: number; error: string }> }> {
  const response = await api.post<{ restored: number[]; failed: Array<{ id: number; error: string }> }>(
    `${API_ROUTES.workspaces}/${workspaceId}/trash/restore`,
    { documentIds: normalizeDocumentIds(documentIds) }
  )
  return response
}

export async function emptyTrash(
  workspaceId: string,
  documentIds?: readonly (string | number)[]
): Promise<{ destroyed: number[]; failed: unknown[] }> {
  const response = await api.delete<{ destroyed: number[]; failed: unknown[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/trash`,
    documentIds?.length
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentIds: normalizeDocumentIds(documentIds) }) }
      : {}
  )
  return response
}

// ─── Members: e-mail / directory-group shares (team workspaces) ─────────────

export type WorkspacePermission = 'read' | 'write' | 'admin'

export interface WorkspaceMember {
  type: 'user' | 'group'
  /** e-mail (user) or directory group DN / CN (group) */
  principal: string
  permissions: WorkspacePermission[]
  description?: string
  grantedAt?: string
  grantedBy?: string | null
  updatedAt?: string
  /** users only: false when the e-mail has no account here yet (share applies at first sign-in) */
  userExists?: boolean
}

export interface WorkspaceMembersResponse {
  owner: string
  isOwner: boolean
  /** false for the universe workspace, which can never be shared */
  shareable: boolean
  members: WorkspaceMember[]
}

const memberPath = (workspaceId: string, type: 'user' | 'group', principal: string) =>
  `${API_ROUTES.workspaces}/${workspaceId}/members/${encodeURIComponent(`${type}:${principal}`)}`

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMembersResponse> {
  return api.get(`${API_ROUTES.workspaces}/${workspaceId}/members`)
}

export async function grantWorkspaceMember(
  workspaceId: string,
  who: { email: string } | { group: string },
  permissions: WorkspacePermission[],
  description?: string,
): Promise<WorkspaceMember> {
  return api.post(`${API_ROUTES.workspaces}/${workspaceId}/members`, { ...who, permissions, ...(description ? { description } : {}) })
}

export async function updateWorkspaceMember(
  workspaceId: string,
  type: 'user' | 'group',
  principal: string,
  permissions: WorkspacePermission[],
): Promise<WorkspaceMember> {
  return api.put(memberPath(workspaceId, type, principal), { permissions })
}

export async function revokeWorkspaceMember(workspaceId: string, type: 'user' | 'group', principal: string): Promise<void> {
  await api.delete(memberPath(workspaceId, type, principal))
}

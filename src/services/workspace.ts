import { API_ROUTES } from '@/config/api';
import { api } from '@/lib/api';
import type { TreeNode } from '@/types/workspace';
// GLOBAL Workspace type from src/types/api.d.ts will be used.
// No local Workspace interface should be defined here.

export const INCOMING_ROOT_CONTEXT = '/.incoming'
export const DEFAULT_WORKSPACE_TREE_NAME = 'context'

function appendWorkspaceContext(params: URLSearchParams, contextSpec: string = '/') {
  params.append('tree', DEFAULT_WORKSPACE_TREE_NAME)
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

function getWorkspaceTreeBaseRoute(workspaceId: string, treeName = DEFAULT_WORKSPACE_TREE_NAME) {
  return `${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}`
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
): Promise<{ payload: TreeNode; status: string; statusCode: number; message: string }> {
  try {
    return await api.get<{ payload: TreeNode; status: string; statusCode: number; message: string }>(
      `${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}`
    );
  } catch (error) {
    console.error(`Failed to get workspace tree ${workspaceId}/${treeName}:`, error);
    throw error;
  }
}

// Get workspace documents
export async function getWorkspaceDocuments(
  id: string,
  contextSpec: string = '/',
  featureArray: string[] = [],
  options: { limit?: number; offset?: number; page?: number; includeIncoming?: boolean; treeName?: string; treeType?: string; q?: string; anyOf?: string[]; noneOf?: string[] } = {}
): Promise<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string }> {
  try {
    const params = new URLSearchParams();
    params.append('treeNameOrTreeId', options.treeName || DEFAULT_WORKSPACE_TREE_NAME)
    if (options.treeType) params.append('treeType', options.treeType)
    if (contextSpec) params.append('context', contextSpec)
    appendAllOf(params, featureArray)
    appendAnyOf(params, options.anyOf)
    appendNoneOf(params, options.noneOf)
    if (options.includeIncoming) params.append('includeIncoming', 'true')
    if (options.limit !== undefined) params.append('limit', options.limit.toString());
    if (options.offset !== undefined) params.append('offset', options.offset.toString());
    if (options.page !== undefined) params.append('page', options.page.toString());
    if (options.q && options.q.trim()) params.append('q', options.q.trim());

    const queryString = params.toString();
    const url = `${API_ROUTES.workspaces}/${id}/documents${queryString ? '?' + queryString : ''}`;

    return await api.get<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string }>(url);
  } catch (error) {
    console.error(`Failed to get workspace documents ${id}:`, error);
    throw error;
  }
}

export async function getWorkspaceLayerDocuments(
  id: string,
  treeName: string,
  layerId: string,
  options: { limit?: number; offset?: number; page?: number; q?: string; allOf?: string[]; anyOf?: string[]; noneOf?: string[] } = {}
): Promise<{ payload: import('@/types/workspace').Document[]; count?: number; totalCount?: number; status: string; statusCode: number; message: string }> {
  try {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.append('limit', options.limit.toString());
    if (options.offset !== undefined) params.append('offset', options.offset.toString());
    if (options.page !== undefined) params.append('page', options.page.toString());
    if (options.q && options.q.trim()) params.append('q', options.q.trim());
    appendAllOf(params, options.allOf);
    appendAnyOf(params, options.anyOf);
    appendNoneOf(params, options.noneOf);
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
export async function insertWorkspacePath(workspaceId: string, path: string, autoCreateLayers = true, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<boolean> {
  try {
    const response = await api.post<{ payload: boolean; message: string; status: string; statusCode: number }>(
      `${getWorkspaceTreeBaseRoute(workspaceId, treeName)}/paths`,
      { path, autoCreateLayers }
    );
    return response.payload;
  } catch (error) {
    console.error(`Failed to insert workspace path ${path}:`, error);
    throw error;
  }
}

export async function removeWorkspacePath(workspaceId: string, path: string, recursive = false, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<boolean> {
  try {
    const params = new URLSearchParams({ path, recursive: recursive.toString() });
    const response = await api.delete<{ payload: boolean; message: string; status: string; statusCode: number }>(
      `${getWorkspaceTreeBaseRoute(workspaceId, treeName)}/paths?${params.toString()}`
    );
    return response.payload;
  } catch (error) {
    console.error(`Failed to remove workspace path ${path}:`, error);
    throw error;
  }
}

export async function moveWorkspacePath(workspaceId: string, fromPath: string, toPath: string, recursive = false, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<boolean> {
  try {
    const response = await api.post<{ payload: boolean; message: string; status: string; statusCode: number }>(
      `${getWorkspaceTreeBaseRoute(workspaceId, treeName)}/paths/move`,
      { from: fromPath, to: toPath, recursive }
    );
    return response.payload;
  } catch (error) {
    console.error(`Failed to move workspace path from ${fromPath} to ${toPath}:`, error);
    throw error;
  }
}

export async function copyWorkspacePath(workspaceId: string, fromPath: string, toPath: string, recursive = false, treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<boolean> {
  try {
    const response = await api.post<{ payload: boolean; message: string; status: string; statusCode: number }>(
      `${getWorkspaceTreeBaseRoute(workspaceId, treeName)}/paths/copy`,
      { from: fromPath, to: toPath, recursive }
    );
    return response.payload;
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

export async function importDocumentsToWorkspacePath(workspaceId: string, path: string, documents: unknown[], treeName = DEFAULT_WORKSPACE_TREE_NAME, treeType: 'context' | 'directory' = 'context'): Promise<boolean> {
  try {
    const docs = Array.isArray(documents) ? documents : [documents]
    await api.post<{ payload: unknown; message: string; status: string; statusCode: number }>(
      `${API_ROUTES.workspaces}/${workspaceId}/documents`,
      { documents: docs, treeNameOrTreeId: treeName, treeType, context: path }
    );
    return true;
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

export async function convertWorkspaceLayer(workspaceId: string, layerId: string, targetType: 'context' | 'canvas', treeName = DEFAULT_WORKSPACE_TREE_NAME): Promise<Layer> {
  const res = await api.post<{ payload: Layer }>(`${API_ROUTES.workspaces}/${workspaceId}/trees/${encodeURIComponent(treeName)}/layers/${encodeURIComponent(layerId)}/convert`, { targetType })
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
  featureArray: string[] = []
): Promise<boolean> {
  const params = new URLSearchParams()
  appendWorkspaceContext(params, contextSpec)
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
  featureArray: string[] = []
): Promise<boolean> {
  const params = new URLSearchParams()
  appendWorkspaceContext(params, contextSpec)
  appendAllOf(params, featureArray)
  const ids = normalizeDocumentIds(documentIds)
  await api.delete(`${API_ROUTES.workspaces}/${workspaceId}/documents?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids),
  })
  return true
}

export interface EvictResult {
  successful: { id: number; action: string; backendsCleared?: string[]; remainingBackends?: string[] }[]
  failed: { id: number; reason: string; backends?: string[] }[]
  skipped: { id: number; reason: string }[]
}

export async function evictWorkspaceDocuments(
  workspaceId: string,
  documentIds: readonly (string | number)[],
  backends?: string[]
): Promise<EvictResult> {
  const ids = normalizeDocumentIds(documentIds)
  const response = await api.delete<{ payload: EvictResult }>(
    `${API_ROUTES.workspaces}/${workspaceId}/documents/evict`,
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backends ? { documentIds: ids, backends } : { documentIds: ids }),
    }
  )
  return response.payload
}

export async function purgeWorkspaceDocuments(
  workspaceId: string,
  contextSpec: string = '/',
  featureArray: string[] = [],
  filterArray: string[] = [],
  options: { includeIncoming?: boolean } = {}
): Promise<{ requested: number; deleted: number }> {
  const params = new URLSearchParams()
  appendWorkspaceContext(params, contextSpec)
  appendAllOf(params, featureArray)
  appendFilters(params, filterArray)
  if (options.includeIncoming) params.append('includeIncoming', 'true')
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
  mailboxCount?: number;
  activeMailboxCount?: number;
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

export interface WorkspaceServicesStatus {
  dotfiles: WorkspaceServiceStatus;
  home?: WorkspaceServiceStatus;
  imap?: WorkspaceServiceStatus;
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
  serviceName: 'dotfiles' | 'home' | 'imap'
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
  serviceName: 'dotfiles' | 'home' | 'imap'
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

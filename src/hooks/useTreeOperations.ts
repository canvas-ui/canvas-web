/**
 * useTreeOperations — unified hook for context and workspace tree path/layer operations.
 * Callbacks are named to match MenuTreeViewProps so they can be spread directly.
 *
 * Usage:
 *   const ops = useTreeOperations({ contextId: 'myCtx', onRefresh })
 *   const ops = useTreeOperations({ workspaceId: 'myWs', treeName: 'directory', onRefresh })
 */
import { useCallback } from 'react'
import {
  insertContextPath, removeContextPath, moveContextPath, copyContextPath,
  mergeContextLayer, subtractContextLayer, updateContextPath,
} from '@/services/context'
import type { LayerMetadata } from '@/types/workspace'
import {
  insertWorkspacePath, removeWorkspacePath, moveWorkspacePath, copyWorkspacePath,
  mergeWorkspaceLayer, subtractWorkspaceLayer,
  lockWorkspaceLayer, unlockWorkspaceLayer, destroyWorkspaceLayer,
  updateWorkspacePath,
  syncBackend,
  listBackends,
  backendAddressFromTreePath,
  addBackendContainers,
  removeBackendContainer,
  renameBackendContainer,
  backendFolderTarget,
  DEFAULT_WORKSPACE_TREE_NAME,
} from '@/services/workspace'

interface UseTreeOperationsOptions {
  contextId?: string
  workspaceId?: string
  treeName?: string   // workspace tree name; defaults to DEFAULT_WORKSPACE_TREE_NAME
  onRefresh?: () => void
}

export function useTreeOperations({ contextId, workspaceId, treeName, onRefresh }: UseTreeOperationsOptions) {
  const wsTree = treeName || DEFAULT_WORKSPACE_TREE_NAME
  const isDirectoryTree = wsTree === 'directory'

  const refresh = useCallback((delay = 150) => {
    if (onRefresh) setTimeout(onRefresh, delay)
    // Notify the content area (WorkspaceDetailPage) so it force-reloads its own
    // tree and re-detects node types (e.g. a freshly created canvas). Without
    // this, menu-driven mutations only refresh the menu's tree.
    if (workspaceId) {
      setTimeout(() => window.dispatchEvent(
        new CustomEvent('workspace:tree:refresh', { detail: { workspaceName: workspaceId } })
      ), delay)
    }
  }, [onRefresh, workspaceId])

  const onInsertPath = useCallback(async (path: string, autoCreateLayers = true): Promise<boolean> => {
    let result: boolean
    if (contextId) result = await insertContextPath(contextId, path, autoCreateLayers)
    else if (workspaceId) result = await insertWorkspacePath(workspaceId, path, autoCreateLayers, wsTree)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  const onRemovePath = useCallback(async (path: string, recursive = false, purge = false, destroy = false): Promise<boolean> => {
    let result: boolean
    if (contextId) result = await removeContextPath(contextId, path, recursive)
    else if (workspaceId) result = await removeWorkspacePath(workspaceId, path, recursive, wsTree, purge, destroy)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  // Rename = move to same parent with a new last segment
  const onRenamePath = useCallback(async (fromPath: string, newName: string): Promise<boolean> => {
    let result: boolean
    if (contextId) {
      const parts = fromPath.split('/')
      parts[parts.length - 1] = newName
      result = await moveContextPath(contextId, fromPath, parts.join('/'), false)
    } else if (workspaceId) result = await updateWorkspacePath(workspaceId, fromPath, { name: newName }, wsTree)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  const onMovePath = useCallback(async (from: string, to: string, recursive = false, sourceTreeName = wsTree, targetTreeName = wsTree): Promise<boolean> => {
    let result: boolean
    if (contextId) result = await moveContextPath(contextId, from, to, recursive)
    else if (workspaceId) result = await moveWorkspacePath(workspaceId, from, to, recursive, sourceTreeName, targetTreeName)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  const onCopyPath = useCallback(async (from: string, to: string, recursive = false, sourceTreeName = wsTree, targetTreeName = wsTree): Promise<boolean> => {
    let result: boolean
    if (contextId) result = await copyContextPath(contextId, from, to, recursive)
    else if (workspaceId) result = await copyWorkspacePath(workspaceId, from, to, recursive, sourceTreeName, targetTreeName)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  // Style-only updates (icon/color) are rendered optimistically by the tree,
  // so we deliberately skip the refetch to avoid a disruptive full re-render.
  const onUpdateNode = useCallback(async (path: string, updates: { metadata?: LayerMetadata }): Promise<boolean> => {
    if (contextId) return await updateContextPath(contextId, path, updates)
    if (workspaceId) return await updateWorkspacePath(workspaceId, path, updates, wsTree)
    return false
  }, [contextId, workspaceId, wsTree])

  const onMergeLayer = useCallback(async (layerId: string, targetLayers: string[]): Promise<unknown> => {
    let result: unknown
    if (contextId) result = await mergeContextLayer(contextId, layerId, targetLayers)
    else if (workspaceId) result = await mergeWorkspaceLayer(workspaceId, layerId, targetLayers, wsTree)
    else return null
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  const onSubtractLayer = useCallback(async (layerId: string, targetLayers: string[]): Promise<unknown> => {
    let result: unknown
    if (contextId) result = await subtractContextLayer(contextId, layerId, targetLayers)
    else if (workspaceId) result = await subtractWorkspaceLayer(workspaceId, layerId, targetLayers, wsTree)
    else return null
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  // Lock/unlock only supported for workspace trees
  const onLockLayer = useCallback(async (layerId: string): Promise<boolean> => {
    if (!workspaceId) return false
    const result = await lockWorkspaceLayer(workspaceId, layerId, workspaceId, wsTree)
    refresh(300) // extra delay to ensure lock state is committed before re-fetch
    return result
  }, [workspaceId, wsTree, refresh])

  // lockBy lets the caller target a specific holder (selective lock removal).
  // Removing one holder while others remain returns 409 ("still locked by …"),
  // which is the expected outcome here, so we swallow it and refresh.
  const onUnlockLayer = useCallback(async (layerId: string, lockBy?: string): Promise<boolean> => {
    if (!workspaceId) return false
    try {
      await unlockWorkspaceLayer(workspaceId, layerId, lockBy ?? workspaceId, wsTree)
    } catch (err) {
      if (!(err instanceof Error) || !/still locked by/i.test(err.message)) throw err
    }
    refresh(300)
    return true
  }, [workspaceId, wsTree, refresh])

  const onDestroyLayer = useCallback(async (layerId: string): Promise<boolean> => {
    if (!workspaceId) return false
    const result = await destroyWorkspaceLayer(workspaceId, layerId, wsTree)
    refresh()
    return result
  }, [workspaceId, wsTree, refresh])

  // Resync a backend from its backends-tree mirror node path. Parse the node to
  // its (driver, address) pair and hit the unified /backends/:driver/:address
  // /sync endpoint; the server dispatches by driver (imap account fan-out vs
  // storage scan). MVP resyncs the whole backend/account.
  const onResyncBackend = useCallback(async (path: string): Promise<boolean> => {
    if (!workspaceId) return false
    // Backends list resolves device-scoped mount nodes (/device/<device>/<mount>)
    // by treePath; fetched per op — these are rare, user-triggered actions.
    const backends = await listBackends(workspaceId).catch(() => [])
    const target = backendAddressFromTreePath(path, backends)
    if (!target) return false
    await syncBackend(workspaceId, target.driver, target.address)
    refresh(300)
    return true
  }, [workspaceId, refresh])

  // ── Backend file-folder ops (writable file backends in the backends tree) ──
  // Real fs directories on the backend; the server mirrors them into the tree
  // (empty folders included). key '' = the backend root node (children only).
  const onCreateBackendFolder = useCallback(async (parentPath: string, name: string): Promise<boolean> => {
    if (!workspaceId) return false
    const backends = await listBackends(workspaceId).catch(() => [])
    const t = backendFolderTarget(parentPath, backends)
    if (!t) return false
    const key = t.key ? `${t.key}/${name}` : name
    await addBackendContainers(workspaceId, t.driver, t.address, [key])
    refresh(200)
    return true
  }, [workspaceId, refresh])

  const onRenameBackendFolder = useCallback(async (path: string, newName: string): Promise<boolean> => {
    if (!workspaceId) return false
    const backends = await listBackends(workspaceId).catch(() => [])
    const t = backendFolderTarget(path, backends)
    if (!t || !t.key) return false
    await renameBackendContainer(workspaceId, t.driver, t.address, t.key, newName)
    refresh(200)
    return true
  }, [workspaceId, refresh])

  const onDeleteBackendFolder = useCallback(async (path: string): Promise<boolean> => {
    if (!workspaceId) return false
    const backends = await listBackends(workspaceId).catch(() => [])
    const t = backendFolderTarget(path, backends)
    if (!t || !t.key) return false
    await removeBackendContainer(workspaceId, t.driver, t.address, t.key)
    refresh(200)
    return true
  }, [workspaceId, refresh])

  return {
    onInsertPath, onRemovePath, onRenamePath, onMovePath, onCopyPath,
    onUpdateNode,
    onMergeLayer, onSubtractLayer,
    onLockLayer: workspaceId ? onLockLayer : undefined,
    onUnlockLayer: workspaceId ? onUnlockLayer : undefined,
    onDestroyLayer: workspaceId && !isDirectoryTree ? onDestroyLayer : undefined,
    onResyncBackend: workspaceId ? onResyncBackend : undefined,
    onCreateBackendFolder: workspaceId ? onCreateBackendFolder : undefined,
    onRenameBackendFolder: workspaceId ? onRenameBackendFolder : undefined,
    onDeleteBackendFolder: workspaceId ? onDeleteBackendFolder : undefined,
  }
}

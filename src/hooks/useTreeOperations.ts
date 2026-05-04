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
  mergeContextLayer, subtractContextLayer,
} from '@/services/context'
import {
  insertWorkspacePath, removeWorkspacePath, moveWorkspacePath, copyWorkspacePath,
  mergeWorkspaceLayer, subtractWorkspaceLayer, convertWorkspaceLayer,
  lockWorkspaceLayer, unlockWorkspaceLayer, destroyWorkspaceLayer,
  DEFAULT_WORKSPACE_TREE_NAME,
} from '@/services/workspace'
import { createCanvas } from '@/services/canvas'

interface UseTreeOperationsOptions {
  contextId?: string
  workspaceId?: string
  treeName?: string   // workspace tree name; defaults to DEFAULT_WORKSPACE_TREE_NAME
  onRefresh?: () => void
}

export function useTreeOperations({ contextId, workspaceId, treeName, onRefresh }: UseTreeOperationsOptions) {
  const wsTree = treeName || DEFAULT_WORKSPACE_TREE_NAME

  const refresh = useCallback((delay = 150) => {
    if (onRefresh) setTimeout(onRefresh, delay)
  }, [onRefresh])

  const onInsertPath = useCallback(async (path: string, autoCreateLayers = true): Promise<boolean> => {
    let result: boolean
    if (contextId) result = await insertContextPath(contextId, path, autoCreateLayers)
    else if (workspaceId) result = await insertWorkspacePath(workspaceId, path, autoCreateLayers, wsTree)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  const onRemovePath = useCallback(async (path: string, recursive = false): Promise<boolean> => {
    let result: boolean
    if (contextId) result = await removeContextPath(contextId, path, recursive)
    else if (workspaceId) result = await removeWorkspacePath(workspaceId, path, recursive, wsTree)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  // Rename = move to same parent with a new last segment
  const onRenamePath = useCallback(async (fromPath: string, newName: string): Promise<boolean> => {
    const parts = fromPath.split('/')
    parts[parts.length - 1] = newName
    const toPath = parts.join('/')
    let result: boolean
    if (contextId) result = await moveContextPath(contextId, fromPath, toPath, false)
    else if (workspaceId) result = await moveWorkspacePath(workspaceId, fromPath, toPath, false, wsTree)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  const onMovePath = useCallback(async (from: string, to: string, recursive = false): Promise<boolean> => {
    let result: boolean
    if (contextId) result = await moveContextPath(contextId, from, to, recursive)
    else if (workspaceId) result = await moveWorkspacePath(workspaceId, from, to, recursive, wsTree)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  const onCopyPath = useCallback(async (from: string, to: string, recursive = false): Promise<boolean> => {
    let result: boolean
    if (contextId) result = await copyContextPath(contextId, from, to, recursive)
    else if (workspaceId) result = await copyWorkspacePath(workspaceId, from, to, recursive, wsTree)
    else return false
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  const onMergeLayer = useCallback(async (layerId: string, targetLayers: string[]): Promise<any> => {
    let result: any
    if (contextId) result = await mergeContextLayer(contextId, layerId, targetLayers)
    else if (workspaceId) result = await mergeWorkspaceLayer(workspaceId, layerId, targetLayers, wsTree)
    else return null
    refresh()
    return result
  }, [contextId, workspaceId, wsTree, refresh])

  const onSubtractLayer = useCallback(async (layerId: string, targetLayers: string[]): Promise<any> => {
    let result: any
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

  const onUnlockLayer = useCallback(async (layerId: string): Promise<boolean> => {
    if (!workspaceId) return false
    const result = await unlockWorkspaceLayer(workspaceId, layerId, workspaceId, wsTree)
    refresh(300)
    return result
  }, [workspaceId, wsTree, refresh])

  const onDestroyLayer = useCallback(async (layerId: string): Promise<boolean> => {
    if (!workspaceId) return false
    const result = await destroyWorkspaceLayer(workspaceId, layerId, wsTree)
    refresh()
    return result
  }, [workspaceId, wsTree, refresh])

  const onConvertLayer = useCallback(async (layerId: string, targetType: 'context' | 'canvas'): Promise<any> => {
    if (!workspaceId) return null
    const result = await convertWorkspaceLayer(workspaceId, layerId, targetType, wsTree)
    refresh()
    return result
  }, [workspaceId, wsTree, refresh])

  const onCreateCanvas = useCallback(async (path: string): Promise<boolean> => {
    if (!workspaceId) return false
    try {
      await createCanvas(workspaceId, { path, treeName: wsTree })
      refresh()
      return true
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
      return false
    }
  }, [workspaceId, wsTree, refresh])

  return {
    onInsertPath, onRemovePath, onRenamePath, onMovePath, onCopyPath,
    onMergeLayer, onSubtractLayer,
    onLockLayer: workspaceId ? onLockLayer : undefined,
    onUnlockLayer: workspaceId ? onUnlockLayer : undefined,
    onDestroyLayer: workspaceId ? onDestroyLayer : undefined,
    onConvertLayer: workspaceId ? onConvertLayer : undefined,
    onCreateCanvas: workspaceId ? onCreateCanvas : undefined,
  }
}

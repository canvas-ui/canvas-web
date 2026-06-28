import { useMemo } from 'react'
import { useToolbox } from '../toolbox-context'
import {
  DEFAULT_WORKSPACE_TREE_NAME,
  importDocumentsToWorkspacePath,
  listWorkspaceTrees,
} from '@/services/workspace'
import { insertDocumentsToContextById } from '@/services/context'

export type AddTarget =
  | { mode: 'workspace'; workspaceName: string; path: string; treeName: string; treeType: 'context' | 'directory' }
  | { mode: 'context'; contextId: string }
  | null

// Derives where new documents should be inserted from the current navigation:
// - context mode  -> the active context (inserts at its url path)
// - workspace mode -> the selected tree path (covers plain layers and canvases)
export function useAddTarget(): AddTarget {
  const { state } = useToolbox()
  const {
    activeContextType,
    activeContextId,
    activeWorkspaceName,
    activeTreeName,
    activeContextPath,
  } = state

  return useMemo<AddTarget>(() => {
    if (activeContextType === 'context' && activeContextId) {
      return { mode: 'context', contextId: activeContextId }
    }
    if (activeWorkspaceName && activeContextPath) {
      return {
        mode: 'workspace',
        workspaceName: activeWorkspaceName,
        path: activeContextPath,
        treeName: activeTreeName || DEFAULT_WORKSPACE_TREE_NAME,
        // Best-effort default; submitDocuments resolves the real type so inserts
        // into directory (incl. virtual directory) trees aren't mislabelled.
        treeType: (activeTreeName === 'directory' ? 'directory' : 'context'),
      }
    }
    return null
  }, [activeContextType, activeContextId, activeWorkspaceName, activeTreeName, activeContextPath])
}

// A document carries its own tags inside metadata.features, so submission is the same
// shape for both targets. Workspace mode additionally fires a refresh event so the
// open list reloads immediately (context mode refreshes via socket events).
export async function submitDocuments(target: AddTarget, documents: Record<string, unknown>[]): Promise<boolean> {
  if (!target) throw new Error('No active workspace or context to add to')

  if (target.mode === 'workspace') {
    // Resolve the actual tree type by name so directory / virtual-directory trees
    // get treeType:'directory' (the server otherwise builds a context selector and
    // throws "Tree is not a context tree").
    let treeType = target.treeType
    try {
      const trees = await listWorkspaceTrees(target.workspaceName)
      const match = trees.find((t) => t?.name === target.treeName || t?.id === target.treeName)
      if (match?.type === 'directory' || match?.type === 'context') treeType = match.type
    } catch {
      /* fall back to the best-effort type from useAddTarget */
    }

    const ok = await importDocumentsToWorkspacePath(
      target.workspaceName,
      target.path,
      documents,
      target.treeName,
      treeType,
    )
    if (ok) {
      window.dispatchEvent(
        new CustomEvent('workspace:documents:refresh', {
          detail: { workspaceName: target.workspaceName, treeName: target.treeName },
        }),
      )
    }
    return ok
  }

  return insertDocumentsToContextById(target.contextId, documents)
}

export function describeTarget(target: AddTarget): string {
  if (!target) return 'No destination — open a workspace path or a context first'
  if (target.mode === 'context') return 'Adds to the current context'
  return `Adds to ${target.path === '/' ? '/' : target.path}`
}

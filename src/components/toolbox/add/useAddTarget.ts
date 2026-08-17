import { useMemo } from 'react'
import { useToolbox } from '../use-toolbox'
import {
  DEFAULT_WORKSPACE_TREE_NAME,
  importDocumentsToWorkspacePath,
  listWorkspaceTrees,
  pasteDocumentsToWorkspacePath,
} from '@/services/workspace'
import { insertDocumentsToContextById, pasteDocumentsToContext, getContext } from '@/services/context'

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
        // The backends tree is a directory tree, but the server rejects generic
        // inserts into it — the Add toolbox shouldn't target it in the first
        // place (WorkspaceM2 keeps the toolbox on context/directory tabs).
        treeType: (activeTreeName === 'directory' || activeTreeName === 'backends' ? 'directory' : 'context'),
      }
    }
    return null
  }, [activeContextType, activeContextId, activeWorkspaceName, activeTreeName, activeContextPath])
}

// A document carries its own tags inside metadata.features, so submission is the same
// shape for both targets. Workspace mode additionally fires a refresh event so the
// open list reloads immediately (context mode refreshes via socket events).
// Returns the created document ids — callers linking to additional paths
// (multi-select Save/Link To) reuse the first id instead of re-creating.
export async function submitDocuments(target: AddTarget, documents: Record<string, unknown>[]): Promise<number[]> {
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

    const ids = await importDocumentsToWorkspacePath(
      target.workspaceName,
      target.path,
      documents,
      target.treeName,
      treeType,
    )
    if (ids.length) {
      window.dispatchEvent(
        new CustomEvent('workspace:documents:refresh', {
          detail: { workspaceName: target.workspaceName, treeName: target.treeName, path: target.path },
        }),
      )
    }
    return ids
  }

  return insertDocumentsToContextById(target.contextId, documents)
}

// Blob upload (POST /workspaces/:id/blobs) is workspace-scoped. A context is
// always bound to exactly one workspace+tree+path (Context.js getters
// workspaceName/treeId/path server-side), so context-mode targets resolve to
// that binding here rather than needing their own upload path.
export async function resolveUploadWorkspace(target: AddTarget): Promise<{ workspaceName: string; path: string; treeName: string; treeType: 'context' | 'directory' }> {
  if (!target) throw new Error('No active workspace or context to add to')
  if (target.mode === 'workspace') {
    return { workspaceName: target.workspaceName, path: target.path, treeName: target.treeName, treeType: target.treeType }
  }
  const ctx = await getContext(target.contextId)
  const workspaceName = ctx.workspaceName || ctx.workspaceId
  if (!workspaceName) throw new Error('Context has no bound workspace')
  return { workspaceName, path: ctx.path || '/', treeName: ctx.treeId || DEFAULT_WORKSPACE_TREE_NAME, treeType: 'context' }
}

// Links already-existing document ids into the current target (as opposed to
// submitDocuments, which creates new ones). Context-mode resolves the
// context's own bound path first — same path handlePasteDocuments already
// uses (pages/contexts/[contextId]/index.tsx), so this stays consistent with
// the existing clipboard-paste flow rather than a second, subtly different one.
export async function linkExistingDocuments(target: AddTarget, documentIds: number[]): Promise<boolean> {
  if (!target) throw new Error('No active workspace or context to add to')

  if (target.mode === 'workspace') {
    const success = await pasteDocumentsToWorkspacePath(target.workspaceName, target.path, documentIds, target.treeName, target.treeType)
    if (success) {
      window.dispatchEvent(
        new CustomEvent('workspace:documents:refresh', {
          detail: { workspaceName: target.workspaceName, treeName: target.treeName, path: target.path },
        }),
      )
    }
    return success
  }

  const ctx = await getContext(target.contextId)
  return pasteDocumentsToContext(target.contextId, ctx.path || '/', documentIds)
}

export function describeTarget(target: AddTarget): string {
  if (!target) return 'No destination. Open a workspace path or a context first'
  if (target.mode === 'context') return 'Adds to the current context'
  return `Adds to ${target.path === '/' ? '/' : target.path}`
}

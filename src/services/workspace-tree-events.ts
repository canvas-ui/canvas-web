import socketService from '@/lib/socket'
import { invalidateWorkspaceTreeCache } from '@/services/workspace'

export interface TreeRefreshDetail {
  workspaceName?: string
  treeName?: string
  /** The shared socket listener already invalidated this tree's cache. */
  cacheInvalidated?: boolean
}

// Document membership/content never changes the folder hierarchy. Keep this
// separate from the document-list subscriptions, including merge/subtract.
const TREE_EVENTS = [
  'tree.path.inserted', 'tree.path.moved', 'tree.path.removed', 'tree.path.copied',
  'tree.path.locked', 'tree.path.unlocked',
  'tree.layer.updated', 'tree.layer.converted', 'tree.recalculated',
  'tree.created', 'tree.deleted', 'tree.renamed',
  'context.path.changed', 'backend.tree.changed', 'dataBackends.changed', 'services.changed',
]

interface Watcher {
  users: number
  workspaceIds: Set<string>
  stop: () => void
}
const watchers = new Map<string, Watcher>()

/**
 * One socket listener/batch per workspace, shared by the page and sidebar.
 * Invalidate once before notifying either view so they share the same fetch.
 * An open sidebar also works without the workspace detail page mounted.
 */
export function watchWorkspaceTreeChanges(workspaceName: string, workspaceId?: string | null): () => void {
  let watcher = watchers.get(workspaceName)
  if (!watcher) {
    const workspaceIds = new Set<string>([workspaceName])
    const pending = new Set<string | undefined>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const handlers = TREE_EVENTS.map(event => {
      const handler = (payload: Record<string, unknown> = {}) => {
        const id = typeof payload.workspaceId === 'string' ? payload.workspaceId : null
        const name = typeof payload.workspaceName === 'string' ? payload.workspaceName : null
        if (id && !workspaceIds.has(id)) return
        if (!id && name && name !== workspaceName) return

        let treeName = typeof payload.treeName === 'string' ? payload.treeName : undefined
        if (event === 'tree.renamed') treeName = undefined // old name is absent from the event
        else if (event === 'context.path.changed') treeName ??= 'context'
        else if (['backend.tree.changed', 'dataBackends.changed', 'services.changed'].includes(event)) treeName ??= 'backends'
        pending.add(treeName)
        // A fixed window also makes progress during a steady folder import.
        if (timer) return
        timer = setTimeout(() => {
          timer = undefined
          const trees = pending.has(undefined) ? [undefined] : [...pending]
          pending.clear()
          for (const treeName of trees) {
            invalidateWorkspaceTreeCache(workspaceName, treeName)
            window.dispatchEvent(new CustomEvent<TreeRefreshDetail>('workspace:tree:refresh', {
              detail: { workspaceName, treeName, cacheInvalidated: true },
            }))
          }
        }, 200)
      }
      socketService.on(event, handler)
      return [event, handler] as const
    })
    watcher = {
      users: 0,
      workspaceIds,
      stop: () => {
        clearTimeout(timer)
        // Navigating away before the batch fires must still retire stale
        // cached trees, so reopening the workspace sees the new folders.
        for (const treeName of pending) invalidateWorkspaceTreeCache(workspaceName, treeName)
        handlers.forEach(([event, handler]) => socketService.off(event, handler))
      },
    }
    watchers.set(workspaceName, watcher)
  }
  watcher.users++
  if (workspaceId) watcher.workspaceIds.add(workspaceId)
  const active = watcher
  return () => {
    if (--active.users === 0) {
      active.stop()
      watchers.delete(workspaceName)
    }
  }
}

import { useCallback, useEffect, useState } from 'react'
import {
  getWorkspaceDocuments,
  deleteWorkspaceDocuments,
  DEFAULT_WORKSPACE_TREE_NAME,
} from '@/services/workspace'
import { getContextDocuments, getContext } from '@/services/context'
import type { Document } from '@/types/workspace'
import type { AppletTarget } from './use-applet-target'

// One page of the document list - a path binding deliberately shows the first
// page only (the applet is a notepad, not a browser).
export const APPLET_LIST_LIMIT = 50

export const APPLET_AUTOSAVE_MS = 1200

export function formatCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// The workspace surface a target resolves to - update/delete always go through
// a workspace even when the applet is bound to a context.
export interface AppletScope {
  workspaceName: string
  path: string
  treeName: string
  treeType: 'context' | 'directory'
}

// Load + live-refresh one schema's documents for an applet target, and expose
// the resolved scope for writes.
export function useAppletDocs(target: AppletTarget, schema: string) {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<AppletScope | null>(null)

  // Fetch without any synchronous setState — the load effect calls this
  // directly; state updates only happen inside promise callbacks.
  const fetchDocs = useCallback(() => {
    if (!target) return Promise.resolve()
    if (target.mode === 'context') {
      const { contextId } = target
      return Promise.all([
        getContextDocuments(contextId, [schema]),
        getContext(contextId),
      ])
        .then(([list, ctx]) => {
          setDocs(Array.isArray(list) ? (list as unknown as Document[]) : [])
          const wn = ctx.workspaceName || ctx.workspaceId
          setScope(wn ? {
            workspaceName: wn,
            path: ctx.path || '/',
            treeName: ctx.treeId || DEFAULT_WORKSPACE_TREE_NAME,
            treeType: 'context',
          } : null)
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load documents'))
        .finally(() => setLoading(false))
    }
    const { workspaceName, path, treeName, treeType } = target
    return getWorkspaceDocuments(workspaceName, path, [schema], {
      treeName,
      treeType,
      limit: APPLET_LIST_LIMIT,
    })
      .then((res) => {
        setDocs(res.payload || [])
        setScope({ workspaceName, path, treeName, treeType })
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load documents'))
      .finally(() => setLoading(false))
  }, [target, schema])

  // Refresh-event / reload callers keep the sync flag flips (fine in
  // callbacks and handlers).
  const load = useCallback(async () => {
    if (!target) { setDocs([]); setScope(null); return }
    setLoading(true)
    setError(null)
    await fetchDocs()
  }, [target, fetchDocs])

  // For the effect-driven (target/schema change) runs the flag flips happen
  // during render (prev-value-in-state), so the effect itself never calls
  // setState synchronously.
  const [prevKey, setPrevKey] = useState<{ target: AppletTarget; schema: string } | null>(null)
  if (!prevKey || prevKey.target !== target || prevKey.schema !== schema) {
    setPrevKey({ target, schema })
    if (!target) {
      setDocs([])
      setScope(null)
    } else {
      setLoading(true)
      setError(null)
    }
  }

  useEffect(() => { void fetchDocs() }, [fetchDocs])

  // External creates/edits (AddPanel, quick-add cards, other tabs) land live.
  useEffect(() => {
    const onRefresh = () => load()
    window.addEventListener('workspace:documents:refresh', onRefresh)
    return () => window.removeEventListener('workspace:documents:refresh', onRefresh)
  }, [load])

  // Delete = move to workspace trash (same semantics as the document list's
  // Delete action), then drop the row locally.
  const removeDoc = useCallback(async (id: number) => {
    if (!scope) throw new Error('No workspace scope resolved')
    await deleteWorkspaceDocuments(scope.workspaceName, [id], scope.path, [], scope.treeName, scope.treeType)
    setDocs(prev => prev.filter(d => d.id !== id))
  }, [scope])

  return { docs, setDocs, loading, error, scope, reload: load, removeDoc }
}

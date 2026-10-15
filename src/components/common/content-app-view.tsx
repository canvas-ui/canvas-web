import { useCallback, useEffect, useState } from 'react'
import { TODO_SCHEMA } from '@/components/renderers/types'
import { TodoRow } from '@/components/canvas/widgets/TodosWidget'
import { APPLETS } from '@/components/toolbox/applets/registry'
import { AppletTargetProvider } from '@/components/toolbox/applets/applet-target'
import { getCanvasPathDocuments } from '@/services/workspace'
import type { ContentAppId } from './content-views'
import type { Document } from '@/types/workspace'

/**
 * Full content-page app hosted by a view tab (kind 'app') — an app-shaped
 * lens over the SAME layer/path the tab strip belongs to. Todo list renders the
 * interactive task list (tick-done writes through, incl. GitHub write-back
 * connectors). Other built-in apps use the same host as the toolbox.
 */

interface ContentAppViewProps {
  app: Exclude<ContentAppId, 'notes'>
  contextId?: string
  workspaceId: string
  treeName: string
  path: string
}

function useAppDocuments(workspaceId: string, treeName: string, path: string, schema: string, sortBy?: string) {
  // Results tagged with the scope they answer — loading/list are derived at
  // render, and a reload keeps stale docs visible until fresh ones land.
  const scopeKey = `${workspaceId}\0${treeName}\0${path}\0${schema}\0${sortBy ?? ''}`
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState<{ key: string; docs: Document[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    getCanvasPathDocuments(workspaceId, path, treeName, {
      limit: 200, allOf: [schema], ...(sortBy ? { sortBy, order: 'asc' as const } : {}),
    })
      .then((res) => { if (!cancelled) setResult({ key: scopeKey, docs: (res.payload || []) as Document[] }) })
      .catch(() => { if (!cancelled) setResult({ key: scopeKey, docs: [] }) })
    return () => { cancelled = true }
    // scopeKey encodes every scope input below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, reload])

  const docs = result?.key === scopeKey ? result.docs : []
  const isLoading = result?.key !== scopeKey

  // Refresh when documents change elsewhere (quick-add, other panes, sockets).
  useEffect(() => {
    const onRefresh = () => setReload((n) => n + 1)
    window.addEventListener('workspace:documents:refresh', onRefresh)
    return () => window.removeEventListener('workspace:documents:refresh', onRefresh)
  }, [])

  const refresh = useCallback(() => setReload((n) => n + 1), [])
  return { docs, isLoading, refresh }
}

function TodoList({ workspaceId, treeName, path }: Omit<ContentAppViewProps, 'app'>) {
  const { docs, isLoading, refresh } = useAppDocuments(workspaceId, treeName, path, TODO_SCHEMA, 'tasks')
  const [hideDone, setHideDone] = useState(false)
  const visible = hideDone
    ? docs.filter((d) => (d.data as { status?: string })?.status !== 'completed')
    : docs
  const openCount = docs.filter((d) => {
    const s = (d.data as { status?: string })?.status
    return s !== 'completed' && s !== 'cancelled'
  }).length

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col p-4">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{openCount} open</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          hide done
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No todos here.</p>
        ) : (
          visible.map((doc) => (
            <TodoRow key={doc.id} doc={doc} workspaceId={workspaceId} readOnly={false} onChanged={refresh} />
          ))
        )}
      </div>
    </div>
  )
}

/** Notes use DefaultCanvas's document list so its search/actions are shared. */
export function ContentAppView({ app, contextId, ...scope }: ContentAppViewProps) {
  // Lens accepts a resolved workspace/path; the other applets can follow a
  // live context directly. Both bindings describe this tab's own canvas.
  const target = contextId && app !== 'lens'
    ? { mode: 'context' as const, contextId }
    : { mode: 'workspace' as const, workspaceName: scope.workspaceId, treeName: scope.treeName, path: scope.path,
      treeType: (scope.treeName === 'directory' || scope.treeName === 'backends' ? 'directory' : 'context') as 'directory' | 'context' }
  const appletId = app === 'todo-app' ? 'todo' : app === 'notes-app' ? 'notes' : app
  const applet = APPLETS.find(item => item.id === appletId)
  return <AppletTargetProvider target={target}>
    {app === 'todos' ? <TodoList {...scope} /> : applet ? <applet.Component /> : null}
  </AppletTargetProvider>
}

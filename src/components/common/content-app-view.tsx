import { useCallback, useEffect, useState } from 'react'
import { TODO_SCHEMA } from '@/components/renderers/types'
import { TodoRow } from '@/components/canvas/widgets/TodosWidget'
import { DocumentList } from '@/components/common/document-list'
import { getCanvasPathDocuments } from '@/services/workspace'
import type { ContentAppId } from './content-views'
import type { Document } from '@/types/workspace'

/**
 * Full content-page app hosted by a view tab (kind 'app') — an app-shaped
 * lens over the SAME layer/path the tab strip belongs to. Todos renders the
 * interactive task list (tick-done writes through, incl. GitHub write-back
 * connectors); Notes a card list of the path's notes.
 */

const NOTE_SCHEMA = 'data/schema/note'

interface ContentAppViewProps {
  app: ContentAppId
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

function TodosApp({ workspaceId, treeName, path }: Omit<ContentAppViewProps, 'app'>) {
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

function NotesApp({ workspaceId, treeName, path }: Omit<ContentAppViewProps, 'app'>) {
  const { docs, isLoading } = useAppDocuments(workspaceId, treeName, path, NOTE_SCHEMA)
  return (
    <div className="h-full overflow-y-auto p-4">
      <DocumentList
        documents={docs}
        isLoading={isLoading}
        contextPath={path}
        treeName={treeName}
        workspaceId={workspaceId}
        totalCount={docs.length}
        viewMode="card"
      />
    </div>
  )
}

export function ContentAppView({ app, ...scope }: ContentAppViewProps) {
  return app === 'todos' ? <TodosApp {...scope} /> : <NotesApp {...scope} />
}

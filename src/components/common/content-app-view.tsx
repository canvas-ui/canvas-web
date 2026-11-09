import { useCallback, useEffect, useMemo, useState } from 'react'
import { LINK_SCHEMA, TODO_SCHEMA } from '@/components/renderers/types'
import { TodoRow } from '@/components/canvas/widgets/TodosWidget'
import { APPLETS } from '@/components/toolbox/applets/registry'
import { AppletTargetProvider } from '@/components/toolbox/applets/applet-target'
import { getCanvasPathDocuments, treeTypeForName } from '@/services/workspace'
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

function useAppDocuments(workspaceId: string, treeName: string, path: string, allOf: string[], sortBy?: string) {
  // Results tagged with the scope they answer — loading/list are derived at
  // render, and a reload keeps stale docs visible until fresh ones land.
  const scopeKey = `${workspaceId}\0${treeName}\0${path}\0${allOf.join(',')}\0${sortBy ?? ''}`
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState<{ key: string; docs: Document[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    getCanvasPathDocuments(workspaceId, path, treeName, {
      limit: 200, allOf, ...(sortBy ? { sortBy, order: 'asc' as const } : {}),
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
  const { docs, isLoading, refresh } = useAppDocuments(workspaceId, treeName, path, [TODO_SCHEMA], 'tasks')
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

// Web apps linked into this path (data/schema/link + data/type/webapp facet),
// grouped by data.category. Each tile opens the app in a new browser tab.
const WEBAPP_FEATURES = [LINK_SCHEMA, 'data/type/webapp']
const UNCATEGORIZED = 'Other'

function AppsGrid({ workspaceId, treeName, path }: Omit<ContentAppViewProps, 'app'>) {
  const { docs, isLoading } = useAppDocuments(workspaceId, treeName, path, WEBAPP_FEATURES)
  const groups = useMemo(() => {
    const byCategory = new Map<string, Document[]>()
    for (const doc of docs) {
      const raw = String((doc.data as { category?: string })?.category ?? '').trim()
      // Facet keys are case-insensitive, so the grouping is too.
      const key = raw ? raw.toLowerCase() : ''
      const group = byCategory.get(key) ?? []
      group.push(doc)
      byCategory.set(key, group)
    }
    return [...byCategory.entries()]
      .map(([key, items]) => ({
        key,
        label: key ? String((items[0].data as { category?: string }).category).trim() : UNCATEGORIZED,
        items: items.sort((a, b) => appLabel(a).localeCompare(appLabel(b))),
      }))
      .sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.label.localeCompare(b.label))
  }, [docs])

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto p-4">
      {isLoading ? (
        <p className="py-4 text-sm text-muted-foreground">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No web apps here. Add a link and tick “Web app”.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key || UNCATEGORIZED} className="mb-6">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
              {group.items.map((doc) => <AppTile key={doc.id} doc={doc} />)}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function appUri(doc: Document): string {
  return String((doc.data as { uri?: string })?.uri ?? '')
}

function appLabel(doc: Document): string {
  const label = String((doc.data as { label?: string })?.label ?? '').trim()
  if (label) return label
  try { return new URL(appUri(doc)).hostname.replace(/^www\./, '') } catch { return appUri(doc) }
}

function AppTile({ doc }: { doc: Document }) {
  const label = appLabel(doc)
  return (
    <a
      href={appUri(doc)}
      target="_blank"
      rel="noopener noreferrer"
      title={appUri(doc)}
      className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 text-center outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-lg font-semibold text-primary">
        {label.charAt(0).toUpperCase()}
      </span>
      <span className="w-full truncate text-xs text-foreground">{label}</span>
    </a>
  )
}

/** Notes use DefaultCanvas's document list so its search/actions are shared. */
export function ContentAppView({ app, contextId, ...scope }: ContentAppViewProps) {
  // Lens accepts a resolved workspace/path; the other applets can follow a
  // live context directly. Both bindings describe this tab's own canvas.
  const target = contextId && app !== 'lens'
    ? { mode: 'context' as const, contextId }
    : { mode: 'workspace' as const, workspaceName: scope.workspaceId, treeName: scope.treeName, path: scope.path,
      treeType: treeTypeForName(scope.treeName) }
  const appletId = app === 'todo-app' ? 'todo' : app === 'notes-app' ? 'notes' : app
  const applet = APPLETS.find(item => item.id === appletId)
  return <AppletTargetProvider target={target}>
    {app === 'todos' ? <TodoList {...scope} /> : app === 'apps' ? <AppsGrid {...scope} /> : applet ? <applet.Component /> : null}
  </AppletTargetProvider>
}

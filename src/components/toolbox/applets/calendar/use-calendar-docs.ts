import { useCallback, useEffect, useMemo, useState } from 'react'
import { getWorkspaceDocuments, deleteWorkspaceDocuments, listWorkspaceBitmaps, listWorkspaceTimelinesVerbose, DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import { getContextDocuments, getContext } from '@/services/context'
import { EVENT_SCHEMA, TODO_SCHEMA } from '@/components/renderers/types'
import type { Document } from '@/types/workspace'
import type { AppletTarget } from '../use-applet-target'
import type { AppletScope } from '../use-applet-docs'
import { addDays, dateKey, startOfDay } from '@/lib/calendar/dates'

// The visible range, as the timeline filter that selects documents for it.
// Day-granular, one day of padding each side: a series expanded on local
// wall-clock time may sit an hour off the engine's UTC occurrence entries.
export function rangeFilters(start: Date, end: Date): { events: string; tasks: string } {
  const from = dateKey(addDays(startOfDay(start), -1))
  const to = dateKey(addDays(startOfDay(end), 1))
  return { events: `t:events:${from}..${to}`, tasks: `t:tasks:${from}..${to}` }
}

// A single range fetch returns every event and task in [start, end). Views
// pass their own range so a month load never pages; 0 = no limit on the
// workspace side (synapsd semantics), the context API gets a large page.
const CONTEXT_LIMIT = 5000

// Built-in axes are not calendars: lifecycle stamps, content dates, the
// events union and task due dates.
export function isCalendarTimeline(name: string): boolean {
  return !!name && !name.includes(':') && !['content', 'events', 'tasks'].includes(name.toLowerCase())
}

function workspaceKey(target: AppletTarget): string {
  if (!target) return ''
  return target.mode === 'context' ? `ctx:${target.contextId}` : `${target.workspaceName}:${target.treeName}:${target.treeType}:${target.path}`
}

export interface CalendarDocsState {
  docs: Document[]
  loading: boolean
  error: string | null
  scope: AppletScope | null
  /** Every calendar name the workspace has ever filed events under (facet keys, lower-cased). */
  knownCalendars: string[]
  reload: () => Promise<void>
  removeDoc: (id: number) => Promise<void>
  /** Patch a document locally after a write landed. */
  patchDoc: (doc: Document) => void
}

export function useCalendarDocs(target: AppletTarget, start: Date, end: Date, withTasks: boolean): CalendarDocsState {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<AppletScope | null>(null)
  const [knownCalendars, setKnownCalendars] = useState<string[]>([])

  const startMs = start.getTime()
  const endMs = end.getTime()

  // No synchronous setState in here: the effect below calls it directly, so
  // every state update happens inside a promise callback. The loading flag
  // for effect-driven runs flips at render time (prev-key pattern); reload()
  // flips it itself before calling.
  const fetchDocs = useCallback((): Promise<void> => {
    if (!target) return Promise.resolve()
    const filters = rangeFilters(new Date(startMs), new Date(endMs))
    const request = target.mode === 'context'
      ? Promise.all([
          getContextDocuments(target.contextId, [EVENT_SCHEMA], [filters.events], { limit: CONTEXT_LIMIT }),
          withTasks ? getContextDocuments(target.contextId, [TODO_SCHEMA], [filters.tasks], { limit: CONTEXT_LIMIT }) : Promise.resolve([] as unknown[]),
          getContext(target.contextId),
        ]).then(([events, tasks, ctx]) => {
          setDocs([...(events as unknown as Document[]), ...(tasks as unknown as Document[])])
          const wn = ctx.workspaceName || ctx.workspaceId
          setScope(wn ? { workspaceName: wn, path: ctx.path || '/', treeName: ctx.treeId || DEFAULT_WORKSPACE_TREE_NAME, treeType: 'context' } : null)
        })
      : (() => {
          const { workspaceName, path, treeName, treeType } = target
          const options = { treeName, treeType, limit: 0 }
          return Promise.all([
            getWorkspaceDocuments(workspaceName, path, [EVENT_SCHEMA], { ...options, filters: [filters.events] }),
            withTasks ? getWorkspaceDocuments(workspaceName, path, [TODO_SCHEMA], { ...options, filters: [filters.tasks] }) : Promise.resolve({ payload: [] as Document[] }),
          ]).then(([events, tasks]) => {
            setDocs([...(events.payload || []), ...(tasks.payload || [])])
            setScope({ workspaceName, path, treeName, treeType })
          })
        })()
    return request
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load calendar'))
      .finally(() => setLoading(false))
  }, [target, startMs, endMs, withTasks])

  const reload = useCallback(async () => {
    if (!target) { setDocs([]); setScope(null); return }
    setLoading(true)
    setError(null)
    await fetchDocs()
  }, [target, fetchDocs])

  const [prevKey, setPrevKey] = useState<string | null>(null)
  const fetchKey = `${workspaceKey(target)}|${startMs}|${endMs}|${withTasks}`
  if (prevKey !== fetchKey) {
    setPrevKey(fetchKey)
    if (!target) { setDocs([]); setScope(null) } else { setLoading(true); setError(null) }
  }

  useEffect(() => { void fetchDocs() }, [fetchDocs])

  // Creates/edits from other surfaces (add panel, document page, sync) land live.
  useEffect(() => {
    const onRefresh = () => { void reload() }
    window.addEventListener('workspace:documents:refresh', onRefresh)
    return () => window.removeEventListener('workspace:documents:refresh', onRefresh)
  }, [reload])

  // Calendar names come from two places: the `data/calendar/<name>` facet
  // (every calendar events were ever filed under) and the workspace's domain
  // timelines (a calendar created empty in the toolbox Timeline tab is a
  // valid destination before it holds anything). Both are listed even when
  // nothing falls in the visible range.
  const workspaceName = scope?.workspaceName ?? null
  const refreshCalendars = useCallback(() => {
    if (!workspaceName) return Promise.resolve()
    return Promise.all([listWorkspaceBitmaps(workspaceName), listWorkspaceTimelinesVerbose(workspaceName)]).then(([keys, timelines]) => {
      const names = new Set<string>()
      for (const k of keys) if (k.startsWith('data/calendar/') && k.length > 'data/calendar/'.length) names.add(k.slice('data/calendar/'.length))
      for (const t of timelines) if (isCalendarTimeline(t.name)) names.add(t.name)
      setKnownCalendars([...names].sort())
    }).catch(() => {})
  }, [workspaceName])
  useEffect(() => { void refreshCalendars() }, [refreshCalendars, docs.length])
  useEffect(() => {
    const onChange = () => { void refreshCalendars() }
    window.addEventListener('workspace:timelines:changed', onChange)
    return () => window.removeEventListener('workspace:timelines:changed', onChange)
  }, [refreshCalendars])

  const removeDoc = useCallback(async (id: number) => {
    if (!scope) throw new Error('No workspace scope resolved')
    await deleteWorkspaceDocuments(scope.workspaceName, [id], scope.path, [], scope.treeName, scope.treeType)
    setDocs(prev => prev.filter(d => d.id !== id))
  }, [scope])

  const patchDoc = useCallback((doc: Document) => {
    setDocs(prev => prev.some(d => d.id === doc.id) ? prev.map(d => d.id === doc.id ? doc : d) : [...prev, doc])
  }, [])

  return useMemo(() => ({ docs, loading, error, scope, knownCalendars, reload, removeDoc, patchDoc }),
    [docs, loading, error, scope, knownCalendars, reload, removeDoc, patchDoc])
}

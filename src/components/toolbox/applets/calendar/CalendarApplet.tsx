import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppletTarget } from '../use-applet-target'
import { describeTarget } from '../../add/useAddTarget'
import type { AppletProps } from '../registry'
import type { Document } from '@/types/workspace'
import { addDays, addMonths, formatDayLong, formatDayShort, formatMonth, formatWeekRange, monthGrid, startOfDay, startOfWeek, startOfMonth } from '@/lib/calendar/dates'
import { occurrencesIn, TASKS_CALENDAR, type Occurrence } from '@/lib/calendar/occurrences'
import { CALENDAR_VIEWS, readPrefs, writePrefs, type CalendarPrefs, type CalendarView } from './calendar-prefs'
import { useCalendarDocs } from './use-calendar-docs'
import { calendarColor } from './calendar-colors'
import { MiniMonth } from './MiniMonth'
import { TimeGrid } from './TimeGrid'
import { MonthView } from './MonthView'
import { YearView } from './YearView'
import { ScheduleView } from './ScheduleView'
import { EventPanel, type PanelSubject } from './EventPanel'
import type { DragRange } from '@/lib/calendar/drag'

// Width below which the sidebar folds into a popover and the week grid
// drops its labels (the toolbox), and below which month cells show dots.
const NARROW = 640
const COMPACT = 420
const SCHEDULE_DAYS = 30

function viewRange(view: CalendarView, cursor: Date, scheduleSpan: { before: number; after: number }): { start: Date; end: Date } {
  switch (view) {
    case 'day': { const s = startOfDay(cursor); return { start: s, end: addDays(s, 1) } }
    case 'week': { const s = startOfWeek(cursor); return { start: s, end: addDays(s, 7) } }
    case 'month': { const grid = monthGrid(cursor); return { start: grid[0], end: addDays(grid[41], 1) } }
    case 'year': return { start: new Date(cursor.getFullYear(), 0, 1), end: new Date(cursor.getFullYear() + 1, 0, 1) }
    case 'schedule': { const s = startOfDay(cursor); return { start: addDays(s, -scheduleSpan.before), end: addDays(s, scheduleSpan.after) } }
  }
}

function step(view: CalendarView, cursor: Date, dir: 1 | -1): Date {
  switch (view) {
    case 'day': return addDays(cursor, dir)
    case 'week': return addDays(cursor, 7 * dir)
    case 'month': return addMonths(cursor, dir)
    case 'year': return new Date(cursor.getFullYear() + dir, cursor.getMonth(), 1)
    case 'schedule': return addDays(cursor, SCHEDULE_DAYS * dir)
  }
}

function rangeTitle(view: CalendarView, cursor: Date, compact: boolean): string {
  switch (view) {
    case 'day': return compact ? formatDayShort(cursor) : formatDayLong(cursor)
    case 'week': return formatWeekRange(startOfWeek(cursor))
    case 'month': return formatMonth(cursor)
    case 'year': return String(cursor.getFullYear())
    case 'schedule': return compact ? formatDayShort(cursor) : `From ${formatDayLong(cursor)}`
  }
}

export function CalendarApplet({ autoAdd = false }: AppletProps) {
  const target = useAppletTarget()
  const workspaceKey = target?.mode === 'workspace' ? target.workspaceName : target?.mode === 'context' ? `ctx:${target.contextId}` : null
  const [prefs, setPrefsState] = useState<CalendarPrefs>(() => readPrefs(workspaceKey))
  const setPrefs = useCallback((patch: Partial<CalendarPrefs>) => {
    setPrefsState(prev => { const next = { ...prev, ...patch }; writePrefs(workspaceKey, next); return next })
  }, [workspaceKey])
  const view = prefs.view
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [scheduleSpan, setScheduleSpan] = useState({ before: 0, after: SCHEDULE_DAYS })
  const [panel, setPanel] = useState<PanelSubject | null>(() => autoAdd ? { kind: 'draft', draft: { start: nextSlot(), allDay: false } } : null)
  const [calendarsOpen, setCalendarsOpen] = useState(false)

  // Host width drives the layout: the same applet lives in the toolbox and
  // in a full content pane.
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1024)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(entries => { for (const e of entries) setWidth(e.contentRect.width) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const narrow = width < NARROW
  const compact = width < COMPACT

  const range = useMemo(() => viewRange(view, cursor, scheduleSpan), [view, cursor, scheduleSpan])
  const { docs, loading, error, scope, knownCalendars, reload, removeDoc } = useCalendarDocs(target, range.start, range.end, prefs.showTasks)

  // Calendar list: facet keys (lower-case) plus the cased names the loaded
  // documents carry, de-duplicated case-insensitively.
  const calendars = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const name of knownCalendars) byKey.set(name, name)
    for (const doc of docs) {
      const name = doc.data?.calendar
      if (typeof name === 'string' && name.trim()) byKey.set(name.trim().toLowerCase(), name.trim())
    }
    if (prefs.defaultCalendar) byKey.set(prefs.defaultCalendar.toLowerCase(), byKey.get(prefs.defaultCalendar.toLowerCase()) ?? prefs.defaultCalendar)
    return [...byKey.values()].sort((a, b) => a.localeCompare(b))
  }, [knownCalendars, docs, prefs.defaultCalendar])
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden])
  const hasUnfiled = useMemo(() => docs.some(d => d.schema.startsWith('data/schema/event') && !(typeof d.data?.calendar === 'string' && d.data.calendar.trim())), [docs])

  const occurrences = useMemo(() => {
    const visible = docs.filter(d => {
      const name = typeof d.data?.calendar === 'string' ? d.data.calendar.trim().toLowerCase() : ''
      return !hidden.has(name || '')
    })
    return occurrencesIn(visible, range.start, range.end)
  }, [docs, hidden, range])

  const selectedKey = panel?.kind === 'occurrence' ? panel.occurrence.key : null

  const go = useCallback((next: Date, nextView?: CalendarView) => {
    setCursor(startOfDay(next))
    setScheduleSpan({ before: 0, after: SCHEDULE_DAYS })
    if (nextView) setPrefs({ view: nextView })
  }, [setPrefs])

  // The drag selection outlives the drag: while the draft panel is open the
  // grids keep its range highlighted so the dates can be checked at a glance.
  const pending = useMemo<DragRange | null>(() => {
    if (panel?.kind !== 'draft') return null
    const { start, allDay, end } = panel.draft
    return { start, allDay, end: end ?? (allDay ? addDays(startOfDay(start), 1) : new Date(start.getTime() + 3_600_000)) }
  }, [panel])
  const openDraft = useCallback((start: Date, allDay: boolean, end?: Date) => setPanel({ kind: 'draft', draft: { start, allDay, end } }), [])
  const select = useCallback((o: Occurrence) => setPanel({ kind: 'occurrence', occurrence: o }), [])

  const handleDelete = useCallback(async (doc: Document) => {
    const label = doc.data?.title ? `"${doc.data.title}"` : `#${doc.id}`
    if (!window.confirm(`Delete event ${label}?\n\nIt is removed from this path and moves to the workspace trash if nothing else links it.`)) return
    try { await removeDoc(doc.id); setPanel(null) } catch { /* toast handled globally */ }
  }, [removeDoc])

  const onKey = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return
    if (e.key === 'ArrowLeft') { go(step(view, cursor, -1)); e.preventDefault() }
    else if (e.key === 'ArrowRight') { go(step(view, cursor, 1)); e.preventDefault() }
    else if (e.key === 't') go(new Date())
    else if (e.key === 'n') openDraft(nextSlot(cursor), false)
    else if (e.key === 'Escape') { setPanel(null); setCalendarsOpen(false) }
    else { const v = CALENDAR_VIEWS.find(x => x.key === e.key); if (v) setPrefs({ view: v.id }) }
  }

  if (!target) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">{describeTarget(target)}</div>
  }

  const toggleCalendar = (name: string) => {
    const key = name.toLowerCase()
    setPrefs({ hidden: hidden.has(key) ? prefs.hidden.filter(h => h !== key) : [...prefs.hidden, key] })
  }

  const calendarList = (
    <div className="space-y-1 text-xs">
      <p className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">Calendars</p>
      {calendars.map(name => (
        <label key={name} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
          <input type="checkbox" checked={!hidden.has(name.toLowerCase())} onChange={() => toggleCalendar(name)} className="h-3.5 w-3.5 accent-primary" style={{ accentColor: calendarColor(name) }} />
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: calendarColor(name) }} />
          <span className="truncate">{name}</span>
        </label>
      ))}
      {hasUnfiled && (
        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
          <input type="checkbox" checked={!hidden.has('')} onChange={() => toggleCalendar('')} className="h-3.5 w-3.5 accent-primary" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: calendarColor('') }} />
          <span className="truncate text-muted-foreground">Other events</span>
        </label>
      )}
      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
        <input type="checkbox" checked={prefs.showTasks} onChange={(e) => setPrefs({ showTasks: e.target.checked })} className="h-3.5 w-3.5 accent-primary" />
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: calendarColor(TASKS_CALENDAR) }} />
        <span className="truncate">Tasks (due dates)</span>
      </label>
    </div>
  )

  const body = (() => {
    switch (view) {
      case 'day':
        return <TimeGrid days={[startOfDay(cursor)]} occurrences={occurrences} selectedKey={selectedKey} pending={pending} onSelect={select} onCreate={openDraft} onPickDay={(d) => go(d, 'day')} compact={compact} />
      case 'week':
        return <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))} occurrences={occurrences} selectedKey={selectedKey} pending={pending} onSelect={select} onCreate={openDraft} onPickDay={(d) => go(d, 'day')} compact={narrow} />
      case 'month':
        return <MonthView month={startOfMonth(cursor)} occurrences={occurrences} selectedKey={selectedKey} pending={pending} onSelect={select} onCreate={openDraft} onPickDay={(d) => go(d, 'day')} narrow={narrow} />
      case 'year':
        return <YearView year={cursor.getFullYear()} occurrences={occurrences} onPickDay={(d) => go(d, 'day')} onPickMonth={(m) => go(m, 'month')} />
      case 'schedule':
        return (
          <ScheduleView
            occurrences={occurrences} selectedKey={selectedKey} onSelect={select} loading={loading}
            onEarlier={() => setScheduleSpan(s => ({ ...s, before: s.before + SCHEDULE_DAYS }))}
            onLater={() => setScheduleSpan(s => ({ ...s, after: s.after + SCHEDULE_DAYS }))}
            onPickDay={(d) => go(d, 'day')}
          />
        )
    }
  })()

  return (
    <div ref={root} tabIndex={0} onKeyDown={onKey} className="relative flex h-full min-h-0 flex-col outline-none">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
        <button type="button" onClick={() => go(new Date())} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted" title="Today (t)">Today</button>
        <button type="button" onClick={() => go(step(view, cursor, -1))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Previous" title="Previous (←)"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => go(step(view, cursor, 1))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Next" title="Next (→)"><ChevronRight className="h-4 w-4" /></button>
        <span className="min-w-0 truncate text-sm font-semibold">{rangeTitle(view, cursor, compact)}</span>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <span className="flex-1" />
        {compact ? (
          <select value={view} onChange={(e) => setPrefs({ view: e.target.value as CalendarView })} aria-label="View" className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs">
            {CALENDAR_VIEWS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        ) : (
          <div className="flex overflow-hidden rounded-md border border-border" role="tablist" aria-label="View">
            {CALENDAR_VIEWS.map(v => (
              <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setPrefs({ view: v.id })} title={`${v.label} (${v.key})`}
                className={cn('px-2 py-1 text-xs transition-colors', view === v.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                {v.label}
              </button>
            ))}
          </div>
        )}
        {narrow && (
          <button type="button" onClick={() => setCalendarsOpen(o => !o)} className={cn('rounded-md border p-1.5', calendarsOpen ? 'border-foreground text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')} aria-label="Calendars" title="Calendars">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" onClick={() => openDraft(nextSlot(cursor), false)} className="flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs text-primary-foreground" title="New event (n)">
          <Plus className="h-3.5 w-3.5" />{!compact && 'Event'}
        </button>
      </div>

      {error && <p className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</p>}

      <div className="flex min-h-0 flex-1">
        {!narrow && (
          <aside className="flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-3">
            <MiniMonth month={startOfMonth(cursor)} selected={cursor} onPick={(d) => go(d, view === 'year' || view === 'month' ? 'day' : view)} onPrev={() => setCursor(c => addMonths(c, -1))} onNext={() => setCursor(c => addMonths(c, 1))} />
            {calendarList}
          </aside>
        )}
        <div className="relative min-w-0 flex-1">
          {body}
          {narrow && calendarsOpen && (
            <div className="absolute right-2 top-2 z-20 w-56 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-elevation-2">
              {calendarList}
            </div>
          )}
        </div>
        {panel && !narrow && (
          <aside className="w-80 shrink-0 border-l border-border bg-card">
            <EventPanel subject={panel} target={target} workspaceName={scope?.workspaceName ?? null} calendars={calendars} defaultCalendar={prefs.defaultCalendar} onClose={() => setPanel(null)} onSaved={(c) => { if (c) setPrefs({ defaultCalendar: c }); setPanel(null); void reload() }} onDelete={handleDelete} />
          </aside>
        )}
      </div>

      {panel && narrow && (
        <div className="absolute inset-0 z-30 flex flex-col bg-card">
          <EventPanel subject={panel} target={target} workspaceName={scope?.workspaceName ?? null} calendars={calendars} defaultCalendar={prefs.defaultCalendar} onClose={() => setPanel(null)} onSaved={(c) => { if (c) setPrefs({ defaultCalendar: c }); setPanel(null); void reload() }} onDelete={handleDelete} />
        </div>
      )}

      {!loading && !error && !docs.length && view !== 'schedule' && (
        <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-muted/80 px-3 py-1 text-[11px] text-muted-foreground">
          <CalendarDays className="mr-1 inline h-3 w-3" />Nothing here yet — click or drag a slot to add an event.
        </p>
      )}
    </div>
  )
}

/** The next half hour on the given day (or now), the default start for a new event. */
function nextSlot(day?: Date): Date {
  const now = new Date()
  const d = day && !sameDayAs(day, now) ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0) : new Date(now)
  if (!day || sameDayAs(day, now)) d.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0)
  return d
}
function sameDayAs(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString() }

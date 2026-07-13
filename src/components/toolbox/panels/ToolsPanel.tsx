import { useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Save, Loader2, Search, Trash2, Plus, RefreshCw, ZoomIn, ZoomOut, Clock, FileText, StickyNote, ListTodo, Globe, Mail, Link as LinkIcon, Tag as TagIcon, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox, type ToolsTab, type FeatureMode } from '@/components/toolbox/toolbox-context'
import { useToast } from '@/components/ui/toast-container'

// ─── MD2-style toggle switch ─────────────────────────────────────────────────

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  accent?: 'default' | 'blue' | 'green' | 'amber'
}

function MD2Toggle({ label, checked, onChange, accent = 'default' }: ToggleProps) {
  const trackColor = checked
    ? accent === 'blue'
      ? 'bg-blue-500'
      : accent === 'green'
        ? 'bg-green-500'
        : accent === 'amber'
          ? 'bg-amber-500'
          : 'bg-zinc-700'
    : 'bg-zinc-300'

  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onChange(!checked)}
      className="flex items-center justify-between gap-3 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      <span className="text-sm text-foreground truncate">{label}</span>
      <div className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', trackColor)}>
        <div
          className={cn(
            'absolute top-[2px] w-4 h-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
          )}
        />
      </div>
    </div>
  )
}

// ─── Timeline quick filter keys ───────────────────────────────────────────────
// Keys must match getTimeframeBounds() case labels in Timeline.js (camelCase).

const QUICK_FILTERS = [
  'Today',
  'Yesterday',
  'This week',
  'This month',
  'This year',
  'This century',
  'This millennium',
] as const
type QuickFilter = (typeof QUICK_FILTERS)[number]

const QF_KEY_MAP: Record<QuickFilter, string> = {
  'Today': 'today',
  'Yesterday': 'yesterday',
  'This week': 'thisWeek',
  'This month': 'thisMonth',
  'This year': 'thisYear',
  'This century': 'thisCentury',
  'This millennium': 'thisMillennium',
}

// ─── Timeline rail — reverse-chronological, click-to-tag ─────────────────────
// "Now" is always the top row; each row below is one older period. Click a row
// to tag it as part of the active range (multi-select, shift-click fills the
// gap) — replaces the old free-pan/drag-brush interaction with discrete,
// visible tags.

type ZoomLevel = 0 | 1 | 2 | 3 | 4 | 5
type Unit = 'millennium' | 'century' | 'decade' | 'year' | 'month' | 'week'

interface ZoomConfig {
  label: string
  unit: Unit
}

const ZOOM_LEVELS: ZoomConfig[] = [
  { label: 'Millennium', unit: 'millennium' },
  { label: 'Century',    unit: 'century' },
  { label: 'Decade',     unit: 'decade' },
  { label: 'Year',       unit: 'year' },
  { label: 'Month',      unit: 'month' },
  { label: 'Week',       unit: 'week' },
]

const ROWS_PER_PAGE = 10
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function periodStart(unit: Unit, offset: number): Date {
  const now = new Date()
  switch (unit) {
    case 'millennium': {
      const base = Math.floor(now.getFullYear() / 1000) * 1000
      return new Date(base - offset * 1000, 0, 1)
    }
    case 'century': {
      const base = Math.floor(now.getFullYear() / 100) * 100
      return new Date(base - offset * 100, 0, 1)
    }
    case 'decade': {
      const base = Math.floor(now.getFullYear() / 10) * 10
      return new Date(base - offset * 10, 0, 1)
    }
    case 'year':
      return new Date(now.getFullYear() - offset, 0, 1)
    case 'month':
      return new Date(now.getFullYear(), now.getMonth() - offset, 1)
    case 'week': {
      const mondayOffset = (now.getDay() + 6) % 7
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
      d.setDate(d.getDate() - offset * 7)
      return d
    }
  }
}

function periodEnd(unit: Unit, start: Date): Date {
  const d = new Date(start)
  switch (unit) {
    case 'millennium': d.setFullYear(d.getFullYear() + 1000); break
    case 'century': d.setFullYear(d.getFullYear() + 100); break
    case 'decade': d.setFullYear(d.getFullYear() + 10); break
    case 'year': d.setFullYear(d.getFullYear() + 1); break
    case 'month': d.setMonth(d.getMonth() + 1); break
    case 'week': d.setDate(d.getDate() + 7); break
  }
  return d
}

function periodLabel(unit: Unit, start: Date, offset: number): string {
  if (offset === 0) return 'Now'
  switch (unit) {
    case 'millennium':
    case 'century':
    case 'decade': {
      const y = start.getFullYear()
      return y <= 0 ? `${1 - y} BCE` : `${y}`
    }
    case 'year':
      return `${start.getFullYear()}`
    case 'month':
      return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`
    case 'week': {
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`
    }
  }
}

interface TimelineRow {
  offset: number
  label: string
  start: Date
  end: Date
  isNow: boolean
}

function getRows(unit: Unit, count: number): TimelineRow[] {
  return Array.from({ length: count }, (_, offset) => {
    const start = periodStart(unit, offset)
    const end = periodEnd(unit, start)
    return { offset, label: periodLabel(unit, start, offset), start, end, isNow: offset === 0 }
  })
}

// Map quick filter key → zoom level index (quick filters are always "current
// period" tokens, i.e. row offset 0 at the matching zoom unit — "yesterday"
// is the one exception, offset 1 at week granularity).
const QF_ZOOM: Partial<Record<string, ZoomLevel>> = {
  today: 5,
  yesterday: 5,
  thisWeek: 5,
  thisMonth: 4,
  thisYear: 3,
  thisCentury: 1,
  thisMillennium: 0,
}

interface TimelineRailProps {
  quickFilterKey: string | null
  activeRange: { start: string; end: string } | null
  onSelectRange: (start: Date, end: Date) => void
}

function TimelineRail({ quickFilterKey, activeRange, onSelectRange }: TimelineRailProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(3)
  const [rowCount, setRowCount] = useState(ROWS_PER_PAGE)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Adjust state during render when external props change (React's
  // recommended alternative to setState-in-effect for prop-driven resets —
  // avoids the extra commit+effect round-trip a useEffect would cost here).
  const [prevQuickFilterKey, setPrevQuickFilterKey] = useState(quickFilterKey)
  if (quickFilterKey !== prevQuickFilterKey) {
    setPrevQuickFilterKey(quickFilterKey)
    if (quickFilterKey && QF_ZOOM[quickFilterKey] !== undefined) {
      setZoomLevel(QF_ZOOM[quickFilterKey] as ZoomLevel)
    }
    setSelected(new Set())
  }

  const [prevActiveRange, setPrevActiveRange] = useState(activeRange)
  if (activeRange !== prevActiveRange) {
    setPrevActiveRange(activeRange)
    if (!activeRange) setSelected(new Set())
  }

  const zl = ZOOM_LEVELS[zoomLevel]
  const rows = getRows(zl.unit, rowCount)

  const changeZoom = (delta: number) => {
    setZoomLevel(prev => Math.max(0, Math.min(5, prev + delta)) as ZoomLevel)
    setRowCount(ROWS_PER_PAGE)
    setSelected(new Set())
  }

  const toggleRow = useCallback((offset: number, shiftKey: boolean) => {
    setSelected(prev => {
      let next: Set<number>
      if (shiftKey && prev.size > 0) {
        const lo = Math.min(offset, ...prev)
        const hi = Math.max(offset, ...prev)
        next = new Set(prev)
        for (let o = lo; o <= hi; o++) next.add(o)
      } else {
        next = new Set(prev)
        if (next.has(offset)) next.delete(offset)
        else next.add(offset)
      }

      if (next.size === 0) return next
      const selectedRows = rows.filter(r => next.has(r.offset))
      const start = new Date(Math.min(...selectedRows.map(r => r.start.getTime())))
      const end = new Date(Math.max(...selectedRows.map(r => r.end.getTime())))
      onSelectRange(start, end)
      return next
    })
  }, [rows, onSelectRange])

  return (
    <div className="w-44 shrink-0 flex flex-col border-r border-border bg-muted/20">
      {/* Zoom controls */}
      <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-foreground/80 select-none">{zl.label}</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => changeZoom(1)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Zoom in (finer periods)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => changeZoom(-1)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Zoom out (coarser periods)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Reverse-chronological tag list — Now pinned top, older below */}
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1">
        {rows.map(row => {
          const isSelected = selected.has(row.offset)
          return (
            <button
              key={row.offset}
              type="button"
              onClick={(e) => toggleRow(row.offset, e.shiftKey)}
              title={row.isNow ? 'Now' : `${row.label} — click to tag, shift-click to fill range`}
              className={cn(
                'w-full flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors select-none text-left',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : row.isNow
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-card text-foreground hover:bg-muted shadow-sm',
              )}
            >
              {row.isNow && <Clock className="w-3 h-3 shrink-0" />}
              <span className="truncate">{row.label}</span>
            </button>
          )
        })}

        {rowCount < 200 && (
          <button
            type="button"
            onClick={() => setRowCount(c => c + ROWS_PER_PAGE)}
            className="w-full text-[11px] text-muted-foreground/60 hover:text-muted-foreground py-1.5 transition-colors text-center"
          >
            Show older…
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Timeline tab ─────────────────────────────────────────────────────────────


function TimelineTab() {
  const { state, setTimelineFilter, createTimeline, deleteTimeline, refreshTimelines } = useToolbox()
  const { timeline } = state.filters
  const { availableTimelines, timelinesLoading } = state
  const [newTimelineName, setNewTimelineName] = useState('')
  const [creatingTimeline, setCreatingTimeline] = useState(false)
  const [deletingTimeline, setDeletingTimeline] = useState<string | null>(null)
  const { showToast } = useToast()

  const quickFilter = QUICK_FILTERS.find(f => QF_KEY_MAP[f] === timeline.quickFilter) ?? null
  const selectedTimelines = new Set(timeline.selectedTimelines ?? [])

  const handleToggleTimeline = (name: string) => {
    const next = new Set(selectedTimelines)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setTimelineFilter({ selectedTimelines: [...next] })
  }

  const handleCreateTimeline = async () => {
    const name = newTimelineName.trim()
    if (!name) return
    setCreatingTimeline(true)
    try {
      await createTimeline(name)
      setNewTimelineName('')
      showToast({ title: 'Timeline created', description: name })
    } catch (e) {
      showToast({ title: 'Failed to create timeline', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setCreatingTimeline(false)
    }
  }

  const handleDeleteTimeline = async (name: string) => {
    if (!window.confirm(`Delete timeline "${name}"?\n\nThis removes all interval data for this timeline.`)) return
    setDeletingTimeline(name)
    try {
      await deleteTimeline(name)
      showToast({ title: 'Timeline deleted', description: name })
    } catch (e) {
      showToast({ title: 'Failed to delete timeline', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setDeletingTimeline(null)
    }
  }

  // "crud:*" and "content" are built-in timelines (always present server-side,
  // undeletable) — surfaced as dedicated toggles above, not in the generic
  // deletable domain-timelines list.
  const domainTimelines = availableTimelines.filter(n => !n.startsWith('crud:') && n !== 'content')
  // Non-crud timeline names don't resolve relative quick tokens server-side
  // (only crud:* does) — content/domain selections need an explicit drag range.
  const needsExplicitRange = (timeline.contentEvents || selectedTimelines.size > 0) && !timeline.customRange

  const handleRangeSelect = useCallback((start: Date, end: Date) => {
    const iso = (d: Date) => d.toISOString().split('T')[0]
    // Dragging the rail sets an explicit range filter (t:crud:ACTION:start..end),
    // which supersedes any active quick token.
    setTimelineFilter({ customRange: { start: iso(start), end: iso(end) }, quickFilter: null })
  }, [setTimelineFilter])

  return (
    <div className="flex h-full min-h-0">
      {/* Graphical timeline rail */}
      <TimelineRail
        quickFilterKey={timeline.quickFilter}
        activeRange={timeline.customRange}
        onSelectRange={handleRangeSelect}
      />

      {/* Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Quick filter */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Quick filter
          </p>
          <div className="flex flex-col gap-1">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setTimelineFilter({ quickFilter: quickFilter === f ? null : QF_KEY_MAP[f], customRange: null })}
                className={cn(
                  'text-left text-sm px-2.5 py-1 rounded-md transition-colors',
                  quickFilter === f && !timeline.customRange
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {timeline.customRange && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1.5">
              <span className="text-xs text-foreground truncate">
                {timeline.customRange.start} → {timeline.customRange.end}
              </span>
              <button
                type="button"
                onClick={() => setTimelineFilter({ customRange: null })}
                className="text-muted-foreground hover:text-foreground shrink-0"
                title="Clear range"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* CRUD index toggles — always visible */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            CRUD index
          </p>
          <div className="space-y-2">
            <MD2Toggle
              label="crud:created"
              checked={timeline.indexCreated}
              onChange={(v) => setTimelineFilter({ indexCreated: v })}
              accent="green"
            />
            <MD2Toggle
              label="crud:updated"
              checked={timeline.indexUpdated}
              onChange={(v) => setTimelineFilter({ indexUpdated: v })}
              accent="blue"
            />
            <MD2Toggle
              label="crud:deleted"
              checked={timeline.indexDeleted}
              onChange={(v) => setTimelineFilter({ indexDeleted: v })}
              accent="amber"
            />
          </div>
        </div>

        {/* Content-derived events timeline */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Content timeline
          </p>
          <MD2Toggle
            label="content"
            checked={timeline.contentEvents}
            onChange={(v) => setTimelineFilter({ contentEvents: v })}
            accent="blue"
          />
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Content-derived timestamps (EXIF, logs, extracted periods)
          </p>
        </div>

        {needsExplicitRange && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 -mt-2">
            Content/domain timelines need a dragged range on the rail — quick filters only apply to CRUD.
          </p>
        )}

        {/* Domain timelines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Domain timelines
            </p>
            <button
              type="button"
              onClick={() => refreshTimelines()}
              className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              title="Refresh timelines"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {timelinesLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading…
            </div>
          ) : domainTimelines.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No domain timelines yet</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {domainTimelines.map(name => {
                const checked = selectedTimelines.has(name)
                return (
                  <div
                    key={name}
                    className={cn(
                      'flex items-center gap-2.5 group rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                      checked ? 'bg-muted/60' : 'hover:bg-muted/30',
                    )}
                    onClick={() => handleToggleTimeline(name)}
                  >
                    {/* Checkbox */}
                    <div className={cn(
                      'shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                      checked
                        ? 'bg-primary border-primary'
                        : 'border-muted-foreground/40 bg-transparent group-hover:border-muted-foreground/70',
                    )}>
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-primary-foreground" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="flex-1 text-sm text-foreground truncate select-none">
                      {name}
                    </span>
                    <button
                      type="button"
                      disabled={deletingTimeline === name}
                      onClick={(e) => { e.stopPropagation(); handleDeleteTimeline(name) }}
                      className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                      title={`Delete timeline "${name}"`}
                    >
                      {deletingTimeline === name
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Create new timeline */}
          <div className="mt-3 flex gap-1.5">
            <input
              type="text"
              value={newTimelineName}
              onChange={e => setNewTimelineName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateTimeline()}
              placeholder="New timeline name…"
              className="flex-1 px-2 py-1 text-xs rounded-md bg-muted border border-transparent focus:border-ring focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCreateTimeline}
              disabled={creatingTimeline || !newTimelineName.trim()}
              className="shrink-0 p-1.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Create timeline"
            >
              {creatingTimeline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Features tab ─────────────────────────────────────────────────────────────

const PREFIX_LABELS: Record<string, string> = {
  data: 'Data',
  'data/backend': 'Backends',
  'data/mime': 'MIME types',
  client: 'Client',
  server: 'Server',
  user: 'User',
  tag: 'Tags',
  device: 'Device',
  custom: 'Custom',
  feature: 'Feature',
}

// Document-type (`data/abstraction/*`) schemas get a prominent, icon-led picker
// at the top of the Features tab — they are the filter users reach for most.
// icon + friendly label per known schema; unknown abstractions fall back to a
// generic tag icon and their trailing segment as the label.
const SCHEMA_META: Record<string, { label: string; icon: LucideIcon }> = {
  'data/abstraction/file': { label: 'Files', icon: FileText },
  'data/abstraction/note': { label: 'Notes', icon: StickyNote },
  'data/abstraction/todo': { label: 'Todos', icon: ListTodo },
  'data/abstraction/tab': { label: 'Tabs', icon: Globe },
  'data/abstraction/email': { label: 'Emails', icon: Mail },
  'data/abstraction/link': { label: 'Links', icon: LinkIcon },
}
const ABSTRACTION_PREFIX = 'data/abstraction/'
function schemaMeta(key: string): { label: string; icon: LucideIcon } {
  return SCHEMA_META[key] ?? {
    label: key.slice(ABSTRACTION_PREFIX.length).replace(/(^|\/)(\w)/g, (_, s, c) => s + c.toUpperCase()) || key,
    icon: TagIcon,
  }
}

function groupBitmaps(keys: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const key of keys) {
    // Backend-source tags and MIME-type tags each get their own group — they
    // answer a different question ("where does it live" / "what kind of file")
    // than the data/abstraction/* schema tags.
    const prefix = key.startsWith('data/backend/') ? 'data/backend'
      : key.startsWith('data/mime/') ? 'data/mime'
      : key.split('/')[0]
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(key)
  }
  return groups
}

// Whole-row click cycles the filter mode: off → any → all → not → off.
const MODE_CYCLE: FeatureMode[] = ['off', 'anyOf', 'allOf', 'noneOf']
function nextMode(mode: FeatureMode): FeatureMode {
  return MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % MODE_CYCLE.length]
}

// Tri-state sigil control: any (OR) · all (+ gate) · not (! exclude).
// Mirrors synapsd feature algebra. Click the active mode to clear it.
const MODE_OPTS: { m: FeatureMode; label: string; on: string }[] = [
  { m: 'anyOf', label: 'any', on: 'bg-blue-500 text-white' },
  { m: 'allOf', label: 'all', on: 'bg-emerald-500 text-white' },
  { m: 'noneOf', label: 'not', on: 'bg-rose-500 text-white' },
]

function ModeControl({ mode, onSet }: { mode: FeatureMode; onSet: (m: FeatureMode) => void }) {
  return (
    <div className="flex shrink-0 rounded-md overflow-hidden border border-border divide-x divide-border">
      {MODE_OPTS.map(o => (
        <button
          key={o.m}
          type="button"
          onClick={() => onSet(mode === o.m ? 'off' : o.m)}
          className={cn(
            'px-2 py-0.5 text-[11px] font-medium transition-colors',
            mode === o.m ? o.on : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          title={`${o.label} — ${o.m}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Big, tap-friendly document-type picker. Each tile cycles its filter mode
// (off → any → all → not) like the rows below, but with an icon + label and a
// mode badge, so the most-used filter is easy to hit — especially on mobile.
function SchemaTypePicker({
  keys,
  modeOf,
  onCycle,
}: {
  keys: string[]
  modeOf: (key: string) => FeatureMode
  onCycle: (key: string) => void
}) {
  if (!keys.length) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Document types
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {keys.map((key) => {
          const { label, icon: Icon } = schemaMeta(key)
          const mode = modeOf(key)
          const badge = MODE_OPTS.find((o) => o.m === mode)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onCycle(key)}
              title={`${key} — ${mode === 'off' ? 'tap to filter' : mode}`}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 min-h-[4.5rem] transition-colors select-none',
                mode === 'off'
                  ? 'border-border bg-muted/40 text-foreground hover:bg-muted'
                  : mode === 'anyOf' ? 'border-blue-500 bg-blue-500/10 text-foreground'
                  : mode === 'allOf' ? 'border-emerald-500 bg-emerald-500/10 text-foreground'
                  : 'border-rose-500 bg-rose-500/10 text-foreground',
              )}
            >
              {badge && (
                <span className={cn('absolute right-1.5 top-1.5 rounded px-1 py-0.5 text-[9px] font-semibold leading-none', badge.on)}>
                  {badge.label}
                </span>
              )}
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs font-medium leading-none">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FeaturesTab() {
  const { state, setFeatureMode, clearFilters, hasActiveFilters, deleteBitmap } = useToolbox()
  const { availableBitmaps, bitmapsLoading, filters } = state
  const allOf = new Set(filters.features.allOf)
  const anyOf = new Set(filters.features.anyOf)
  const noneOf = new Set(filters.features.noneOf)
  const modeOf = (key: string): FeatureMode =>
    allOf.has(key) ? 'allOf' : anyOf.has(key) ? 'anyOf' : noneOf.has(key) ? 'noneOf' : 'off'
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const { showToast } = useToast()

  const handleDelete = async (key: string) => {
    if (key.startsWith('data/')) return
    if (!window.confirm(`Delete bitmap "${key}"?\n\nThis removes the bitmap from the database. Documents are unaffected, but any features/filters relying on this bitmap will lose their grouping.`)) return
    setDeleting(key)
    try {
      await deleteBitmap(key)
      showToast({ title: 'Bitmap deleted', description: key })
    } catch (e) {
      showToast({ title: 'Delete failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  if (bitmapsLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!availableBitmaps.length) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center py-10">
        No feature bitmaps found
      </div>
    )
  }

  const q = search.trim().toLowerCase()
  const filtered = q ? availableBitmaps.filter(k => k.toLowerCase().includes(q)) : availableBitmaps
  // Pull the document-type schemas out into the prominent picker; group the rest.
  const schemaKeys = filtered.filter(k => k.startsWith(ABSTRACTION_PREFIX)).sort((a, b) => {
    const order = Object.keys(SCHEMA_META)
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib) || a.localeCompare(b)
  })
  const groups = groupBitmaps(filtered.filter(k => !k.startsWith(ABSTRACTION_PREFIX)))

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search + clear */}
      <div className="px-4 py-2 border-b border-border shrink-0 space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search features…"
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md bg-muted border border-transparent focus:border-ring focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="flex items-center gap-1.5 w-full justify-center px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <X className="w-3 h-3" />
          Clear all filters
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        <SchemaTypePicker
          keys={schemaKeys}
          modeOf={modeOf}
          onCycle={(key) => setFeatureMode(key, nextMode(modeOf(key)))}
        />
        {groups.size === 0 && schemaKeys.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No matches</p>
        ) : (
          Array.from(groups.entries()).map(([prefix, keys]) => (
            <div key={prefix}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {PREFIX_LABELS[prefix] ?? prefix}
              </p>
              <div className="flex flex-col gap-1">
                {keys.map((key, rowIndex) => {
                  const isProtected = key.startsWith('data/')
                  const mode = modeOf(key)
                  return (
                    <div
                      key={key}
                      onClick={() => setFeatureMode(key, nextMode(mode))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFeatureMode(key, nextMode(mode)) } }}
                      className={cn(
                        // Grey/white zebra keeps long bitmap lists scannable;
                        // the whole row is clickable (cycles off→any→all→not).
                        'flex items-center gap-2 group rounded-md pl-2 pr-1.5 py-1 border-l-2 transition-colors cursor-pointer select-none',
                        rowIndex % 2 === 0 ? 'bg-muted/50' : 'bg-transparent',
                        'hover:bg-muted',
                        mode === 'off' ? 'border-l-transparent'
                          : mode === 'anyOf' ? 'border-l-blue-500 !bg-blue-500/10'
                          : mode === 'allOf' ? 'border-l-emerald-500 !bg-emerald-500/10'
                          : 'border-l-rose-500 !bg-rose-500/10',
                      )}
                    >
                      <span className="flex-1 min-w-0 text-xs font-mono text-foreground truncate" title={key}>
                        {key}
                      </span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <ModeControl mode={mode} onSet={(m) => setFeatureMode(key, m)} />
                      </span>
                      {!isProtected && (
                        <button
                          type="button"
                          disabled={deleting === key}
                          onClick={(e) => { e.stopPropagation(); handleDelete(key) }}
                          className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                          title={`Delete bitmap "${key}" from database`}
                          aria-label={`Delete bitmap ${key}`}
                        >
                          {deleting === key
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── ToolsPanel ───────────────────────────────────────────────────────────────

export function ToolsPanel() {
  const { state, setToolsTab, saveFilters, clearFilters, hasActiveFilters } = useToolbox()
  const { toolsTab, isDirty, isSaving, activeContextType, savedSearchQuery } = state
  const location = useLocation()
  const currentSearchQuery = new URLSearchParams(location.search).get('q') || new URLSearchParams(location.search).get('search') || ''
  const searchDirty = activeContextType !== null && currentSearchQuery.trim() !== (savedSearchQuery || '')
  const canSave = activeContextType !== null && (isDirty || searchDirty)

  const tabs: { id: ToolsTab; label: string }[] = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'features', label: 'Features' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 bg-zinc-900 shrink-0">
        <span className="text-sm font-medium text-zinc-100">Tools</span>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              title="Clear all active filters"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
          {canSave && (
            <button
              type="button"
              onClick={saveFilters}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save changes
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setToolsTab(tab.id)}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              toolsTab === tab.id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {toolsTab === 'timeline' && <TimelineTab />}
        {toolsTab === 'features' && <FeaturesTab />}
      </div>
    </div>
  )
}

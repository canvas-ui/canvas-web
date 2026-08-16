import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  X, Loader2, Trash2, Plus, RefreshCw, ZoomIn, ZoomOut, Clock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown,
  CalendarDays, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox } from '@/components/toolbox/use-toolbox'
import { useToast } from '@/components/ui/use-toast'
import { timelineColor } from '@/lib/timeline-meta'
import { onAccentTextClass } from '@/utils/color'
import { fetchTimelineHistogram, type TimelineHistogramBucket } from '@/services/workspace'
import { buildGeoFilters, getTimelineRanges, TIMELINE_QUANTA, DEFAULT_TIMELINE_QUANTUM, type TimelineRange } from '@/types/workspace'

// ─── Quick filter matrix ──────────────────────────────────────────────────────
// Tokens must match the server's CRUD_TIMEFRAMES (synapsd filters.js) — named
// wall-clock timeframes that resolve on ANY timeline, past AND future ("next"
// column is the todo unlock: t:tasks:tomorrow = due tomorrow).

interface MatrixRow {
  label: string
  cells: [string, string, string] // [last, this, next] tokens
}

const MATRIX_ROWS: MatrixRow[] = [
  { label: 'Day',   cells: ['yesterday', 'today', 'tomorrow'] },
  { label: 'Week',  cells: ['lastWeek', 'thisWeek', 'nextWeek'] },
  { label: 'Month', cells: ['lastMonth', 'thisMonth', 'nextMonth'] },
  { label: 'Year',  cells: ['lastYear', 'thisYear', 'nextYear'] },
]

const DEEP_TIME_ROWS: MatrixRow[] = [
  { label: 'Decade',     cells: ['lastDecade', 'thisDecade', 'nextDecade'] },
  { label: 'Century',    cells: ['lastCentury', 'thisCentury', 'nextCentury'] },
  { label: 'Millennium', cells: ['lastMillennium', 'thisMillennium', 'nextMillennium'] },
]

// Day row reads better with explicit names than Last/This/Next.
const DAY_CELL_LABELS = ['Yesterday', 'Today', 'Tomorrow']

// ─── Timeline rail — reverse-chronological, density-backed ───────────────────
// "Now" is always the top row; each row below is one older period. Rows carry
// stacked per-timeline density bars (histogram endpoint) so you can see WHERE
// your documents live in time before selecting. Click to tag rows as the
// active range (multi-select, shift-click fills the gap).

type ZoomLevel = 0 | 1 | 2 | 3 | 4 | 5
type Unit = 'millennium' | 'century' | 'decade' | 'year' | 'month' | 'week'

const ZOOM_LEVELS: { label: string; unit: Unit }[] = [
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

// Quick token → rail zoom level, so picking a token snaps the rail to the
// matching granularity.
const QF_ZOOM: Partial<Record<string, ZoomLevel>> = {
  yesterday: 5, today: 5, tomorrow: 5,
  lastWeek: 5, thisWeek: 5, nextWeek: 5,
  lastMonth: 4, thisMonth: 4, nextMonth: 4,
  lastYear: 3, thisYear: 3, nextYear: 3,
  lastDecade: 2, thisDecade: 2, nextDecade: 2,
  lastCentury: 1, thisCentury: 1, nextCentury: 1,
  lastMillennium: 0, thisMillennium: 0, nextMillennium: 0,
}

// Local ISO day (toISOString would shift across the TZ boundary).
function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ─── Multi-range helpers ──────────────────────────────────────────────────────
// Ranges are ISO YYYY-MM-DD day-level, compared lexicographically. Disjoint
// ranges are OR'd server-side (one t: token per range), so "3 Mondays" or
// "this month minus weekends" are ordinary selections.

function addDaysIso(iso: string, n: number): string {
  const d = parseIsoDay(iso)
  if (!d) return iso
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

// Sort + coalesce overlapping/adjacent ranges.
function mergeRanges(ranges: TimelineRange[]): TimelineRange[] {
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start))
  const out: TimelineRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= addDaysIso(last.end, 1)) {
      if (r.end > last.end) last.end = r.end
    } else {
      out.push({ ...r })
    }
  }
  return out
}

// Ctrl+click semantics: a day outside every range becomes its own single-day
// range; a day inside a range is carved out (splitting the range if interior).
function toggleDayInRanges(ranges: TimelineRange[], day: string): TimelineRange[] {
  const hit = ranges.find(r => day >= r.start && day <= r.end)
  if (!hit) return mergeRanges([...ranges, { start: day, end: day }])
  const rest = ranges.filter(r => r !== hit)
  if (hit.start <= addDaysIso(day, -1)) rest.push({ start: hit.start, end: addDaysIso(day, -1) })
  if (addDaysIso(day, 1) <= hit.end) rest.push({ start: addDaysIso(day, 1), end: hit.end })
  return rest.sort((a, b) => a.start.localeCompare(b.start))
}

// Histogram bucket spec for a rail row. Week/month rows use day-level ISO
// bounds; year+ rows use plain year strings (server year grammar handles
// negative/BCE years, which Date→ISO would mangle).
function bucketSpec(unit: Unit, row: TimelineRow): { start: string; end: string } {
  if (unit === 'week' || unit === 'month') {
    const endD = new Date(row.end)
    endD.setDate(endD.getDate() - 1)
    return { start: isoDay(row.start), end: isoDay(endD) }
  }
  return { start: String(row.start.getFullYear()), end: String(row.end.getFullYear() - 1) }
}

interface TimelineRailProps {
  quickFilterKey: string | null
  activeRangeCount: number
  onSelectRanges: (ranges: TimelineRange[]) => void
  histogramNames: string[]
}

function TimelineRail({ quickFilterKey, activeRangeCount, onSelectRanges, histogramNames }: TimelineRailProps) {
  const { state } = useToolbox()
  const { activeWorkspaceName, activeTreeName, activeContextPath, filters } = state
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(3)
  const [rowCount, setRowCount] = useState(ROWS_PER_PAGE)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [buckets, setBuckets] = useState<TimelineHistogramBucket[]>([])

  // Adjust state during render when external props change (React's
  // recommended alternative to setState-in-effect for prop-driven resets).
  const [prevQuickFilterKey, setPrevQuickFilterKey] = useState(quickFilterKey)
  if (quickFilterKey !== prevQuickFilterKey) {
    setPrevQuickFilterKey(quickFilterKey)
    if (quickFilterKey && QF_ZOOM[quickFilterKey] !== undefined) {
      setZoomLevel(QF_ZOOM[quickFilterKey] as ZoomLevel)
    }
    setSelected(new Set())
  }

  const [prevActiveRangeCount, setPrevActiveRangeCount] = useState(activeRangeCount)
  if (activeRangeCount !== prevActiveRangeCount) {
    setPrevActiveRangeCount(activeRangeCount)
    if (activeRangeCount === 0) setSelected(new Set())
  }

  const zl = ZOOM_LEVELS[zoomLevel]
  const rows = getRows(zl.unit, rowCount)

  // ── Density fetch ──────────────────────────────────────────────────────────
  // Buckets = visible rows; names = the timelines being filtered on; scope =
  // the current non-temporal toolbox filters (features + geo), same shape the
  // document listing uses in live-preview mode (applyCanvasSpec:false), so the
  // rail densities agree with the visible document set — sans time, which is
  // exactly what the rail is for picking.
  const featureKey = JSON.stringify(filters.features) + JSON.stringify(filters.geo)
  const namesKey = histogramNames.join(',')
  useEffect(() => {
    if (!activeWorkspaceName || histogramNames.length === 0) return
    let cancelled = false
    const t = setTimeout(() => {
      fetchTimelineHistogram(activeWorkspaceName, {
        names: histogramNames,
        buckets: getRows(zl.unit, rowCount).map(row => bucketSpec(zl.unit, row)),
        context: activeContextPath ?? '/',
        ...(activeTreeName ? { treeNameOrTreeId: activeTreeName } : {}),
        allOf: filters.features.allOf,
        anyOf: filters.features.anyOf,
        noneOf: filters.features.noneOf,
        filters: buildGeoFilters(filters.geo),
        applyCanvasSpec: false,
      })
        .then(res => { if (!cancelled) setBuckets(res) })
        .catch(() => { if (!cancelled) setBuckets([]) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceName, activeTreeName, activeContextPath, zl.unit, rowCount, namesKey, featureKey])

  // No workspace / nothing selected → render without density bars.
  const visibleBuckets = activeWorkspaceName && histogramNames.length > 0 ? buckets : []
  const maxTotal = Math.max(1, ...visibleBuckets.map(b => b.total))

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

      // Non-contiguous selections stay disjoint: contiguous offset runs become
      // separate ranges (OR'd server-side) instead of one min..max span that
      // would swallow the unselected periods in between.
      const offs = [...next].sort((a, b) => a - b)
      const runs: Array<[number, number]> = []
      for (const o of offs) {
        const last = runs[runs.length - 1]
        if (last && o === last[1] + 1) last[1] = o
        else runs.push([o, o])
      }
      const ranges = runs.map(([newest, oldest]) => {
        const startD = rows.find(r => r.offset === oldest)!.start
        const endD = new Date(rows.find(r => r.offset === newest)!.end)
        endD.setDate(endD.getDate() - 1) // period end is exclusive
        return { start: isoDay(startD), end: isoDay(endD) }
      })
      onSelectRanges(ranges)
      return next
    })
  }, [rows, onSelectRanges])

  return (
    <div className="w-48 shrink-0 flex flex-col border-r border-border bg-muted/20">
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
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1 touch-target">
        {rows.map(row => {
          const isSelected = selected.has(row.offset)
          const bucket = visibleBuckets[row.offset]
          const total = bucket?.total ?? 0
          const barScale = total > 0 ? Math.log1p(total) / Math.log1p(maxTotal) : 0
          const countsTitle = bucket && total > 0
            ? ` — ${total} doc${total === 1 ? '' : 's'} (${Object.entries(bucket.counts).map(([n, c]) => `${n}: ${c}`).join(', ')})`
            : ''
          return (
            <button
              key={row.offset}
              type="button"
              onClick={(e) => toggleRow(row.offset, e.shiftKey)}
              title={`${row.isNow ? 'Now' : row.label}${countsTitle} — click to tag, shift-click to fill range`}
              className={cn(
                'w-full flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-medium transition-colors select-none text-left',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : row.isNow
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-card text-foreground hover:bg-muted shadow-elevation-1',
              )}
            >
              {row.isNow && <Clock className="w-3 h-3 shrink-0" />}
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="flex items-baseline justify-between gap-1">
                  <span className="truncate">{row.label}</span>
                  {total > 0 && (
                    <span className={cn(
                      'text-[9px] tabular-nums shrink-0',
                      isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground/70',
                    )}>
                      {total}
                    </span>
                  )}
                </span>
                {/* Stacked per-timeline density bar — width ∝ log(count) so a
                    6M-event wikipedia bucket doesn't flatline everything else. */}
                {total > 0 && (
                  <span className="mt-1 flex h-[3px] overflow-hidden rounded-full" style={{ width: `${Math.max(8, barScale * 100)}%` }}>
                    {Object.entries(bucket.counts).map(([name, count]) => (
                      <span
                        key={name}
                        style={{ width: `${(count / total) * 100}%`, backgroundColor: timelineColor(name) }}
                      />
                    ))}
                  </span>
                )}
              </span>
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

// ─── Calendar range picker ────────────────────────────────────────────────────
// Explicit day-level ranges, past AND future (the rail is reverse-chronological
// only — todos need "due July 30"). First click starts the range, second click
// commits it; same day twice = single-day range.

function parseIsoDay(s: string): Date | null {
  const m = /^(-?\d{1,6})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

interface CalendarProps {
  ranges: TimelineRange[]
  onCommitRange: (start: string, end: string) => void
  onToggleDay: (iso: string) => void
}

function CalendarRangePicker({ ranges, onCommitRange, onToggleDay }: CalendarProps) {
  const today = new Date()
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const d = (ranges[0]?.start && parseIsoDay(ranges[0].start)) || today
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const move = (months: number) => setView(v => {
    const d = new Date(v.y, v.m + months, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const handleDay = (iso: string, ctrl: boolean) => {
    // Ctrl/⌘+click refines the existing selection day-by-day: add a stray day,
    // or carve one out of a committed range (deselect weekends etc.).
    if (ctrl) {
      onToggleDay(iso)
      setPendingStart(null)
      setHovered(null)
      return
    }
    if (!pendingStart) {
      setPendingStart(iso)
      return
    }
    const [start, end] = pendingStart <= iso ? [pendingStart, iso] : [iso, pendingStart]
    onCommitRange(start, end)
    setPendingStart(null)
    setHovered(null)
  }

  // 6 fixed weeks, Monday-start.
  const firstOfMonth = new Date(view.y, view.m, 1)
  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(gridStart.getDate() - ((firstOfMonth.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(d.getDate() + i)
    return d
  })

  // Pending two-click preview range (committed ranges highlight independently).
  const [pendStart, pendEnd] = pendingStart
    ? (hovered && hovered !== pendingStart
        ? (pendingStart <= hovered ? [pendingStart, hovered] : [hovered, pendingStart])
        : [pendingStart, pendingStart])
    : [null, null]

  const inCommitted = (iso: string) => ranges.some(r => iso >= r.start && iso <= r.end)
  const isCommittedEdge = (iso: string) => ranges.some(r => iso === r.start || iso === r.end)

  const todayIso = isoDay(today)

  return (
    <div className="select-none">
      {/* Nav header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center">
          <button type="button" onClick={() => move(-12)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Previous year">
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => move(-1)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Previous month">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setView({ y: today.getFullYear(), m: today.getMonth() })}
          className="text-xs font-semibold text-foreground hover:text-primary transition-colors"
          title="Jump to current month"
        >
          {MONTHS[view.m]} {view.y}
        </button>
        <div className="flex items-center">
          <button type="button" onClick={() => move(1)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Next month">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => move(12)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Next year">
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-0.5">
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
          <span key={d} className="text-center text-[9px] font-semibold uppercase text-muted-foreground/60 py-0.5">{d}</span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map(d => {
          const iso = isoDay(d)
          const inMonth = d.getMonth() === view.m
          const inPending = pendStart !== null && pendEnd !== null && iso >= pendStart && iso <= pendEnd
          const isPendingEdge = iso === pendStart || iso === pendEnd
          const committed = !pendingStart && inCommitted(iso)
          const isEdge = isPendingEdge || (committed && isCommittedEdge(iso))
          const inRange = inPending || committed
          return (
            <button
              key={iso}
              type="button"
              onClick={(e) => handleDay(iso, e.ctrlKey || e.metaKey)}
              onMouseEnter={() => pendingStart && setHovered(iso)}
              className={cn(
                'h-6 text-[11px] tabular-nums transition-colors',
                isEdge
                  ? 'bg-primary text-primary-foreground rounded-md'
                  : inRange
                    ? 'bg-primary/15 text-foreground'
                    : inMonth ? 'text-foreground hover:bg-muted rounded-md' : 'text-muted-foreground/40 hover:bg-muted rounded-md',
                iso === todayIso && !isEdge && 'font-bold text-primary',
              )}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      <p className="mt-1.5 text-[10px] text-muted-foreground/70">
        {pendingStart
          ? `From ${pendingStart} — pick the end date`
          : 'Click start + end. Ctrl+click adds/removes single days.'}
      </p>
    </div>
  )
}

// ─── Colored toggle switch ────────────────────────────────────────────────────

interface TimelineToggleProps {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  color: string
}

function TimelineToggle({ label, checked, onChange, color }: TimelineToggleProps) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onChange(!checked)}
      className="flex items-center justify-between gap-3 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm text-foreground truncate">{label}</span>
      </span>
      <div
        className={cn(
          'relative w-10 h-5 rounded-full transition-colors shrink-0',
          !checked && 'bg-accent dark:bg-muted-foreground',
        )}
        style={checked ? { backgroundColor: color } : undefined}
      >
        <div
          className={cn(
            'absolute top-[2px] w-4 h-4 rounded-full bg-background shadow-elevation-1 transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
          )}
        />
      </div>
    </div>
  )
}

// ─── Timeline tab ─────────────────────────────────────────────────────────────

export function TimelineTab() {
  const { state, setTimelineFilter, createTimeline, deleteTimeline, setTimelineQuantum, refreshTimelines } = useToolbox()
  const { timeline } = state.filters
  const { availableTimelines, timelineQuantums, timelinesLoading } = state
  const [newTimelineName, setNewTimelineName] = useState('')
  const [newTimelineQuantum, setNewTimelineQuantum] = useState<string>(DEFAULT_TIMELINE_QUANTUM)
  const [creatingTimeline, setCreatingTimeline] = useState(false)
  const [deletingTimeline, setDeletingTimeline] = useState<string | null>(null)
  const [specMode, setSpecMode] = useState<'quick' | 'calendar'>('quick')
  const [deepTimeOpen, setDeepTimeOpen] = useState(false)
  const { showToast } = useToast()

  const selectedTimelines = new Set(timeline.selectedTimelines ?? [])

  // The rail's density layers = the timelines currently being filtered on;
  // the "Apply to" toggles below double as the color legend.
  const histogramNames = useMemo(() => {
    const names: string[] = []
    if (timeline.indexCreated) names.push('crud:created')
    if (timeline.indexUpdated) names.push('crud:updated')
    if (timeline.indexDeleted) names.push('crud:deleted')
    if (timeline.contentEvents) names.push('content')
    names.push(...(timeline.selectedTimelines ?? []))
    return names.length > 0 ? names : ['crud:created']
  }, [timeline.indexCreated, timeline.indexUpdated, timeline.indexDeleted, timeline.contentEvents, timeline.selectedTimelines])

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
      // Quantum is passed at creation (before any entry lands): membership
      // cells are tiled at the quantum in force when they are written.
      await createTimeline(name, newTimelineQuantum !== DEFAULT_TIMELINE_QUANTUM ? newTimelineQuantum : undefined)
      setNewTimelineName('')
      setNewTimelineQuantum(DEFAULT_TIMELINE_QUANTUM)
      showToast({ title: 'Timeline created', description: name })
    } catch (e) {
      showToast({ title: 'Failed to create timeline', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setCreatingTimeline(false)
    }
  }

  const handleQuantumChange = async (name: string, quantum: string) => {
    try {
      const applied = await setTimelineQuantum(name, quantum)
      showToast({ title: 'Quantum updated', description: `${name} → ${applied}. New entries tile at ${applied}; existing ones keep their cells.` })
    } catch (e) {
      showToast({ title: 'Failed to set quantum', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
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

  const ranges = getTimelineRanges(timeline)
  const hasRanges = ranges.length > 0

  // Rail rows commit explicit ranges (one per contiguous run); supersedes any
  // active quick token. Empty selection clears the range filter.
  const handleSelectRanges = useCallback((next: TimelineRange[]) => {
    setTimelineFilter({
      customRanges: next,
      customRange: null,
      ...(next.length > 0 ? { quickFilter: null } : {}),
    })
  }, [setTimelineFilter])

  const handleQuickToken = (token: string) => {
    setTimelineFilter({
      quickFilter: timeline.quickFilter === token ? null : token,
      customRanges: [],
      customRange: null,
    })
  }

  const removeRange = (idx: number) => {
    setTimelineFilter({ customRanges: ranges.filter((_, i) => i !== idx), customRange: null })
  }

  const renderMatrixRow = (row: MatrixRow, isDay: boolean) => (
    <div key={row.label} className="grid grid-cols-[3.5rem_1fr_1fr_1fr] gap-1 items-center">
      <span className="text-[11px] text-muted-foreground">{row.label}</span>
      {row.cells.map((token, i) => {
        const active = timeline.quickFilter === token && !hasRanges
        return (
          <button
            key={token}
            type="button"
            onClick={() => handleQuickToken(token)}
            className={cn(
              'text-xs px-1.5 py-1 rounded-md transition-colors truncate',
              active
                ? 'bg-primary text-primary-foreground font-medium'
                : 'bg-muted/50 text-foreground hover:bg-muted',
            )}
            title={token}
          >
            {isDay ? DAY_CELL_LABELS[i] : ['Last', 'This', 'Next'][i]}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="flex h-full min-h-0">
      {/* Density rail */}
      <TimelineRail
        quickFilterKey={timeline.quickFilter}
        activeRangeCount={ranges.length}
        onSelectRanges={handleSelectRanges}
        histogramNames={histogramNames}
      />

      {/* Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Quick / Calendar segmented toggle */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {specMode === 'quick' ? 'Quick filter' : 'Date range'}
            </p>
            <div className="flex rounded-md overflow-hidden border border-border divide-x divide-border">
              <button
                type="button"
                onClick={() => setSpecMode('quick')}
                className={cn(
                  'px-2 py-0.5 transition-colors',
                  specMode === 'quick' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                title="Quick filters"
              >
                <Zap className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setSpecMode('calendar')}
                className={cn(
                  'px-2 py-0.5 transition-colors',
                  specMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                title="Calendar range picker"
              >
                <CalendarDays className="w-3 h-3" />
              </button>
            </div>
          </div>

          {specMode === 'quick' ? (
            <div className="space-y-1">
              {/* Column headers */}
              <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr] gap-1">
                <span />
                {['Last', 'This', 'Next'].map(h => (
                  <span key={h} className="text-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60">{h}</span>
                ))}
              </div>
              {MATRIX_ROWS.map((row, i) => renderMatrixRow(row, i === 0))}

              {/* Deep time — collapsed by default */}
              <button
                type="button"
                onClick={() => setDeepTimeOpen(o => !o)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-muted-foreground pt-1 transition-colors"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', !deepTimeOpen && '-rotate-90')} />
                Deep time
              </button>
              {deepTimeOpen && DEEP_TIME_ROWS.map(row => renderMatrixRow(row, false))}
            </div>
          ) : (
            <CalendarRangePicker
              ranges={ranges}
              onCommitRange={(start, end) => setTimelineFilter({ customRanges: [{ start, end }], customRange: null, quickFilter: null })}
              onToggleDay={(iso) => setTimelineFilter({ customRanges: toggleDayInRanges(ranges, iso), customRange: null, quickFilter: null })}
            />
          )}

          {hasRanges && (
            <div className="mt-2 space-y-1">
              {ranges.map((r, i) => (
                <div key={`${r.start}..${r.end}`} className="flex items-center justify-between gap-2 rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1.5">
                  <span className="text-xs text-foreground truncate">
                    {r.start === r.end ? r.start : `${r.start} → ${r.end}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRange(i)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    title="Remove range"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Apply to — one spec, N timelines. Doubles as the rail color legend. */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Apply to
          </p>
          <div className="space-y-2">
            <TimelineToggle
              label="crud:created"
              checked={timeline.indexCreated}
              onChange={(v) => setTimelineFilter({ indexCreated: v })}
              color={timelineColor('crud:created')}
            />
            <TimelineToggle
              label="crud:updated"
              checked={timeline.indexUpdated}
              onChange={(v) => setTimelineFilter({ indexUpdated: v })}
              color={timelineColor('crud:updated')}
            />
            <TimelineToggle
              label="crud:deleted"
              checked={timeline.indexDeleted}
              onChange={(v) => setTimelineFilter({ indexDeleted: v })}
              color={timelineColor('crud:deleted')}
            />
            <TimelineToggle
              label="content"
              checked={timeline.contentEvents}
              onChange={(v) => setTimelineFilter({ contentEvents: v })}
              color={timelineColor('content')}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            content = content-derived timestamps (EXIF, logs, extracted periods)
          </p>
        </div>

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
                const color = timelineColor(name)
                return (
                  <div
                    key={name}
                    className={cn(
                      'flex items-center gap-2.5 group rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                      checked ? 'bg-muted/60' : 'hover:bg-muted/30',
                    )}
                    onClick={() => handleToggleTimeline(name)}
                  >
                    {/* Checkbox in the timeline's color */}
                    <div
                      className={cn(
                        'shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                        !checked && 'border-muted-foreground/40 bg-transparent group-hover:border-muted-foreground/70',
                      )}
                      style={checked ? { backgroundColor: color, borderColor: color } : undefined}
                    >
                      {checked && (
                        <svg className={cn('w-2.5 h-2.5', onAccentTextClass(color))} viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="flex-1 text-sm text-foreground truncate select-none">
                      {name}
                    </span>
                    {/* Membership quantum — the timeline's finest granularity.
                        Changing it re-tiles NEW entries only, so the toast says so. */}
                    <select
                      value={timelineQuantums[name] ?? DEFAULT_TIMELINE_QUANTUM}
                      onChange={(e) => { e.stopPropagation(); handleQuantumChange(name, e.target.value) }}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground border border-transparent hover:border-ring/40 focus:border-ring focus:outline-none cursor-pointer"
                      title={`Membership quantum for "${name}" (finest cell granularity; new entries only)`}
                    >
                      {TIMELINE_QUANTA.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                    <button
                      type="button"
                      disabled={deletingTimeline === name}
                      onClick={(e) => { e.stopPropagation(); handleDeleteTimeline(name) }}
                      className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 reveal-on-hover"
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
            <select
              value={newTimelineQuantum}
              onChange={e => setNewTimelineQuantum(e.target.value)}
              className="shrink-0 px-1.5 py-1 text-xs rounded-md bg-muted text-muted-foreground border border-transparent focus:border-ring focus:outline-none cursor-pointer"
              title="Membership quantum: the timeline's finest granularity (day for calendars, year for historical corpora, Kyr/Myr/Gyr for deep time)"
            >
              {TIMELINE_QUANTA.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
            <button
              type="button"
              onClick={handleCreateTimeline}
              disabled={creatingTimeline || !newTimelineName.trim()}
              className="shrink-0 p-1.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 touch-target"
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

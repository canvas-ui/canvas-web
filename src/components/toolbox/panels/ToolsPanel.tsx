import { useState, useRef, useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Save, Loader2, Search, Trash2, Plus, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react'
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

// ─── Zoomable timeline rail ───────────────────────────────────────────────────

type ZoomLevel = 0 | 1 | 2 | 3 | 4 | 5

interface ZoomConfig {
  label: string
  unit: 'millennium' | 'century' | 'decade' | 'year' | 'month' | 'week'
  tickCount: number
  // How many ms per pixel (approx, for drag scroll)
  msPerPx: number
}

const ZOOM_LEVELS: ZoomConfig[] = [
  { label: 'Millennium', unit: 'millennium', tickCount: 5,  msPerPx: 3e10 },
  { label: 'Century',    unit: 'century',    tickCount: 10, msPerPx: 3e9  },
  { label: 'Decade',     unit: 'decade',     tickCount: 10, msPerPx: 3e8  },
  { label: 'Year',       unit: 'year',       tickCount: 12, msPerPx: 2.6e6},
  { label: 'Month',      unit: 'month',      tickCount: 4,  msPerPx: 6e5  },
  { label: 'Week',       unit: 'week',       tickCount: 7,  msPerPx: 8.6e4},
]

function getTickLabels(centerDate: Date, zl: ZoomConfig): { label: string; isNow: boolean }[] {
  const now = new Date()
  const y = centerDate.getFullYear()
  const m = centerDate.getMonth()

  switch (zl.unit) {
    case 'millennium': {
      const base = Math.floor(y / 1000) * 1000 - 2000
      return Array.from({ length: zl.tickCount }, (_, i) => {
        const yr = base + i * 1000
        return { label: yr <= 0 ? `${1 - yr} BCE` : `${yr}`, isNow: yr === Math.floor(now.getFullYear() / 1000) * 1000 }
      })
    }
    case 'century': {
      const base = Math.floor(y / 100) * 100 - 500
      return Array.from({ length: zl.tickCount }, (_, i) => {
        const yr = base + i * 100
        return { label: yr <= 0 ? `${1 - yr} BCE` : `${yr}`, isNow: yr === Math.floor(now.getFullYear() / 100) * 100 }
      })
    }
    case 'decade': {
      const base = Math.floor(y / 10) * 10 - 50
      return Array.from({ length: zl.tickCount }, (_, i) => {
        const yr = base + i * 10
        return { label: `${yr}`, isNow: yr === Math.floor(now.getFullYear() / 10) * 10 }
      })
    }
    case 'year': {
      return Array.from({ length: zl.tickCount }, (_, i) => {
        const yr = y - 6 + i
        return { label: `${yr}`, isNow: yr === now.getFullYear() }
      })
    }
    case 'month': {
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      return Array.from({ length: zl.tickCount }, (_, i) => {
        const mo = (m - 2 + i + 12) % 12
        const yr = y + Math.floor((m - 2 + i) / 12)
        return { label: `${MONTHS[mo]} ${yr}`, isNow: mo === now.getMonth() && yr === now.getFullYear() }
      })
    }
    case 'week': {
      const base = new Date(centerDate)
      base.setDate(base.getDate() - 3)
      return Array.from({ length: zl.tickCount }, (_, i) => {
        const d = new Date(base)
        d.setDate(base.getDate() + i)
        const isNow = d.toDateString() === now.toDateString()
        return { label: `${d.getDate()}/${d.getMonth() + 1}`, isNow }
      })
    }
  }
}

// Map quick filter key → zoom level index
const QF_ZOOM: Partial<Record<string, ZoomLevel>> = {
  today: 5,
  yesterday: 5,
  thisWeek: 4,
  thisMonth: 3,
  thisYear: 2,
  thisCentury: 1,
  thisMillennium: 0,
}

interface TimelineRailProps {
  quickFilterKey: string | null
  onSelectRange: (start: Date, end: Date) => void
}

function TimelineRail({ quickFilterKey, onSelectRange }: TimelineRailProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(2)
  const [centerDate, setCenterDate] = useState(() => new Date())
  const railRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startDate: Date } | null>(null)
  const [selectedRange, setSelectedRange] = useState<{ top: number; height: number } | null>(null)
  const [brushStart, setBrushStart] = useState<number | null>(null)

  // Sync zoom level when quick filter changes
  useEffect(() => {
    if (quickFilterKey && QF_ZOOM[quickFilterKey] !== undefined) {
      setZoomLevel(QF_ZOOM[quickFilterKey] as ZoomLevel)
    }
  }, [quickFilterKey])

  const zl = ZOOM_LEVELS[zoomLevel]
  const ticks = getTickLabels(centerDate, zl)

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+scroll → zoom
      setZoomLevel(prev => Math.max(0, Math.min(5, prev + (e.deltaY > 0 ? -1 : 1))) as ZoomLevel)
    } else {
      // Scroll → pan in time
      const shift = e.deltaY * zl.msPerPx * 2
      setCenterDate(prev => new Date(prev.getTime() + shift))
    }
  }, [zl.msPerPx])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rect = railRef.current?.getBoundingClientRect()
    if (!rect) return
    const y = e.clientY - rect.top
    setBrushStart(y)
    setSelectedRange(null)
    dragRef.current = { startY: e.clientY, startDate: new Date(centerDate) }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current || !railRef.current) return
      const r = railRef.current.getBoundingClientRect()
      const curY = ev.clientY - r.top
      if (Math.abs(curY - (brushStart ?? curY)) < 4) return
      const top = Math.min(brushStart ?? curY, curY)
      const height = Math.abs(curY - (brushStart ?? curY))
      setSelectedRange({ top, height })
    }

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!railRef.current) return
      const r = railRef.current.getBoundingClientRect()
      const startY = Math.min(brushStart ?? 0, ev.clientY - r.top)
      const endY = Math.max(brushStart ?? 0, ev.clientY - r.top)
      const h = r.height
      const totalMs = zl.tickCount * zl.msPerPx * (h / zl.tickCount) * h
      const centerMs = centerDate.getTime()
      const halfMs = (totalMs / 2)
      const startMs = centerMs - halfMs + (startY / h) * totalMs
      const endMs = centerMs - halfMs + (endY / h) * totalMs
      if (Math.abs(endMs - startMs) > 1000) {
        onSelectRange(new Date(startMs), new Date(endMs))
      } else {
        setSelectedRange(null)
      }
      dragRef.current = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [centerDate, brushStart, zl, onSelectRange])

  const jumpToNow = () => setCenterDate(new Date())

  return (
    <div className="w-16 shrink-0 flex flex-col border-r border-border">
      {/* Zoom controls */}
      <div className="flex flex-col items-center gap-0.5 py-1.5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={() => setZoomLevel(prev => Math.min(5, prev + 1) as ZoomLevel)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-3 h-3" />
        </button>
        <span className="text-[9px] text-muted-foreground/60 select-none leading-none px-0.5 text-center">
          {zl.label}
        </span>
        <button
          type="button"
          onClick={() => setZoomLevel(prev => Math.max(0, prev - 1) as ZoomLevel)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-3 h-3" />
        </button>
      </div>

      {/* Rail */}
      <div
        ref={railRef}
        className="relative flex-1 overflow-hidden cursor-ns-resize select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2 pointer-events-none" />

        {/* Ticks */}
        {ticks.map((tick, i) => {
          const yPct = ((i + 0.5) / ticks.length) * 100
          return (
            <div
              key={i}
              className="absolute left-0 right-0 flex items-center pointer-events-none"
              style={{ top: `${yPct}%`, transform: 'translateY(-50%)' }}
            >
              <div className={cn(
                'w-full flex items-center justify-center',
              )}>
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full border shrink-0',
                  tick.isNow
                    ? 'bg-primary border-primary'
                    : 'bg-muted border-border',
                )} />
              </div>
            </div>
          )
        })}

        {/* Labels on hover — static for now, shown as tiny text */}
        {ticks.map((tick, i) => {
          const yPct = ((i + 0.5) / ticks.length) * 100
          return (
            <div
              key={`lbl-${i}`}
              className="absolute left-0 right-0 pointer-events-none flex justify-center"
              style={{ top: `${yPct}%`, transform: 'translateY(-50%)' }}
            >
              <span className={cn(
                'text-[8px] leading-none px-0.5 rounded',
                tick.isNow
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground/50',
              )}>
                {tick.label}
              </span>
            </div>
          )
        })}

        {/* Brush selection overlay */}
        {selectedRange && (
          <div
            className="absolute left-1 right-1 bg-primary/20 border border-primary/40 rounded pointer-events-none"
            style={{ top: selectedRange.top, height: selectedRange.height }}
          />
        )}

        {/* Quick-filter highlight */}
        {quickFilterKey && (
          <div className="absolute left-0 right-0 pointer-events-none"
            style={{ top: '45%', height: '10%' }}
          >
            <div className="mx-1 h-full bg-primary/10 border-l-2 border-primary/60 rounded-r" />
          </div>
        )}
      </div>

      {/* Jump to now */}
      <button
        type="button"
        onClick={jumpToNow}
        className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground py-1 border-t border-border transition-colors text-center shrink-0"
        title="Jump to now"
      >
        now
      </button>
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

  const domainTimelines = availableTimelines.filter(n => !n.startsWith('crud:'))

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

        {/* Content */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Content
          </p>
          <MD2Toggle
            label="Search document content"
            checked={timeline.searchContent}
            onChange={(v) => setTimelineFilter({ searchContent: v })}
          />
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
  client: 'Client',
  server: 'Server',
  user: 'User',
  tag: 'Tags',
  device: 'Device',
  custom: 'Custom',
  feature: 'Feature',
}

function groupBitmaps(keys: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const key of keys) {
    const prefix = key.split('/')[0]
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(key)
  }
  return groups
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
  const groups = groupBitmaps(filtered)

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
        {groups.size === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No matches</p>
        ) : (
          Array.from(groups.entries()).map(([prefix, keys]) => (
            <div key={prefix}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {PREFIX_LABELS[prefix] ?? prefix}
              </p>
              <div className="flex flex-col gap-1">
                {keys.map((key) => {
                  const isProtected = key.startsWith('data/')
                  const mode = modeOf(key)
                  return (
                    <div
                      key={key}
                      className={cn(
                        'flex items-center gap-2 group rounded-md pl-2 pr-1.5 py-1 border-l-2 transition-colors',
                        mode === 'off' ? 'border-l-transparent hover:bg-muted/40'
                          : mode === 'anyOf' ? 'border-l-blue-500 bg-blue-500/5'
                          : mode === 'allOf' ? 'border-l-emerald-500 bg-emerald-500/5'
                          : 'border-l-rose-500 bg-rose-500/5',
                      )}
                    >
                      <span className="flex-1 min-w-0 text-xs font-mono text-foreground truncate" title={key}>
                        {key}
                      </span>
                      <ModeControl mode={mode} onSet={(m) => setFeatureMode(key, m)} />
                      {!isProtected && (
                        <button
                          type="button"
                          disabled={deleting === key}
                          onClick={() => handleDelete(key)}
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

interface ToolsPanelProps {
  onClose: () => void
}

export function ToolsPanel({ onClose }: ToolsPanelProps) {
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
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
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

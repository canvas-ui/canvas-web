import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { dateKey, formatHour, formatTime, minutesIntoDay, sameDay, startOfDay, WEEKDAY_SHORT } from '@/lib/calendar/dates'
import { timeGridDrag, type DragRange } from '@/lib/calendar/drag'
import { groupByDay, isAllDayLane, layoutDay, type Occurrence } from '@/lib/calendar/occurrences'
import { occurrenceColor, tint } from './calendar-colors'
import { EntryChip } from './EntryChip'

const HOUR_PX = 48
const SNAP_MIN = 30
const GUTTER = 'w-12'
const GUTTER_PX = 48

// Day and week share one grid: a day is a week with one column. Timed
// entries are laid out by layoutDay (overlaps share the width); all-day and
// multi-day entries sit in the lane above the hours.
export function TimeGrid({ days, occurrences, selectedKey, pending, onSelect, onCreate, onPickDay, compact }: {
  days: Date[]
  occurrences: Occurrence[]
  selectedKey: string | null
  /** Range of the draft being edited — stays highlighted after the drag ends. */
  pending: DragRange | null
  onSelect: (o: Occurrence) => void
  onCreate: (start: Date, allDay: boolean, end?: Date) => void
  onPickDay: (day: Date) => void
  compact: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  // Drag-to-select (Outlook/Google): press on empty grid, move, release. A
  // press without movement is a click and creates one slot.
  const [drag, setDrag] = useState<{ fromDay: number; fromMin: number; toDay: number; toMin: number } | null>(null)
  const dragRef = useRef(drag)
  useEffect(() => { dragRef.current = drag })
  const pointAt = (e: React.PointerEvent): { day: number; min: number } | null => {
    const el = body.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const colWidth = (rect.width - GUTTER_PX) / days.length
    const day = Math.floor((e.clientX - rect.left - GUTTER_PX) / colWidth)
    const min = Math.max(0, Math.min(1439, ((e.clientY - rect.top) / HOUR_PX) * 60))
    return day < 0 || day >= days.length ? null : { day, min }
  }
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    const at = pointAt(e)
    if (!at) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ fromDay: at.day, fromMin: at.min, toDay: at.day, toMin: at.min })
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const at = pointAt(e)
    if (at) setDrag({ ...dragRef.current, toDay: at.day, toMin: at.min })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
    const range = timeGridDrag(days, d.fromDay, d.fromMin, d.toDay, d.toMin, SNAP_MIN)
    onCreate(range.start, range.allDay, range.end)
  }
  const selection: DragRange | null = drag ? timeGridDrag(days, drag.fromDay, drag.fromMin, drag.toDay, drag.toMin, SNAP_MIN) : pending
  const byDay = useMemo(() => groupByDay(occurrences), [occurrences])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // First paint lands on the working morning, or an hour before now on a
  // view that contains today.
  const firstDayKey = dateKey(days[0])
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const today = days.some(d => sameDay(d, now))
    const hour = today ? Math.max(0, now.getHours() - 1) : 7
    el.scrollTop = hour * HOUR_PX
    // Only on mount / when the visible days change, never on the minute tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDayKey, days.length])

  const hours = Array.from({ length: 24 }, (_, h) => h)
  const lane = days.map(day => (byDay.get(dateKey(day)) ?? []).filter(isAllDayLane))
  const laneRows = Math.max(0, ...lane.map(l => l.length))

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Day headers */}
      <div className="flex shrink-0 border-b border-border">
        <div className={cn(GUTTER, 'shrink-0')} />
        {days.map(day => {
          const isToday = sameDay(day, now)
          return (
            <button
              key={dateKey(day)}
              type="button"
              onClick={() => onPickDay(day)}
              className="flex min-w-0 flex-1 flex-col items-center border-l border-border/60 py-1 hover:bg-muted/50"
              title="Open day"
            >
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{WEEKDAY_SHORT[(day.getDay() + 6) % 7]}</span>
              <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold', isToday && 'bg-primary text-primary-foreground')}>{day.getDate()}</span>
            </button>
          )
        })}
      </div>

      {/* All-day lane */}
      {laneRows > 0 && (
        <div className="flex shrink-0 border-b border-border bg-muted/20">
          <div className={cn(GUTTER, 'shrink-0 py-1 pr-1 text-right text-[10px] text-muted-foreground')}>{compact ? '' : 'all day'}</div>
          {days.map((day, i) => (
            <div
              key={dateKey(day)}
              className="flex min-w-0 flex-1 flex-col gap-0.5 border-l border-border/60 p-0.5"
              onClick={(e) => { if (e.target === e.currentTarget) onCreate(startOfDay(day), true) }}
            >
              {lane[i].map(o => <EntryChip key={o.key} occurrence={o} selected={o.key === selectedKey} showTime={false} onSelect={onSelect} />)}
            </div>
          ))}
        </div>
      )}

      {/* Hours */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div
          ref={body}
          className={cn('relative flex select-none', drag && 'cursor-crosshair')}
          style={{ height: 24 * HOUR_PX }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          <div className={cn(GUTTER, 'relative shrink-0')}>
            {hours.map(h => (
              <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : formatHour(h)}
              </div>
            ))}
          </div>
          {days.map(day => {
            const blocks = layoutDay(day, byDay.get(dateKey(day)) ?? [])
            const isToday = sameDay(day, now)
            const nowTop = isToday ? ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX : null
            return (
              <div
                key={dateKey(day)}
                className="relative min-w-0 flex-1 cursor-cell border-l border-border/60"
                role="presentation"
              >
                {selection && selection.end > day && selection.start < startOfDay(new Date(day.getTime() + 86_400_000)) && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 z-[5] rounded-md border border-primary bg-primary/15"
                    style={{
                      top: (minutesIntoDay(selection.start, day) / 60) * HOUR_PX,
                      height: Math.max(8, ((minutesIntoDay(selection.end, day) - minutesIntoDay(selection.start, day)) / 60) * HOUR_PX),
                    }}
                  >
                    <span className="absolute left-1 top-0.5 text-[10px] font-medium text-primary">
                      {selection.allDay ? 'All day' : `${formatTime(selection.start)} – ${formatTime(selection.end)}`}
                    </span>
                  </div>
                )}
                {hours.map(h => (
                  <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/50" style={{ top: h * HOUR_PX }} />
                ))}
                {blocks.map(block => {
                  const o = block.occurrence
                  const color = occurrenceColor(o)
                  const width = 100 / block.columns
                  const short = block.height < 45
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelect(o) }}
                      title={`${o.title} · ${formatTime(o.start)}${o.end > o.start ? ` – ${formatTime(o.end)}` : ''}`}
                      className={cn(
                        'absolute overflow-hidden rounded-md border-l-[3px] px-1.5 text-left text-[11px] leading-tight text-foreground shadow-elevation-1 transition-[filter] hover:brightness-110',
                        o.key === selectedKey && 'ring-1 ring-ring',
                        o.done && 'line-through opacity-60',
                      )}
                      style={{
                        top: (block.top / 60) * HOUR_PX,
                        height: Math.max(18, (block.height / 60) * HOUR_PX - 2),
                        left: `calc(${block.column * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                        background: tint(color, 24),
                        borderLeftColor: color,
                        paddingTop: short ? 1 : 3,
                      }}
                    >
                      <span className={cn('font-medium', short ? 'inline' : 'block truncate')}>{o.title}</span>
                      {!short && <span className="block truncate text-[10px] text-muted-foreground">{formatTime(o.start)}{o.end > o.start ? ` – ${formatTime(o.end)}` : ''}{o.calendar && !compact ? ` · ${o.calendar}` : ''}</span>}
                    </button>
                  )
                })}
                {nowTop !== null && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive" style={{ top: nowTop }}>
                    <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-destructive" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

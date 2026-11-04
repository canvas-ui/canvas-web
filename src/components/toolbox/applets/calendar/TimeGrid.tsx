import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { dateKey, formatHour, formatTime, sameDay, startOfDay, WEEKDAY_SHORT } from '@/lib/calendar/dates'
import { groupByDay, isAllDayLane, layoutDay, type Occurrence } from '@/lib/calendar/occurrences'
import { occurrenceColor, tint } from './calendar-colors'
import { EntryChip } from './EntryChip'

const HOUR_PX = 48
const SNAP_MIN = 30
const GUTTER = 'w-12'

// Day and week share one grid: a day is a week with one column. Timed
// entries are laid out by layoutDay (overlaps share the width); all-day and
// multi-day entries sit in the lane above the hours.
export function TimeGrid({ days, occurrences, selectedKey, onSelect, onCreate, onPickDay, compact }: {
  days: Date[]
  occurrences: Occurrence[]
  selectedKey: string | null
  onSelect: (o: Occurrence) => void
  onCreate: (start: Date, allDay: boolean) => void
  onPickDay: (day: Date) => void
  compact: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
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

  const clickToCreate = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const minutes = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN
    const start = startOfDay(day)
    start.setMinutes(Math.max(0, Math.min(23 * 60 + 30, minutes)))
    onCreate(start, false)
  }

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
        <div className="relative flex" style={{ height: 24 * HOUR_PX }}>
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
                onClick={(e) => clickToCreate(day, e)}
                role="presentation"
              >
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

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { dateFromKey, formatMonthShort, formatTime, sameDay, WEEKDAY_SHORT } from '@/lib/calendar/dates'
import { groupByDay, isAllDayLane, type Occurrence } from '@/lib/calendar/occurrences'
import { occurrenceColor } from './calendar-colors'

// Agenda list: only days that have something, each with its entries. The
// range is the parent's; "Earlier" / "Later" extend it.
export function ScheduleView({ occurrences, selectedKey, onSelect, onEarlier, onLater, onPickDay, loading }: {
  occurrences: Occurrence[]
  selectedKey: string | null
  onSelect: (o: Occurrence) => void
  onEarlier: () => void
  onLater: () => void
  onPickDay: (day: Date) => void
  loading: boolean
}) {
  const days = useMemo(() => [...groupByDay(occurrences).entries()].sort(([a], [b]) => a.localeCompare(b)), [occurrences])
  const today = new Date()
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="flex justify-center py-2">
        <button type="button" onClick={onEarlier} className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Earlier</button>
      </div>
      {!loading && !days.length && <p className="py-10 text-center text-sm text-muted-foreground">Nothing scheduled in this range.</p>}
      {days.map(([key, list]) => {
        const day = dateFromKey(key)
        const isToday = sameDay(day, today)
        return (
          <div key={key} className="flex border-t border-border/60 px-2 py-2">
            <button type="button" onClick={() => onPickDay(day)} className="flex w-14 shrink-0 flex-col items-start" title="Open day">
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold', isToday && 'bg-primary text-primary-foreground')}>{day.getDate()}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{formatMonthShort(day)}, {WEEKDAY_SHORT[(day.getDay() + 6) % 7]}</span>
            </button>
            <div className="min-w-0 flex-1 space-y-0.5">
              {list.map(o => {
                const color = occurrenceColor(o)
                const timed = !isAllDayLane(o) && o.kind === 'event'
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => onSelect(o)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted',
                      o.key === selectedKey && 'bg-muted ring-1 ring-ring',
                      o.done && 'line-through opacity-60',
                    )}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="w-[7.5rem] shrink-0 text-xs tabular-nums text-muted-foreground">
                      {timed ? `${formatTime(o.start)}${o.end > o.start ? ` – ${formatTime(o.end)}` : ''}` : (o.kind === 'task' ? `due ${formatTime(o.start)}` : 'All day')}
                    </span>
                    <span className="truncate">{o.title}</span>
                    {o.calendar && o.kind === 'event' && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{o.calendar}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="flex justify-center py-2">
        <button type="button" onClick={onLater} className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Later</button>
      </div>
    </div>
  )
}

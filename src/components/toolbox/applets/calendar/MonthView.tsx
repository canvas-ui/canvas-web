import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { dateKey, monthGrid, sameDay, startOfDay, WEEKDAY_SHORT } from '@/lib/calendar/dates'
import { groupByDay, type Occurrence } from '@/lib/calendar/occurrences'
import { occurrenceColor } from './calendar-colors'
import { EntryChip } from './EntryChip'

const MAX_CHIPS = 3

// Six-week grid. Wide hosts show entry chips per cell; a narrow host shows
// density dots and the cell opens the day — the month then works as a
// navigator, the way phone calendars do.
export function MonthView({ month, occurrences, selectedKey, onSelect, onCreate, onPickDay, narrow }: {
  month: Date
  occurrences: Occurrence[]
  selectedKey: string | null
  onSelect: (o: Occurrence) => void
  onCreate: (start: Date, allDay: boolean) => void
  onPickDay: (day: Date) => void
  narrow: boolean
}) {
  const days = monthGrid(month)
  const byDay = useMemo(() => groupByDay(occurrences), [occurrences])
  const today = new Date()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-border text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_SHORT.map(d => <span key={d} className="py-1">{narrow ? d[0] : d}</span>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-y-auto">
        {days.map(day => {
          const key = dateKey(day)
          const list = byDay.get(key) ?? []
          const inMonth = day.getMonth() === month.getMonth()
          const isToday = sameDay(day, today)
          const overflow = list.length - MAX_CHIPS
          return (
            <div
              key={key}
              role="presentation"
              onClick={(e) => { if (e.target === e.currentTarget) { if (narrow) onPickDay(day); else onCreate(startOfDay(day), true) } }}
              className={cn(
                'flex min-h-[3.5rem] min-w-0 flex-col gap-0.5 border-b border-r border-border/60 p-0.5',
                !inMonth && 'bg-muted/20 text-muted-foreground/60',
                !narrow && 'cursor-cell',
              )}
            >
              <button
                type="button"
                onClick={() => onPickDay(day)}
                className={cn(
                  'mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[11px] hover:bg-muted sm:mx-0',
                  isToday && 'bg-primary font-bold text-primary-foreground hover:bg-primary',
                )}
                title="Open day"
              >
                {day.getDate()}
              </button>
              {narrow ? (
                <div className="flex flex-wrap justify-center gap-0.5 px-0.5">
                  {list.slice(0, 4).map(o => <span key={o.key} className="h-1.5 w-1.5 rounded-full" style={{ background: occurrenceColor(o) }} />)}
                </div>
              ) : (
                <>
                  {list.slice(0, MAX_CHIPS).map(o => <EntryChip key={o.key} occurrence={o} selected={o.key === selectedKey} onSelect={onSelect} />)}
                  {overflow > 0 && (
                    <button type="button" onClick={() => onPickDay(day)} className="px-1 text-left text-[10px] text-muted-foreground hover:text-foreground">
                      +{overflow} more
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

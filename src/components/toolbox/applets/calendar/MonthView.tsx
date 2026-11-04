import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { dateFromKey, dateKey, monthGrid, sameDay, WEEKDAY_SHORT } from '@/lib/calendar/dates'
import { dayRangeDrag, type DragRange } from '@/lib/calendar/drag'
import { groupByDay, type Occurrence } from '@/lib/calendar/occurrences'
import { occurrenceColor } from './calendar-colors'
import { EntryChip } from './EntryChip'

const MAX_CHIPS = 3

// Six-week grid. Wide hosts show entry chips per cell; a narrow host shows
// density dots and the cell opens the day — the month then works as a
// navigator, the way phone calendars do.
export function MonthView({ month, occurrences, selectedKey, pending, onSelect, onCreate, onPickDay, narrow }: {
  month: Date
  occurrences: Occurrence[]
  selectedKey: string | null
  /** Range of the draft being edited — stays highlighted after the drag ends. */
  pending: DragRange | null
  onSelect: (o: Occurrence) => void
  onCreate: (start: Date, allDay: boolean, end?: Date) => void
  onPickDay: (day: Date) => void
  narrow: boolean
}) {
  const days = monthGrid(month)
  const byDay = useMemo(() => groupByDay(occurrences), [occurrences])
  const today = new Date()
  // Drag across cells selects a day span (a press without movement is a
  // click on that day). Cells carry data-day so the pointer can be resolved
  // while the grid holds the capture.
  const [drag, setDrag] = useState<{ from: string; to: string } | null>(null)
  const dragRef = useRef(drag)
  useEffect(() => { dragRef.current = drag })
  const dayAt = (e: React.PointerEvent): string | null =>
    (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-day]') as HTMLElement | null)?.dataset.day ?? null
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (narrow || e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    const key = dayAt(e)
    if (!key) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ from: key, to: key })
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const key = dayAt(e)
    if (key && key !== dragRef.current.to) setDrag({ ...dragRef.current, to: key })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
    const range = dayRangeDrag(dateFromKey(d.from), dateFromKey(d.to))
    onCreate(range.start, true, range.end)
  }
  const selected = drag ? dayRangeDrag(dateFromKey(drag.from), dateFromKey(drag.to)) : pending
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-border text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_SHORT.map(d => <span key={d} className="py-1">{narrow ? d[0] : d}</span>)}
      </div>
      <div
        className={cn('grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-y-auto', drag && 'cursor-crosshair select-none')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
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
              data-day={key}
              onClick={(e) => { if (narrow && e.target === e.currentTarget) onPickDay(day) }}
              className={cn(
                'flex min-h-[3.5rem] min-w-0 flex-col gap-0.5 border-b border-r border-border/60 p-0.5',
                !inMonth && 'bg-muted/20 text-muted-foreground/60',
                !narrow && 'cursor-cell',
                selected && day >= selected.start && day < selected.end && 'bg-primary/15 ring-1 ring-inset ring-primary',
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

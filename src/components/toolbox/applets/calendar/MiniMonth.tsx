import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dateFromKey, dateKey, formatMonth, monthGrid, sameDay, WEEKDAY_SHORT } from '@/lib/calendar/dates'
import { dayRangeDrag } from '@/lib/calendar/drag'
import type { Occurrence } from '@/lib/calendar/occurrences'
import { occurrenceColor } from './calendar-colors'

// A compact month: the sidebar navigator and the twelve tiles of the year
// view. `selection` is the span the main view shows ([start, end)); a drag
// or shift-click across days picks a span of its own. `marks` carries each
// day's entries so busy days are tinted with their calendars' colours.
export function MiniMonth({ month, selection, marks, onPick, onPickRange, onPrev, onNext, onTitle, onDayMenu, title, className }: {
  month: Date
  selection?: { start: Date; end: Date } | null
  marks?: Map<string, Occurrence[]>
  onPick: (day: Date) => void
  onPickRange?: (start: Date, end: Date) => void
  onPrev?: () => void
  onNext?: () => void
  onTitle?: () => void
  onDayMenu?: (e: React.MouseEvent, day: Date) => void
  title?: string
  className?: string
}) {
  const today = new Date()
  const days = monthGrid(month)
  const label = title ?? formatMonth(month)
  // Drag across days → span. Buttons carry data-day; the grid holds the
  // capture, like the month view.
  const [drag, setDrag] = useState<{ from: string; to: string } | null>(null)
  const dragRef = useRef(drag)
  useEffect(() => { dragRef.current = drag })
  // A finished span drag is followed by a click on the day under the pointer.
  const swallowClick = useRef(false)
  const dayAt = (e: React.PointerEvent): string | null =>
    (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-day]') as HTMLElement | null)?.dataset.day ?? null
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onPickRange || e.button !== 0) return
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
    if (d.from === d.to) return
    swallowClick.current = true
    setTimeout(() => { swallowClick.current = false }, 0)
    const range = dayRangeDrag(dateFromKey(d.from), dateFromKey(d.to))
    onPickRange?.(range.start, range.end)
  }
  const pick = (e: React.MouseEvent, day: Date) => {
    if (swallowClick.current) { swallowClick.current = false; return }
    if (e.shiftKey && onPickRange && selection) {
      const range = dayRangeDrag(selection.start, day)
      onPickRange(range.start, range.end)
    } else onPick(day)
  }
  const shown = drag ? dayRangeDrag(dateFromKey(drag.from), dateFromKey(drag.to)) : selection
  return (
    <div className={cn('select-none', className)}>
      <div className="mb-1 flex items-center justify-between">
        {onPrev ? (
          <button type="button" onClick={onPrev} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Previous month"><ChevronLeft className="h-3.5 w-3.5" /></button>
        ) : <span />}
        {onTitle ? (
          <button type="button" onClick={onTitle} className="text-xs font-semibold hover:underline">{label}</button>
        ) : <span className="text-xs font-semibold">{label}</span>}
        {onNext ? (
          <button type="button" onClick={onNext} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Next month"><ChevronRight className="h-3.5 w-3.5" /></button>
        ) : <span />}
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {WEEKDAY_SHORT.map(d => <span key={d}>{d[0]}</span>)}
      </div>
      <div
        className={cn('grid grid-cols-7 gap-y-px text-center text-[11px]', drag && 'cursor-crosshair')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        {days.map(day => {
          const key = dateKey(day)
          const inMonth = day.getMonth() === month.getMonth()
          const isToday = sameDay(day, today)
          const inRange = !!shown && day >= shown.start && day < shown.end
          const first = !!shown && inRange && sameDay(day, shown.start)
          const last = !!shown && inRange && sameDay(day, new Date(shown.end.getTime() - 1))
          const entries = marks?.get(key) ?? []
          const colors = [...new Set(entries.map(occurrenceColor))].slice(0, 3)
          return (
            <button
              key={key}
              type="button"
              data-day={key}
              onClick={(e) => pick(e, day)}
              onContextMenu={onDayMenu ? (e) => { e.preventDefault(); onDayMenu(e, day) } : undefined}
              aria-label={entries.length ? `${day.toDateString()}, ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : day.toDateString()}
              title={entries.length ? entries.slice(0, 6).map(o => o.title).join('\n') + (entries.length > 6 ? `\n+${entries.length - 6} more` : '') : undefined}
              className={cn(
                'relative mx-auto flex h-6 w-full items-center justify-center transition-colors hover:bg-muted',
                first && last ? 'rounded-full' : first ? 'rounded-l-full' : last ? 'rounded-r-full' : inRange ? '' : 'rounded-full',
                !inMonth && 'text-muted-foreground/40',
                isToday && !inRange && 'font-bold text-primary',
                inRange && 'bg-primary text-primary-foreground hover:bg-primary',
                entries.length > 0 && !inRange && 'font-semibold',
              )}
              style={entries.length && !inRange ? { background: `color-mix(in srgb, ${colors[0]} 22%, transparent)` } : undefined}
            >
              {day.getDate()}
              {entries.length > 0 && !inRange && (
                <span className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-px">
                  {colors.map(c => <span key={c} className="h-1 w-1 rounded-full" style={{ background: c }} />)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

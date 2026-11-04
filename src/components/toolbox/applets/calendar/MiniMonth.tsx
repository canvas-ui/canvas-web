import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dateKey, formatMonth, monthGrid, sameDay, WEEKDAY_SHORT } from '@/lib/calendar/dates'

// A compact month: the sidebar navigator and the twelve tiles of the year
// view. `marks` carries per-day entry counts for the density dot.
export function MiniMonth({ month, selected, marks, onPick, onPrev, onNext, onTitle, title, className }: {
  month: Date
  selected?: Date | null
  marks?: Map<string, number>
  onPick: (day: Date) => void
  onPrev?: () => void
  onNext?: () => void
  onTitle?: () => void
  title?: string
  className?: string
}) {
  const today = new Date()
  const days = monthGrid(month)
  const label = title ?? formatMonth(month)
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
      <div className="grid grid-cols-7 text-center text-[11px]">
        {days.map(day => {
          const key = dateKey(day)
          const inMonth = day.getMonth() === month.getMonth()
          const isToday = sameDay(day, today)
          const isSelected = !!selected && sameDay(day, selected)
          const count = marks?.get(key) ?? 0
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(day)}
              aria-label={day.toDateString()}
              className={cn(
                'relative mx-auto flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-muted',
                !inMonth && 'text-muted-foreground/40',
                isToday && !isSelected && 'font-bold text-primary',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              {day.getDate()}
              {count > 0 && !isSelected && (
                <span className={cn('absolute bottom-0.5 h-1 w-1 rounded-full', count > 2 ? 'bg-foreground' : 'bg-muted-foreground')} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

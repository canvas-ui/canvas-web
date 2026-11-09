import type { ButtonHTMLAttributes } from 'react'
import { Repeat, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/calendar/dates'
import type { Occurrence } from '@/lib/calendar/occurrences'
import { occurrenceColor, tint } from './calendar-colors'

// One entry in a month cell, the all-day lane or the schedule list. Pointer
// handlers from useDayDrag and the context-menu handler come in as plain
// button attributes.
export function EntryChip({ occurrence: o, selected, moving, showTime = true, onSelect, className, ...rest }: {
  occurrence: Occurrence
  selected?: boolean
  /** Being dragged to another day. */
  moving?: boolean
  showTime?: boolean
  onSelect: (o: Occurrence) => void
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onSelect' | 'className' | 'title' | 'type'>) {
  const color = occurrenceColor(o)
  const timed = !o.allDay && o.kind === 'event' && o.end.getTime() > o.start.getTime()
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(o) }}
      title={`${o.title}${o.calendar ? ` · ${o.calendar}` : ''}`}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 truncate rounded px-1 py-px text-left text-[11px] leading-4 text-foreground transition-colors hover:brightness-110',
        !o.recurring && 'touch-none',
        selected && 'ring-1 ring-ring',
        moving && 'cursor-grabbing ring-2 ring-primary shadow-elevation-2',
        o.done && 'line-through opacity-60',
        className,
      )}
      style={{ background: tint(color, o.allDay || o.kind === 'task' ? 28 : 14), borderLeft: `3px solid ${color}` }}
      {...rest}
    >
      {o.kind === 'task' && <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color }} />}
      {showTime && timed && <span className="shrink-0 tabular-nums text-muted-foreground">{formatTime(o.start)}</span>}
      <span className="truncate">{o.title}</span>
      {o.recurring && <Repeat className="ml-auto h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
    </button>
  )
}

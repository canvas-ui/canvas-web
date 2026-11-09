import { useMemo } from 'react'
import { dateKey } from '@/lib/calendar/dates'
import { groupByDay, type Occurrence } from '@/lib/calendar/occurrences'
import { MiniMonth } from './MiniMonth'
import type { CalendarMenuHandlers } from './CalendarMenu'

// Twelve months; days with entries are tinted with their calendars' colours
// and list their titles on hover. A day opens the day view, a dragged span
// opens those days, a month title opens the month.
export function YearView({ year, occurrences, onPickDay, onPickRange, onPickMonth, onSlotMenu }: {
  year: number
  occurrences: Occurrence[]
  onPickDay: (day: Date) => void
  onPickRange: (start: Date, end: Date) => void
  onPickMonth: (month: Date) => void
} & Pick<CalendarMenuHandlers, 'onSlotMenu'>) {
  const marks = useMemo(() => groupByDay(occurrences), [occurrences])
  const months = Array.from({ length: 12 }, (_, m) => new Date(year, m, 1))
  return (
    <div className="grid h-full min-h-0 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-4 gap-y-5 overflow-y-auto p-3">
      {months.map(month => (
        <MiniMonth
          key={dateKey(month)}
          month={month}
          marks={marks}
          title={month.toLocaleDateString(undefined, { month: 'long' })}
          onTitle={() => onPickMonth(month)}
          onPick={onPickDay}
          onPickRange={onPickRange}
          onDayMenu={(e, day) => onSlotMenu(e, day, true)}
        />
      ))}
    </div>
  )
}

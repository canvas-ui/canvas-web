import { useMemo } from 'react'
import { dateKey } from '@/lib/calendar/dates'
import { groupByDay, type Occurrence } from '@/lib/calendar/occurrences'
import { MiniMonth } from './MiniMonth'

// Twelve months with density dots; a day opens the day view, a month title
// opens the month.
export function YearView({ year, occurrences, onPickDay, onPickMonth }: {
  year: number
  occurrences: Occurrence[]
  onPickDay: (day: Date) => void
  onPickMonth: (month: Date) => void
}) {
  const marks = useMemo(() => {
    const out = new Map<string, number>()
    for (const [key, list] of groupByDay(occurrences)) out.set(key, list.length)
    return out
  }, [occurrences])
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
        />
      ))}
    </div>
  )
}

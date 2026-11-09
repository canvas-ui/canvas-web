// A moved or resized occurrence, as the document data that stores it. Tasks
// move their due date; all-day events keep the midnight-UTC convention with an
// exclusive end; timed events keep an open (null) end open.

import { dateKey } from './dates.ts'
import type { Occurrence } from './occurrences.ts'

export function movedData(data: Record<string, unknown>, o: Pick<Occurrence, 'kind' | 'allDay'>, start: Date, end: Date): Record<string, unknown> {
  if (o.kind === 'task') return { ...data, dueDate: start.toISOString() }
  if (o.allDay) return { ...data, start: `${dateKey(start)}T00:00:00.000Z`, end: `${dateKey(end)}T00:00:00.000Z` }
  const out: Record<string, unknown> = { ...data, start: start.toISOString() }
  if (data.end === null) return out
  if (end.getTime() > start.getTime()) out.end = end.toISOString()
  else delete out.end
  return out
}

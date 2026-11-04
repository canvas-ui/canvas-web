// From documents to what a calendar draws: one occurrence per visible
// instance of an event (series expanded), plus tasks on their due date.

import { addDays, DAY_MS, daysSpanned, minutesIntoDay, sameDay, startOfDay } from './dates.ts'
import { expandRRule, parseRRule } from './rrule.ts'

export interface CalendarDoc {
  id: number
  schema: string
  data?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface Occurrence {
  /** Stable per occurrence: `<docId>@<startMs>`. */
  key: string
  doc: CalendarDoc
  kind: 'event' | 'task'
  title: string
  start: Date
  /** Exclusive end; equals start + 0 for instants. */
  end: Date
  allDay: boolean
  /** Calendar name (`data.calendar`), '' for unfiled events, 'tasks' for tasks. */
  calendar: string
  recurring: boolean
  /** The rule could not be expanded — only the first occurrence is shown. */
  unsupportedRule: boolean
  done: boolean
}

export const TASKS_CALENDAR = 'tasks'
export const EVENT_SCHEMA_PREFIX = 'data/schema/event'
export const TASK_SCHEMA = 'data/schema/task'

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** All-day events are stored at midnight UTC; show them on that calendar day locally. */
function allDayLocal(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function isEventDoc(doc: CalendarDoc): boolean { return doc.schema.startsWith(EVENT_SCHEMA_PREFIX) }
export function isTaskDoc(doc: CalendarDoc): boolean { return doc.schema === TASK_SCHEMA }

/** Occurrences of one document that overlap [rangeStart, rangeEnd). */
export function occurrencesOf(doc: CalendarDoc, rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const data = doc.data ?? {}
  if (isTaskDoc(doc)) {
    const due = parseDate(data.dueDate)
    if (!due || due < rangeStart || due >= rangeEnd) return []
    const status = String(data.status ?? 'pending')
    return [{
      key: `${doc.id}@${due.getTime()}`, doc, kind: 'task', title: String(data.title ?? 'Untitled'),
      start: due, end: due, allDay: false, calendar: TASKS_CALENDAR, recurring: false, unsupportedRule: false,
      done: status === 'completed' || status === 'cancelled',
    }]
  }
  if (!isEventDoc(doc)) return []
  const rawStart = parseDate(data.start)
  if (!rawStart) return []
  const allDay = data.allDay === true
  const rawEnd = data.end === null ? null : parseDate(data.end)
  const start = allDay ? allDayLocal(rawStart) : rawStart
  // All-day end dates are exclusive in iCalendar (DTEND = next day); a
  // missing end is one day. An explicit null end is an ongoing interval —
  // drawn as a single all-day-style bar to the range end.
  const end = allDay
    ? (rawEnd ? allDayLocal(rawEnd) : addDays(start, 1))
    : rawEnd ?? (data.end === null ? rangeEnd : start)
  const durationMs = Math.max(0, end.getTime() - start.getTime())
  const base = {
    doc, kind: 'event' as const, title: String(data.title ?? 'Untitled'), allDay,
    calendar: typeof data.calendar === 'string' ? data.calendar : '', done: false,
  }
  const recurrence = typeof data.recurrence === 'string' ? data.recurrence : ''
  if (!recurrence) {
    if (end.getTime() <= rangeStart.getTime() && !(end.getTime() === start.getTime() && start >= rangeStart)) return []
    if (start >= rangeEnd) return []
    return [{ ...base, key: `${doc.id}@${start.getTime()}`, start, end, recurring: false, unsupportedRule: false }]
  }
  const rule = parseRRule(recurrence)
  if (!rule) {
    if (end <= rangeStart || start >= rangeEnd) return []
    return [{ ...base, key: `${doc.id}@${start.getTime()}`, start, end, recurring: true, unsupportedRule: true }]
  }
  return expandRRule(rule, start, rangeStart, rangeEnd, durationMs).map(s => ({
    ...base, key: `${doc.id}@${s.getTime()}`, start: s, end: new Date(s.getTime() + durationMs), recurring: true, unsupportedRule: false,
  }))
}

export function occurrencesIn(docs: CalendarDoc[], rangeStart: Date, rangeEnd: Date): Occurrence[] {
  return docs.flatMap(doc => occurrencesOf(doc, rangeStart, rangeEnd))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime() || a.title.localeCompare(b.title))
}

/** Bucket occurrences by the local days they cover (multi-day entries land on each day). */
export function groupByDay(occurrences: Occurrence[]): Map<string, Occurrence[]> {
  const out = new Map<string, Occurrence[]>()
  for (const o of occurrences) {
    for (const day of daysSpanned(o.start, o.end)) {
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      const list = out.get(key)
      if (list) list.push(o); else out.set(key, [o])
    }
  }
  return out
}

/** An entry drawn in the all-day lane: all-day events and anything spanning midnight. */
export function isAllDayLane(o: Occurrence): boolean {
  return o.allDay || (o.end.getTime() - o.start.getTime() >= DAY_MS) || !sameDay(o.start, new Date(o.end.getTime() - 1)) && o.end.getTime() > o.start.getTime()
}

export interface TimedBlock {
  occurrence: Occurrence
  /** Minutes from midnight. */
  top: number
  /** Minutes; at least 30 so a 15-minute entry stays clickable. */
  height: number
  /** Column index and column count among overlapping neighbours. */
  column: number
  columns: number
}

/**
 * Side-by-side layout of one day's timed entries: overlapping entries share
 * the width (classic Outlook/Google columns). Clusters are connected
 * components of overlap; inside a cluster each entry takes the first free
 * column.
 */
export function layoutDay(day: Date, occurrences: Occurrence[], minMinutes = 30): TimedBlock[] {
  const dayStart = startOfDay(day)
  const items = occurrences.filter(o => !isAllDayLane(o)).map(o => {
    const top = minutesIntoDay(o.start, dayStart)
    const height = Math.max(minMinutes, minutesIntoDay(o.end, dayStart) - top)
    return { occurrence: o, top, height: Math.min(height, 1440 - top), column: 0, columns: 1 }
  }).sort((a, b) => a.top - b.top || b.height - a.height)

  let cluster: TimedBlock[] = []
  let clusterEnd = -1
  const finish = () => {
    const columnEnds: number[] = []
    for (const block of cluster) {
      let col = columnEnds.findIndex(end => end <= block.top)
      if (col < 0) { col = columnEnds.length; columnEnds.push(0) }
      columnEnds[col] = block.top + block.height
      block.column = col
    }
    for (const block of cluster) block.columns = columnEnds.length
    cluster = []
  }
  for (const block of items) {
    if (cluster.length && block.top >= clusterEnd) finish()
    cluster.push(block)
    clusterEnd = Math.max(clusterEnd, block.top + block.height)
  }
  if (cluster.length) finish()
  return items
}

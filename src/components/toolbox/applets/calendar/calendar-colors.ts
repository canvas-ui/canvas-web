import { timelineColor } from '@/lib/timeline-meta'
import { TASKS_CALENDAR, type Occurrence } from '@/lib/calendar/occurrences'

// One colour per calendar, the same one the toolbox timeline rail uses for
// the calendar's timeline — so "Work is teal" holds across the whole UI.
// Unfiled events take the `events` timeline's colour.
export function calendarColor(name: string): string {
  return timelineColor(name ? name.toLowerCase() : 'events')
}

export function occurrenceColor(o: Occurrence): string {
  return o.kind === 'task' ? timelineColor(TASKS_CALENDAR) : calendarColor(o.calendar)
}

/** Translucent fill behind an entry; readable on light and dark surfaces. */
export function tint(color: string, percent = 18): string {
  return `color-mix(in oklch, ${color} ${percent}%, transparent)`
}

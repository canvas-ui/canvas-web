// Pointer-drag selection → the draft it creates. Pure so the grids share one
// rule set: a vertical drag inside one day column selects a time range; a
// drag that crosses day columns (or runs over month cells) selects whole days.

import { addDays, startOfDay } from './dates.ts'

export interface DragRange {
  start: Date
  end: Date
  allDay: boolean
}

/** Time-grid drag: day indexes into `days`, minutes from midnight at both ends. */
export function timeGridDrag(days: Date[], fromDay: number, fromMin: number, toDay: number, toMin: number, snap = 30): DragRange {
  const a = Math.max(0, Math.min(days.length - 1, fromDay))
  const b = Math.max(0, Math.min(days.length - 1, toDay))
  if (a !== b) {
    const [lo, hi] = a < b ? [a, b] : [b, a]
    return { start: startOfDay(days[lo]), end: addDays(startOfDay(days[hi]), 1), allDay: true }
  }
  const floor = (m: number) => Math.floor(m / snap) * snap
  let lo = floor(Math.min(fromMin, toMin))
  let hi = floor(Math.max(fromMin, toMin)) + snap
  lo = Math.max(0, Math.min(1440 - snap, lo))
  hi = Math.max(lo + snap, Math.min(1440, hi))
  const day = startOfDay(days[a])
  return { start: new Date(day.getTime() + lo * 60_000), end: new Date(day.getTime() + hi * 60_000), allDay: false }
}

/** Month-grid drag between two days (either order) → inclusive day span. */
export function dayRangeDrag(from: Date, to: Date): DragRange {
  const [lo, hi] = from.getTime() <= to.getTime() ? [from, to] : [to, from]
  return { start: startOfDay(lo), end: addDays(startOfDay(hi), 1), allDay: true }
}

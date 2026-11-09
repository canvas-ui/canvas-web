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

interface Span { start: Date; end: Date }

/**
 * Timed entry dragged from (fromDay, fromMin) to (toDay, toMin) in the time
 * grid: same duration, start snapped, kept inside its day.
 */
export function moveTimed(days: Date[], o: Span, fromDay: number, fromMin: number, toDay: number, toMin: number, snap = 15): Span {
  const clampDay = (d: number) => Math.max(0, Math.min(days.length - 1, d))
  const deltaDays = clampDay(toDay) - clampDay(fromDay)
  const deltaMin = Math.round((toMin - fromMin) / snap) * snap
  const duration = o.end.getTime() - o.start.getTime()
  const moved = addDays(o.start, deltaDays)
  const day = startOfDay(moved)
  const minute = Math.max(0, Math.min(1440 - snap, (moved.getTime() - day.getTime()) / 60_000 + deltaMin))
  const start = new Date(day.getTime() + minute * 60_000)
  return { start, end: new Date(start.getTime() + duration) }
}

/** Bottom edge of a timed entry dragged to (toDay, toMin): the end snaps up, never before start + snap. */
export function resizeTimed(days: Date[], o: Span, toDay: number, toMin: number, snap = 15): Span {
  const day = startOfDay(days[Math.max(0, Math.min(days.length - 1, toDay))])
  const minute = Math.min(1440, Math.ceil(toMin / snap) * snap)
  const end = new Date(day.getTime() + minute * 60_000)
  return { start: o.start, end: end.getTime() < o.start.getTime() + snap * 60_000 ? new Date(o.start.getTime() + snap * 60_000) : end }
}

/** Entry dropped on another day: same wall time, shifted by whole days. */
export function moveByDays(o: Span, deltaDays: number): Span {
  return { start: addDays(o.start, deltaDays), end: addDays(o.end, deltaDays) }
}

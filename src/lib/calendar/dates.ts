// Local wall-clock date arithmetic for the calendar views. Everything here
// works on the viewer's timezone (what a calendar grid shows) and never on UTC
// fields; `Date` values are instants, `dateKey` strings are local days.

export const DAY_MS = 86_400_000
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function pad(n: number): string { return String(n).padStart(2, '0') }

/** `YYYY-MM-DD` of the local day the instant falls on. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local midnight of a `YYYY-MM-DD` key. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** `YYYY-MM-DDTHH:mm` local wall clock (the DateTimePicker's value shape). */
export function localInput(d: Date): string {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

/** Monday-based week start (ISO), local midnight. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d)
  return addDays(day, -((day.getDay() + 6) % 7))
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Days of a month view: 6 ISO weeks starting the Monday on or before the 1st. */
export function monthGrid(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month))
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

/** Local days covered by [start, end) — an interval ending at midnight stays on its last day. */
export function daysSpanned(start: Date, end: Date): Date[] {
  const out: Date[] = []
  const last = end.getTime() > start.getTime() ? new Date(end.getTime() - 1) : start
  for (let d = startOfDay(start); d.getTime() <= last.getTime(); d = addDays(d, 1)) out.push(d)
  return out
}

/** Minutes since local midnight, clamped to the day. */
export function minutesIntoDay(d: Date, day: Date): number {
  const ms = d.getTime() - startOfDay(day).getTime()
  return Math.max(0, Math.min(DAY_MS, ms)) / 60_000
}

const monthLong = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' })
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const dayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const timeShort = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function formatMonth(d: Date): string { return monthLong.format(d) }
export function formatMonthShort(d: Date): string { return monthShort.format(d) }
export function formatDayLong(d: Date): string { return dayLong.format(d) }
export function formatDayShort(d: Date): string { return dayShort.format(d) }
export function formatTime(d: Date): string { return timeShort.format(d) }

/** "3 – 9 Nov 2026" / "30 Nov – 6 Dec 2026" / "29 Dec 2025 – 4 Jan 2026". */
export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const s = weekStart, e = end
  if (s.getFullYear() !== e.getFullYear()) return `${s.getDate()} ${monthShort.format(s)} ${s.getFullYear()} – ${e.getDate()} ${monthShort.format(e)} ${e.getFullYear()}`
  if (s.getMonth() !== e.getMonth()) return `${s.getDate()} ${monthShort.format(s)} – ${e.getDate()} ${monthShort.format(e)} ${e.getFullYear()}`
  return `${s.getDate()} – ${e.getDate()} ${monthShort.format(s)} ${s.getFullYear()}`
}

/** Hour label for the time grid gutter ("9 AM" / "09:00" by locale). */
export function formatHour(hour: number): string {
  return timeShort.format(new Date(2000, 0, 1, hour, 0)).replace(/:00(?=\s|$)/, '')
}

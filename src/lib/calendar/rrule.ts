// RFC 5545 RRULE expansion for display. synapsd expands the same rules into
// timeline positions so a range query returns the right documents; the client
// still has to turn one document into the occurrences that fall inside the
// visible range (exactly what a CalDAV client does with VEVENT+RRULE).
//
// Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL, BYDAY
// (weekly days; monthly/yearly ordinal days such as 1MO or -1FR), BYMONTHDAY,
// BYMONTH. Stepping is on LOCAL wall-clock fields so a 09:00 weekly meeting
// stays at 09:00 across a DST change, the way the source calendar shows it.
// Anything else is reported as unsupported and the caller shows the first
// occurrence only.

import { DAY_MS } from './dates.ts'

export interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count: number | null
  until: Date | null
  /** Weekday indexes (0 = Sunday) with an optional ordinal (1MO → { day: 1, ordinal: 1 }). */
  byDay: Array<{ day: number; ordinal: number | null }>
  byMonthDay: number[]
  byMonth: number[]
}

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
const KNOWN = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST'])

/** Parse an RRULE value (the part after `RRULE:`); null when unsupported. */
export function parseRRule(value: string): RRule | null {
  const parts: Record<string, string> = {}
  for (const kv of value.replace(/^RRULE:/i, '').split(';')) {
    const trimmed = kv.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) return null
    parts[trimmed.slice(0, eq).toUpperCase()] = trimmed.slice(eq + 1).toUpperCase()
  }
  if (Object.keys(parts).some(k => !KNOWN.has(k))) return null
  const freq = parts.FREQ
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1
  if (!Number.isInteger(interval) || interval < 1) return null
  const count = parts.COUNT ? Number(parts.COUNT) : null
  if (count !== null && (!Number.isInteger(count) || count < 1)) return null

  let until: Date | null = null
  if (parts.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(parts.UNTIL)
    if (!m) return null
    const [, y, mo, d, h, mi, s, z] = m
    // A date-only UNTIL is inclusive of that whole local day.
    until = h === undefined
      ? new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59, 999)
      : z ? new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)))
        : new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
    if (Number.isNaN(until.getTime())) return null
  }

  const byDay: RRule['byDay'] = []
  if (parts.BYDAY) {
    for (const token of parts.BYDAY.split(',')) {
      const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token.trim())
      if (!m) return null
      byDay.push({ day: WEEKDAYS[m[2]], ordinal: m[1] ? Number(m[1]) : null })
    }
  }
  const byMonthDay = parts.BYMONTHDAY ? parts.BYMONTHDAY.split(',').map(Number) : []
  if (byMonthDay.some(n => !Number.isInteger(n) || n === 0 || n < -31 || n > 31)) return null
  const byMonth = parts.BYMONTH ? parts.BYMONTH.split(',').map(Number) : []
  if (byMonth.some(n => !Number.isInteger(n) || n < 1 || n > 12)) return null

  // Ordinal weekdays only make sense inside a month or year.
  if (byDay.some(d => d.ordinal !== null) && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  return { freq, interval, count, until, byDay, byMonthDay, byMonth }
}

function withTime(day: Date, ref: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), ref.getHours(), ref.getMinutes(), ref.getSeconds(), ref.getMilliseconds())
}

function daysInMonth(y: number, m: number): number { return new Date(y, m + 1, 0).getDate() }

/** Candidate days inside one month (sorted), for MONTHLY/YEARLY rules with BY* parts. */
function monthCandidates(y: number, m: number, rule: RRule, dtstart: Date): Date[] {
  const n = daysInMonth(y, m)
  const days = new Set<number>()
  if (rule.byMonthDay.length) {
    for (const md of rule.byMonthDay) {
      const day = md > 0 ? md : n + 1 + md
      if (day >= 1 && day <= n) days.add(day)
    }
  }
  if (rule.byDay.length) {
    const matches = new Set<number>()
    for (const { day, ordinal } of rule.byDay) {
      const hits: number[] = []
      for (let d = 1; d <= n; d++) if (new Date(y, m, d).getDay() === day) hits.push(d)
      if (ordinal === null) hits.forEach(d => matches.add(d))
      else {
        const pick = ordinal > 0 ? hits[ordinal - 1] : hits[hits.length + ordinal]
        if (pick) matches.add(pick)
      }
    }
    if (rule.byMonthDay.length) {
      // Both set: intersection, per RFC 5545 (BYMONTHDAY limits BYDAY).
      for (const d of [...days]) if (!matches.has(d)) days.delete(d)
    } else matches.forEach(d => days.add(d))
  }
  if (!rule.byMonthDay.length && !rule.byDay.length) {
    // Plain monthly/yearly: DTSTART's day-of-month; months without it are skipped.
    if (dtstart.getDate() <= n) days.add(dtstart.getDate())
  }
  return [...days].sort((a, b) => a - b).map(d => withTime(new Date(y, m, d), dtstart))
}

/**
 * Occurrence start instants of `rule` anchored at `dtstart`, within
 * [rangeStart, rangeEnd). `durationMs` widens the search so an occurrence that
 * started before the range but still overlaps it is included. Bounded by
 * `cap` occurrences scanned so a runaway rule cannot hang the view.
 */
export function expandRRule(rule: RRule, dtstart: Date, rangeStart: Date, rangeEnd: Date, durationMs = 0, cap = 5000): Date[] {
  const out: Date[] = []
  const lo = rangeStart.getTime() - Math.max(0, durationMs)
  const hi = rangeEnd.getTime()
  let produced = 0
  // DTSTART is always the first occurrence per RFC 5545, even off-pattern.
  const consider = (d: Date): boolean => {
    const t = d.getTime()
    if (rule.until && t > rule.until.getTime()) return false
    produced++
    if (t >= lo && t < hi) out.push(d)
    if (rule.count !== null && produced >= rule.count) return false
    return produced < cap
  }
  if (!consider(dtstart)) return out
  const startT = dtstart.getTime()

  if (rule.freq === 'DAILY') {
    for (let i = rule.interval, scanned = 0; scanned < cap * 12; i += rule.interval, scanned++) {
      const d = withTime(new Date(dtstart.getFullYear(), dtstart.getMonth(), dtstart.getDate() + i), dtstart)
      if (d.getTime() >= hi && rule.count === null) break
      if (rule.byMonth.length && !rule.byMonth.includes(d.getMonth() + 1)) continue
      if (!consider(d)) break
    }
    return out
  }

  if (rule.freq === 'WEEKLY') {
    const days = rule.byDay.length ? [...new Set(rule.byDay.map(d => d.day))] : [dtstart.getDay()]
    // Walk week by week from DTSTART's ISO week; within a week emit matching days in order.
    const weekStart = new Date(dtstart.getFullYear(), dtstart.getMonth(), dtstart.getDate() - ((dtstart.getDay() + 6) % 7))
    for (let w = 0; ; w += rule.interval) {
      const base = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + w * 7)
      if (base.getTime() >= hi + 7 * DAY_MS && rule.count === null) break
      let stop = false
      for (let i = 0; i < 7; i++) {
        const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
        if (!days.includes(day.getDay())) continue
        const d = withTime(day, dtstart)
        if (d.getTime() <= startT) continue
        if (!consider(d)) { stop = true; break }
      }
      if (stop) break
    }
    return out
  }

  // MONTHLY / YEARLY: enumerate months, then the candidate days inside each.
  const monthStep = rule.freq === 'MONTHLY' ? rule.interval : 12 * rule.interval
  for (let i = 0; ; i += monthStep) {
    const y = dtstart.getFullYear() + Math.floor((dtstart.getMonth() + i) / 12)
    const m = (dtstart.getMonth() + i) % 12
    const monthStartT = new Date(y, m, 1).getTime()
    if (monthStartT >= hi && rule.count === null) break
    if (rule.freq === 'YEARLY' && rule.byMonth.length && !rule.byMonth.includes(m + 1)) {
      // Yearly rules with BYMONTH visit every listed month of the year.
      let stop = false
      for (const bm of rule.byMonth) {
        for (const d of monthCandidates(y, bm - 1, rule, dtstart)) {
          if (d.getTime() <= startT) continue
          if (!consider(d)) { stop = true; break }
        }
        if (stop) break
      }
      if (stop) break
      continue
    }
    if (rule.freq === 'MONTHLY' && rule.byMonth.length && !rule.byMonth.includes(m + 1)) continue
    let stop = false
    for (const d of monthCandidates(y, m, rule, dtstart)) {
      if (d.getTime() <= startT) continue
      if (!consider(d)) { stop = true; break }
    }
    if (stop) break
    if (i > 12 * 400) break // four centuries is past any calendar's horizon
  }
  return out
}

/** Human summary for the event panel ("Every 2 weeks on Tue, Thu until 31 Dec 2026"). */
export function describeRRule(rule: RRule): string {
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[rule.freq]
  let text = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (rule.byDay.length) {
    text += ' on ' + rule.byDay.map(({ day, ordinal }) => ordinal === null ? names[day] : `${ordinal === -1 ? 'last' : `${ordinal}.`} ${names[day]}`).join(', ')
  } else if (rule.byMonthDay.length) {
    text += ' on day ' + rule.byMonthDay.join(', ')
  }
  if (rule.count !== null) text += `, ${rule.count} times`
  if (rule.until) text += ` until ${rule.until.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
  return text
}

/**
 * The preset the UI's "Repeat" select shows for a rule, or 'custom'. The
 * rule's end (COUNT/UNTIL) is a separate control, so it never forces custom.
 */
export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom'

export interface RecurrenceEnd {
  /** Last day, `YYYY-MM-DD` local, or ''. */
  until: string
  /** Number of occurrences, or null. */
  count: number | null
}

export function repeatPreset(recurrence: string | undefined): RepeatPreset {
  if (!recurrence) return 'none'
  const rule = parseRRule(recurrence)
  if (!rule || rule.interval !== 1 || rule.byMonthDay.length || rule.byMonth.length) return 'custom'
  if (rule.freq === 'WEEKLY' && rule.byDay.length === 5 && rule.byDay.every(d => d.ordinal === null && d.day >= 1 && d.day <= 5)) return 'weekdays'
  if (rule.byDay.length) return 'custom'
  return { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[rule.freq] as RepeatPreset
}

export function presetRRule(preset: RepeatPreset, end?: RecurrenceEnd): string | undefined {
  const base = {
    daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY',
    weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  }[preset as Exclude<RepeatPreset, 'none' | 'custom'>]
  if (!base) return undefined
  if (end?.until) return `${base};UNTIL=${end.until.replace(/-/g, '')}`
  if (end?.count) return `${base};COUNT=${end.count}`
  return base
}

/** The end a stored rule carries, for the "Ends" control. */
export function recurrenceEnd(recurrence: string | undefined): RecurrenceEnd {
  const rule = recurrence ? parseRRule(recurrence) : null
  if (!rule) return { until: '', count: null }
  const u = rule.until
  const pad = (n: number) => String(n).padStart(2, '0')
  return { until: u ? `${u.getFullYear()}-${pad(u.getMonth() + 1)}-${pad(u.getDate())}` : '', count: rule.count }
}

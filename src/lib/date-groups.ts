// Windows-Explorer-style date grouping for document lists.
//
// A folder with 4 000 items in it (Downloads, an inbox, a camera roll) is
// unreadable as one flat run of tiles, no matter how it is sorted. Explorer
// solves this by cutting the sorted list into relative-time bands — Today,
// Yesterday, Earlier this week, … — so "the thing I saved this morning" is
// two lines down instead of somewhere in the first screenful. We do the same.
//
// Two properties matter and are both deliberate:
//
//   * Grouping never reorders. Buckets are emitted newest-first (or oldest-
//     first when the view is ascending), and WITHIN a bucket documents keep
//     exactly the order they arrived in — which is the server's timeline sort,
//     or fuse's relevance order while searching. The bands are cuts, not a
//     second sort.
//   * Bucketing is by absolute calendar boundaries in the viewer's local
//     timezone, not by elapsed hours: something saved at 23:50 is still
//     "Yesterday" at 00:10, the way a person means it.

export interface DateGroup<T> {
  // Stable across re-renders for the same band (collapse state keys off it).
  key: string
  label: string
  rank: number
  items: T[]
}

// Explorer's bands, most recent first. Ranks are the tier scaled by a decade
// so a past-year bucket can carry its year as a tiebreak (tier 1 + 2025) and
// still sort below every relative band.
const TIER = {
  today: 8,
  yesterday: 7,
  thisWeek: 6,
  lastWeek: 5,
  thisMonth: 4,
  lastMonth: 3,
  thisYear: 2,
  year: 1,
  unknown: 0,
} as const

const rank = (tier: number) => tier * 1_000_000

// Locale first-day-of-week, so "Earlier this week" cuts where the viewer's
// calendar cuts (Sunday in the US, Monday across most of Europe). weekInfo is
// Chromium/Safari-only; Monday is the ISO fallback.
function firstDayOfWeek(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & { weekInfo?: { firstDay?: number }; getWeekInfo?: () => { firstDay?: number } }
    const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo
    const first = info?.firstDay
    // weekInfo speaks ISO days (1 = Monday … 7 = Sunday).
    if (typeof first === 'number' && first >= 1 && first <= 7) return first
  } catch { /* ignore — not every engine ships weekInfo */ }
  return 1
}

// Local midnight of the day `date` falls in.
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfWeek(date: Date, first: number): Date {
  const day = date.getDay() === 0 ? 7 : date.getDay() // JS Sunday=0 → ISO 7
  const back = (day - first + 7) % 7
  const d = startOfDay(date)
  d.setDate(d.getDate() - back)
  return d
}

const DAY = 86_400_000

export interface DateBucket {
  key: string
  label: string
  rank: number
}

// Boundaries derived once per grouping pass rather than per document — this
// runs over every row of a large folder on each render of the list.
function boundaries(now: Date) {
  const first = firstDayOfWeek()
  const today = startOfDay(now)
  const weekStart = startOfWeek(now, first)
  return {
    today: today.getTime(),
    yesterday: today.getTime() - DAY,
    weekStart: weekStart.getTime(),
    lastWeekStart: weekStart.getTime() - 7 * DAY,
    year: now.getFullYear(),
    // Absolute month index, so December → January crosses the year cleanly.
    month: now.getFullYear() * 12 + now.getMonth(),
  }
}

export function dateBucket(timestamp: number | null, bounds: ReturnType<typeof boundaries>): DateBucket {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return { key: 'unknown', label: 'Unknown date', rank: rank(TIER.unknown) }
  }
  if (timestamp >= bounds.today) return { key: 'today', label: 'Today', rank: rank(TIER.today) }
  if (timestamp >= bounds.yesterday) return { key: 'yesterday', label: 'Yesterday', rank: rank(TIER.yesterday) }
  if (timestamp >= bounds.weekStart) return { key: 'this-week', label: 'Earlier this week', rank: rank(TIER.thisWeek) }
  if (timestamp >= bounds.lastWeekStart) return { key: 'last-week', label: 'Last week', rank: rank(TIER.lastWeek) }

  const date = new Date(timestamp)
  const month = date.getFullYear() * 12 + date.getMonth()
  if (month === bounds.month) return { key: 'this-month', label: 'Earlier this month', rank: rank(TIER.thisMonth) }
  if (month === bounds.month - 1) return { key: 'last-month', label: 'Last month', rank: rank(TIER.lastMonth) }
  if (date.getFullYear() === bounds.year) return { key: 'this-year', label: 'Earlier this year', rank: rank(TIER.thisYear) }

  // Older than the current year: one band per year. Explorer collapses these
  // into "A long time ago", which is useless in an archive you actually browse.
  const year = date.getFullYear()
  return { key: `year-${year}`, label: String(year), rank: rank(TIER.year) + year }
}

/**
 * Cut `items` into relative-time bands. `dateOf` returns the millisecond
 * timestamp the view is ordered by (created or updated); return null for
 * documents that carry no usable date — they collect in a trailing
 * "Unknown date" band instead of silently landing in "Today".
 *
 * `order` mirrors the view's sort direction: 'desc' puts Today first.
 * `now` is injectable for tests.
 */
export function groupByDate<T>(
  items: T[],
  dateOf: (item: T) => number | null,
  order: 'asc' | 'desc' = 'desc',
  now: Date = new Date(),
): DateGroup<T>[] {
  const bounds = boundaries(now)
  const groups = new Map<string, DateGroup<T>>()
  for (const item of items) {
    const bucket = dateBucket(dateOf(item), bounds)
    const existing = groups.get(bucket.key)
    if (existing) existing.items.push(item)
    else groups.set(bucket.key, { ...bucket, items: [item] })
  }
  const sorted = [...groups.values()].sort((a, b) => order === 'asc' ? a.rank - b.rank : b.rank - a.rank)
  // "Unknown date" is a leftovers bin, not the oldest band — keep it last in
  // both directions rather than heading an ascending list.
  const unknown = sorted.filter(g => g.key === 'unknown')
  return unknown.length ? [...sorted.filter(g => g.key !== 'unknown'), ...unknown] : sorted
}

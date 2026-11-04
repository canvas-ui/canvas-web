// Per-device calendar preferences: which view is open, which calendars are
// hidden, whether tasks show, the calendar new events default to. Keyed by
// workspace so two workspaces' calendar sets never share a hidden list.

export type CalendarView = 'day' | 'week' | 'month' | 'year' | 'schedule'
export const CALENDAR_VIEWS: Array<{ id: CalendarView; label: string; key: string }> = [
  { id: 'day', label: 'Day', key: 'd' },
  { id: 'week', label: 'Week', key: 'w' },
  { id: 'month', label: 'Month', key: 'm' },
  { id: 'year', label: 'Year', key: 'y' },
  { id: 'schedule', label: 'Schedule', key: 's' },
]

export interface CalendarPrefs {
  view: CalendarView
  hidden: string[]
  showTasks: boolean
  defaultCalendar: string
}

export const DEFAULT_PREFS: CalendarPrefs = { view: 'week', hidden: [], showTasks: true, defaultCalendar: 'Personal' }

const KEY = 'canvas:calendar:prefs'

function key(workspace: string | null): string { return `${KEY}:${workspace ?? 'global'}` }

export function readPrefs(workspace: string | null): CalendarPrefs {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key(workspace)) || 'null')
    if (!saved || typeof saved !== 'object') return DEFAULT_PREFS
    const p = saved as Partial<CalendarPrefs>
    return {
      view: CALENDAR_VIEWS.some(v => v.id === p.view) ? (p.view as CalendarView) : DEFAULT_PREFS.view,
      hidden: Array.isArray(p.hidden) ? p.hidden.filter((x): x is string => typeof x === 'string') : [],
      showTasks: p.showTasks !== false,
      defaultCalendar: typeof p.defaultCalendar === 'string' && p.defaultCalendar.trim() ? p.defaultCalendar : DEFAULT_PREFS.defaultCalendar,
    }
  } catch { return DEFAULT_PREFS }
}

export function writePrefs(workspace: string | null, prefs: CalendarPrefs): void {
  try { localStorage.setItem(key(workspace), JSON.stringify(prefs)) } catch { /* private mode: prefs are a convenience */ }
}

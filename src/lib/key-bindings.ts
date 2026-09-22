export type TreeAction = 'previousTree' | 'nextTree'
export type KeyBindings = Record<TreeAction, string>
export const DEFAULT_KEY_BINDINGS: KeyBindings = { previousTree: 'Alt+Q', nextTree: 'Alt+W' }
const STORAGE_KEY = 'canvas:key-bindings'
const VALID = /^(Alt|Alt\+Shift|Ctrl\+Shift|Meta\+Shift)\+[A-Z]$/

export function readKeyBindings(): KeyBindings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const result = { ...DEFAULT_KEY_BINDINGS }
    for (const action of Object.keys(result) as TreeAction[]) {
      if (saved[action] === '' || VALID.test(saved[action])) result[action] = saved[action]
    }
    if (result.previousTree && result.previousTree === result.nextTree) return { ...DEFAULT_KEY_BINDINGS }
    return result
  } catch { return { ...DEFAULT_KEY_BINDINGS } }
}

export function saveKeyBindings(bindings: KeyBindings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
}

export function shortcutForEvent(event: Pick<KeyboardEvent, 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): string {
  if (!/^Key[A-Z]$/.test(event.code)) return ''
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.metaKey && 'Meta', event.shiftKey && 'Shift', event.code.slice(3)].filter(Boolean).join('+')
}

export function cycleTree<T>(order: readonly T[], current: T, direction: number): T {
  return order[(Math.max(0, order.indexOf(current)) + direction + order.length) % order.length]
}

export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  return Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx < 0 ? 1 : -1) : 0
}

import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ActionItem } from './types'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const KEY_LABELS: Record<string, string> = {
  Delete: 'Del', Backspace: '⌫', Enter: '↵', ArrowUp: '↑', ArrowDown: '↓',
}

/** `Mod+Shift+Delete` → `⇧⌘Del` on macOS, `Ctrl+Shift+Del` elsewhere. */
export function formatShortcut(shortcut: string): string {
  const parts = shortcut.split('+')
  const key = parts.pop() || ''
  const keyLabel = KEY_LABELS[key] || (key.length === 1 ? key.toUpperCase() : key)
  if (IS_MAC) {
    const mac: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃' }
    return [...['Ctrl', 'Alt', 'Shift', 'Mod'].filter(m => parts.includes(m)).map(m => mac[m]), keyLabel].join('')
  }
  return [...parts.map(m => (m === 'Mod' ? 'Ctrl' : m)), keyLabel].join('+')
}

/** Does a keydown match `Mod+Shift+K`? Modifiers must match exactly. */
export function matchesShortcut(event: KeyboardEvent | ReactKeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+')
  const key = parts.pop() || ''
  const mod = IS_MAC ? event.metaKey : event.ctrlKey
  if (mod !== parts.includes('Mod')) return false
  if (event.shiftKey !== parts.includes('Shift')) return false
  if (event.altKey !== parts.includes('Alt')) return false
  // Ctrl on macOS is its own modifier; elsewhere it IS Mod (checked above).
  if (IS_MAC && event.ctrlKey !== parts.includes('Ctrl')) return false
  return key.length === 1 ? event.key.toLowerCase() === key.toLowerCase() : event.key === key
}

/** Typing in a field, or a text selection the user may be copying. */
export function isTextInteraction(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (el?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return true
  const selection = typeof window !== 'undefined' ? window.getSelection() : null
  return !!selection && !selection.isCollapsed && selection.toString().length > 0
}

/**
 * Run the first enabled action whose shortcut matches. Meant for a container's
 * onKeyDown, so shortcuts are scoped to the focused surface (two panes of the
 * same list never both react). Returns true when an action ran.
 */
export function dispatchActionShortcut(event: ReactKeyboardEvent, actions: ActionItem[]): boolean {
  if (event.defaultPrevented || event.nativeEvent.isComposing || isTextInteraction(event.target)) return false
  const action = actions.find(a => a.shortcut && !a.disabled && matchesShortcut(event, a.shortcut))
  if (!action) return false
  event.preventDefault()
  event.stopPropagation()
  void action.run()
  return true
}

/** Shift+F10 and the dedicated Menu key — the keyboard's right-click. */
export function isMenuKey(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

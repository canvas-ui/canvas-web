import type { ComponentType } from 'react'

/**
 * One action, described once and rendered everywhere it is offered: the
 * right-click menu, the "⋯" toolbar/row button, the phone action sheet and the
 * keyboard shortcuts. Surfaces never hand-write their own item list — they
 * call the same builder, so they cannot drift apart.
 */
export interface ActionItem {
  id: string
  label: string
  icon?: ComponentType<{ className?: string }>
  // Items with different groups are separated by a rule; consecutive items
  // with the same group sit together. Order is the array order.
  group?: string
  // Optional small heading rendered above the first item of a group.
  groupLabel?: string
  // Shortcut in `Mod+Shift+K` form (Mod = ⌘ on macOS, Ctrl elsewhere). Shown
  // in the menu, and fired by useActionShortcuts.
  shortcut?: string
  destructive?: boolean
  disabled?: boolean
  // Tooltip — why an item does what it does, or why it is disabled.
  hint?: string
  run: () => void | Promise<void>
}

export type ActionAnchor = { x: number; y: number }

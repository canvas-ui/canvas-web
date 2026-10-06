import { Fragment, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ContextMenuShell } from '@/components/common/context-menu-shell'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { cn } from '@/lib/utils'
import { formatShortcut } from './shortcuts'
import { prefersActionSheet } from './anchor'
import type { ActionAnchor, ActionItem } from './types'

// Pairs consecutive items into groups so both renderers draw the same rules.
function grouped(items: ActionItem[]): ActionItem[][] {
  const groups: ActionItem[][] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && (last[0].group ?? '') === (item.group ?? '')) last.push(item)
    else groups.push([item])
  }
  return groups
}

// Runs the action after the menu is gone, so an action that opens a dialog
// does not get its focus stolen back by the menu's focus restore.
function runAfterClose(item: ActionItem, onClose: () => void) {
  onClose()
  setTimeout(() => { void item.run() }, 0)
}

/**
 * Coordinate-positioned menu (right-click, Shift+F10, "⋯" buttons). Full
 * keyboard model of a native menu: focus lands on the first item, ↑/↓ wrap,
 * Home/End, first-letter type-ahead, Enter/Space run, Esc/Tab close, and
 * focus returns to whatever had it before the menu opened.
 */
export function ActionMenu({ anchor, items, onClose, label }: {
  anchor: ActionAnchor
  items: ActionItem[]
  onClose: () => void
  label?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus()
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    const nodes = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])
    if (nodes.length === 0) return
    const index = nodes.indexOf(document.activeElement as HTMLElement)
    const focus = (i: number) => nodes[(i + nodes.length) % nodes.length]?.focus()
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); focus(index + 1); return
      case 'ArrowUp': event.preventDefault(); focus(index < 0 ? -1 : index - 1); return
      case 'Home': event.preventDefault(); focus(0); return
      case 'End': event.preventDefault(); focus(-1); return
      case 'Tab': event.preventDefault(); onClose(); return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const ch = event.key.toLowerCase()
      const order = [...nodes.slice(index + 1), ...nodes.slice(0, index + 1)]
      const hit = order.find(node => node.textContent?.trim().toLowerCase().startsWith(ch))
      if (hit) { event.preventDefault(); hit.focus() }
    }
  }

  return (
    <ContextMenuShell
      x={anchor.x}
      y={anchor.y}
      onClose={onClose}
      className="min-w-[200px] rounded-lg border bg-background py-1 shadow-elevation-3"
    >
      <div ref={listRef} role="menu" aria-label={label} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
        {grouped(items).map((group, gi) => (
          <Fragment key={`${group[0].group ?? ''}:${gi}`}>
            {gi > 0 && <div role="separator" className="my-1 h-px bg-border" />}
            {group[0].groupLabel && (
              <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{group[0].groupLabel}</div>
            )}
            {group.map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled || undefined}
                  title={item.hint}
                  onClick={() => { if (!item.disabled) runAfterClose(item, onClose) }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none',
                    item.disabled ? 'cursor-default opacity-50' : item.destructive
                      ? 'text-destructive hover:bg-destructive hover:text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground'
                      : 'hover:bg-muted focus:bg-muted',
                  )}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut && <kbd className="ml-4 shrink-0 font-sans text-[11px] text-muted-foreground">{formatShortcut(item.shortcut)}</kbd>}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </ContextMenuShell>
  )
}

/**
 * Phone rendering of the same items: a full-screen sheet with big targets
 * anchored to the bottom (thumb reach); the empty top area and Cancel dismiss.
 */
export function ActionSheet({ items, onClose, header }: {
  items: ActionItem[]
  onClose: () => void
  header?: ReactNode
}) {
  useEscapeClose(onClose)
  const itemClass = 'flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-base font-medium transition-transform active:scale-[.98]'
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-fullscreen flex flex-col bg-background animate-in slide-in-from-bottom-10 fade-in duration-200"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex shrink-0 items-start gap-3 border-b p-4" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">{header}</div>
        <button type="button" onClick={onClose} className="rounded-sm p-2 hover:bg-muted" title="Close" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-4 flex-1" />
      <div
        className="max-h-[75vh] shrink-0 space-y-2 overflow-y-auto px-4 pt-2"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {grouped(items).map((group, gi) => (
          <div key={`${group[0].group ?? ''}:${gi}`} className={cn('space-y-2', gi > 0 && 'pt-2')}>
            {group[0].groupLabel && <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group[0].groupLabel}</div>}
            {group.map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => runAfterClose(item, onClose)}
                  className={cn(itemClass, item.destructive && 'border-destructive/30 text-destructive', item.disabled && 'opacity-50')}
                >
                  {Icon && <Icon className={cn('h-5 w-5 shrink-0', !item.destructive && 'text-muted-foreground')} />}
                  {item.label}
                </button>
              )
            })}
          </div>
        ))}
        <button type="button" onClick={onClose} className={`${itemClass} justify-center bg-muted`}>Cancel</button>
      </div>
    </div>,
    window.document.body,
  )
}

/**
 * Renders an open action menu as either the anchored menu or the phone sheet.
 * Hosts keep `{ anchor, … } | null` state and pass it here — one element for
 * every way of opening it (right-click, long-press, Shift+F10, "⋯").
 */
export function ActionMenuHost({ anchor, items, onClose, label, header }: {
  anchor: ActionAnchor
  items: ActionItem[]
  onClose: () => void
  label?: string
  header?: ReactNode
}) {
  if (items.length === 0) return null
  return prefersActionSheet()
    ? <ActionSheet items={items} onClose={onClose} header={header ?? (label && <div className="truncate text-base font-semibold">{label}</div>)} />
    : <ActionMenu anchor={anchor} items={items} onClose={onClose} label={label} />
}

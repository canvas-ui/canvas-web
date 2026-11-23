import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
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
function runAfterClose(item: ActionItem, onClose: () => void, shiftKey: boolean) {
  onClose()
  setTimeout(() => { void item.run?.({ shiftKey }) }, 0)
}

const ENABLED_ITEMS = '[role="menuitem"]:not([aria-disabled="true"])'

const rowClass = (item: ActionItem) => cn(
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none',
  item.disabled ? 'cursor-default opacity-50' : item.destructive
    ? 'text-destructive hover:bg-destructive hover:text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground'
    : 'hover:bg-muted focus:bg-muted',
)

/**
 * The children of one menu item, beside it. Portaled so the parent menu's
 * scroll box does not clip it; flips to the left when the right has no room.
 */
function Submenu({ parent, items, label, focusFirst, menuRef, onRun }: {
  parent: HTMLElement
  items: ActionItem[]
  label: string
  focusFirst: boolean
  menuRef: RefObject<HTMLDivElement | null>
  onRun: (item: ActionItem, shiftKey: boolean) => void
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const anchor = parent.getBoundingClientRect()
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    const right = anchor.right - 4
    setPos({
      x: Math.max(margin, right + width > window.innerWidth - margin ? anchor.left - width + 4 : right),
      y: Math.max(margin, Math.min(anchor.top - 4, window.innerHeight - height - margin)),
    })
    if (focusFirst) el.querySelector<HTMLElement>(ENABLED_ITEMS)?.focus()
  }, [parent, menuRef, focusFirst])
  return createPortal(
    <div
      ref={menuRef} role="menu" aria-label={label} onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-menu max-h-viewport-modal min-w-[180px] max-w-[min(320px,calc(100vw-16px))] overflow-y-auto rounded-lg border bg-popover py-1 text-popover-foreground shadow-elevation-3"
    >
      {items.map(item => {
        const Icon = item.icon
        return (
          <button
            key={item.id} type="button" role="menuitem" tabIndex={-1}
            aria-disabled={item.disabled || undefined} title={item.hint}
            onClick={event => { if (!item.disabled) onRun(item, event.shiftKey) }}
            className={rowClass(item)}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        )
      })}
    </div>,
    window.document.body,
  )
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
  const subRef = useRef<HTMLDivElement>(null)
  // The item whose submenu is open. `focus` moves the keyboard into it; a
  // submenu opened by hovering leaves focus where it was.
  const [open, setOpen] = useState<{ id: string; parent: HTMLElement; focus: boolean } | null>(null)
  const openItem = open ? items.find(item => item.id === open.id) : undefined

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    listRef.current?.querySelector<HTMLElement>(ENABLED_ITEMS)?.focus()
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement
    const inSubmenu = !!subRef.current?.contains(active)
    if (inSubmenu && event.key === 'ArrowLeft') {
      event.preventDefault()
      open?.parent.focus()
      setOpen(null)
      return
    }
    if (!inSubmenu && event.key === 'ArrowRight' && active?.getAttribute('aria-haspopup') === 'menu') {
      event.preventDefault()
      active.click()
      return
    }
    const nodes = Array.from((inSubmenu ? subRef.current : listRef.current)?.querySelectorAll<HTMLElement>(ENABLED_ITEMS) ?? [])
    if (nodes.length === 0) return
    const index = nodes.indexOf(active)
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
      className="min-w-[200px] rounded-lg border bg-popover text-popover-foreground py-1 shadow-elevation-3"
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
              const submenu = !item.disabled && !!item.children?.length
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled || undefined}
                  aria-haspopup={submenu ? 'menu' : undefined}
                  aria-expanded={submenu ? open?.id === item.id : undefined}
                  title={item.hint}
                  onMouseEnter={event => setOpen(submenu ? { id: item.id, parent: event.currentTarget, focus: false } : null)}
                  onClick={event => {
                    if (submenu) setOpen({ id: item.id, parent: event.currentTarget, focus: true })
                    else if (!item.disabled) runAfterClose(item, onClose, event.shiftKey)
                  }}
                  className={cn(rowClass(item), open?.id === item.id && 'bg-muted')}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut && <kbd className="ml-4 shrink-0 font-sans text-[11px] text-muted-foreground">{formatShortcut(item.shortcut)}</kbd>}
                  {submenu && <ChevronRight className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              )
            })}
          </Fragment>
        ))}
        {open && openItem?.children && (
          <Submenu
            key={open.id} parent={open.parent} items={openItem.children} label={openItem.label} focusFirst={open.focus}
            menuRef={subRef} onRun={(item, shiftKey) => runAfterClose(item, onClose, shiftKey)}
          />
        )}
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
  // A submenu replaces the list: the sheet has no room beside an item.
  const [parent, setParent] = useState<ActionItem | null>(null)
  const shown = parent?.children ?? items
  const itemClass = 'flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-base font-medium transition-transform active:scale-[.98]'
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-fullscreen flex flex-col bg-popover text-popover-foreground animate-in slide-in-from-bottom-10 fade-in duration-normal"
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
        {parent && (
          <button type="button" onClick={() => setParent(null)} className="flex w-full items-center gap-2 px-1 py-1 text-sm font-medium text-muted-foreground">
            <ChevronLeft className="h-4 w-4" /> {parent.label}
          </button>
        )}
        {grouped(shown).map((group, gi) => (
          <div key={`${group[0].group ?? ''}:${gi}`} className={cn('space-y-2', gi > 0 && 'pt-2')}>
            {group[0].groupLabel && <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group[0].groupLabel}</div>}
            {group.map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={event => { if (item.children?.length) setParent(item); else runAfterClose(item, onClose, event.shiftKey) }}
                  className={cn(itemClass, item.destructive && 'border-destructive/30 text-destructive', item.disabled && 'opacity-50')}
                >
                  {Icon && <Icon className={cn('h-5 w-5 shrink-0', !item.destructive && 'text-muted-foreground')} />}
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  {!!item.children?.length && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
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

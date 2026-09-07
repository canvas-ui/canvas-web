// Shell layout mode — an Appearance setting, device-local like the wallpaper.
//
//   classic  the M1/M2 menu panel + one content sheet (the default)
//   strip    EXPERIMENT: M0 | M1 | M2 | canvas, canvas, … laid out as a
//            horizontally navigated strip of columns (arrow keys / swipe),
//            content in ISO 216 (1:√2) cards, a row of canvases per pinned
//            task. See components/shell/strip/.
//
// Stored in localStorage so it can never break a session on another device:
// a user who lands in a bad state flips it back from Settings > Appearance,
// and every consumer treats "unset" as classic.

import { useSyncExternalStore } from 'react'

export type LayoutMode = 'classic' | 'strip'

export const LAYOUT_OPTIONS: Array<{ id: LayoutMode; name: string; description: string }> = [
  { id: 'classic', name: 'Classic', description: 'Menu panel on the left, one content sheet.' },
  {
    id: 'strip',
    name: 'Canvas strip',
    description:
      'Experimental. Menus and canvases side by side in a strip you walk with the arrow keys or a swipe. Shift+click opens a second canvas to the right; pins open their own row.',
  },
]

const KEY = 'canvas:layout'

function read(): LayoutMode {
  try {
    return localStorage.getItem(KEY) === 'strip' ? 'strip' : 'classic'
  } catch {
    return 'classic'
  }
}

// Cached snapshot: useSyncExternalStore calls getSnapshot on every render of
// every subscriber, so it must not hit localStorage each time.
let current: LayoutMode = read()
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function loadLayoutMode(): LayoutMode {
  return current
}

export function setLayoutMode(mode: LayoutMode): void {
  try {
    if (mode === 'strip') localStorage.setItem(KEY, mode)
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode / quota: keep the in-memory value for this session */
  }
  current = mode
  emit()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return
    current = read()
    fn()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, loadLayoutMode, () => 'classic')
}

// ── Strip navigation keys ──────────────────────────────────────────────────
// Which modifier the arrow keys need to walk the strip. Bare arrows collide
// with everything a page does with them (lists, grids, text), so a modifier
// is the default; the choices are what a browser leaves free.

export type LayoutNavModifier = 'shift' | 'alt' | 'ctrl' | 'none'

export const LAYOUT_NAV_OPTIONS: Array<{ id: LayoutNavModifier; name: string; description: string }> = [
  { id: 'shift', name: 'Shift + arrows', description: 'Shift with an arrow key moves between columns and rows.' },
  { id: 'alt', name: 'Alt + arrows', description: 'Alt with an arrow key. Some browsers use Alt+Left/Right for history.' },
  { id: 'ctrl', name: 'Ctrl + arrows', description: 'Ctrl (Cmd on macOS) with an arrow key.' },
  { id: 'none', name: 'Bare arrows', description: 'Plain arrow keys, except while typing in a field.' },
]

const NAV_KEY = 'canvas:layout-nav'

function readNav(): LayoutNavModifier {
  try {
    const v = localStorage.getItem(NAV_KEY)
    return v === 'alt' || v === 'ctrl' || v === 'none' ? v : 'shift'
  } catch {
    return 'shift'
  }
}

let currentNav: LayoutNavModifier = readNav()
const navListeners = new Set<() => void>()

export function loadLayoutNavModifier(): LayoutNavModifier {
  return currentNav
}

export function setLayoutNavModifier(mod: LayoutNavModifier): void {
  try {
    if (mod === 'shift') localStorage.removeItem(NAV_KEY)
    else localStorage.setItem(NAV_KEY, mod)
  } catch {
    /* keep in memory */
  }
  currentNav = mod
  for (const fn of navListeners) fn()
}

function subscribeNav(fn: () => void): () => void {
  navListeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== NAV_KEY && e.key !== null) return
    currentNav = readNav()
    fn()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    navListeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useLayoutNavModifier(): LayoutNavModifier {
  return useSyncExternalStore(subscribeNav, loadLayoutNavModifier, () => 'shift')
}

/** True when the event carries exactly the configured modifier (and no other). */
export function matchesNavModifier(e: KeyboardEvent, mod: LayoutNavModifier): boolean {
  const ctrl = e.ctrlKey || e.metaKey
  switch (mod) {
    case 'shift': return e.shiftKey && !e.altKey && !ctrl
    case 'alt': return e.altKey && !e.shiftKey && !ctrl
    case 'ctrl': return ctrl && !e.shiftKey && !e.altKey
    case 'none': return !e.shiftKey && !e.altKey && !ctrl
  }
}

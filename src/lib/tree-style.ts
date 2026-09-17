// Tree rendering style — an Appearance setting, device-local like the layout.
//
//   cards             nested cards with connector lines; every level indents
//                     (the default)
//   accordion-mobile  EXPERIMENT: accordion on phones, cards elsewhere
//   accordion         EXPERIMENT: accordion everywhere
//
// Accordion: every row spans the full width at every depth, so a deep name is
// not squeezed to the right on a phone. Hierarchy is carried by a thin depth
// rail, a stepped neutral tint and a colour swatch instead of indentation.
// See CardNode in components/menu/shared/MenuTreeView.tsx.

import { useSyncExternalStore } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'

export type TreeStyle = 'cards' | 'accordion-mobile' | 'accordion'

export const TREE_STYLE_OPTIONS: Array<{ id: TreeStyle; name: string; description: string }> = [
  { id: 'cards', name: 'Cards', description: 'Nested cards with connector lines. Each level indents.' },
  {
    id: 'accordion-mobile',
    name: 'Accordion on phones (beta)',
    description: 'Experimental. Full-width accordion rows on a phone, cards on wider screens.',
  },
  {
    id: 'accordion',
    name: 'Accordion (beta)',
    description:
      'Experimental. Full-width rows at every depth; a depth rail, tint and colour swatch replace the indent, and open parents stick to the top while you scroll.',
  },
]

const KEY = 'canvas:treeStyle'

function read(): TreeStyle {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'accordion' || v === 'accordion-mobile' ? v : 'cards'
  } catch {
    return 'cards'
  }
}

// Cached snapshot: useSyncExternalStore calls getSnapshot on every render.
let current: TreeStyle = read()
const listeners = new Set<() => void>()

export function loadTreeStyle(): TreeStyle {
  return current
}

export function setTreeStyle(style: TreeStyle): void {
  try {
    if (style === 'cards') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, style)
  } catch {
    /* private mode / quota: keep the in-memory value for this session */
  }
  current = style
  for (const fn of listeners) fn()
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

export function useTreeStyle(): TreeStyle {
  return useSyncExternalStore(subscribe, loadTreeStyle, () => 'cards')
}

/** Whether trees render as an accordion on this device right now. */
export function useTreeAccordion(): boolean {
  const style = useTreeStyle()
  const isMobile = useIsMobile()
  return style === 'accordion' || (style === 'accordion-mobile' && isMobile)
}

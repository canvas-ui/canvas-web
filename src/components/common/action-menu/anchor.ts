import type { ActionAnchor } from './types'

/** Phones get the sheet; everything else the anchored menu. */
export function prefersActionSheet(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

/** Menu point for an element (keyboard / button-opened menus). */
export function anchorFromElement(el: Element, placement: 'below' | 'inside' = 'below'): ActionAnchor {
  const rect = el.getBoundingClientRect()
  return placement === 'below'
    ? { x: rect.left, y: rect.bottom + 4 }
    : { x: rect.left + Math.min(24, rect.width / 2), y: rect.top + Math.min(24, rect.height / 2) }
}

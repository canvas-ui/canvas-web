import { useRef, type TouchEvent, type MouseEvent } from 'react'

const INTERACTIVE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="dialog"], [aria-modal="true"], canvas, video, .canvas-navigation, .react-grid-item, .excalidraw, .xterm, [data-no-navigation-swipe]'

// Horizontal scrollers own their gestures, including when already at an edge.
function ownsSwipe(target: Element, root: Element) {
  if (target.closest(INTERACTIVE)) return true
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return true
    if (node === root) break
  }
  return false
}

export function useMobileTreeSwipe(enabled: boolean, direction: 'left' | 'right', onSwipe: () => void) {
  const start = useRef<{ x: number; y: number; time: number } | null>(null)
  const suppressClick = useRef(0)
  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      start.current = null
      if (!enabled || event.touches.length !== 1 || !(event.target instanceof Element)) return
      if (ownsSwipe(event.target, event.currentTarget) || document.querySelector('[aria-modal="true"], dialog[open]')) return
      const touch = event.touches[0]
      // Leave OS edge gestures alone.
      if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return
      start.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      if (!start.current) return
      if (event.touches.length !== 1 || Math.abs(event.touches[0].clientY - start.current.y) > 40) start.current = null
    },
    onTouchCancel() { start.current = null },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const from = start.current
      start.current = null
      if (!enabled || !from || !event.changedTouches.length) return
      const dx = event.changedTouches[0].clientX - from.x
      const dy = event.changedTouches[0].clientY - from.y
      if (Date.now() - from.time > 800 || Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2) return
      if ((direction === 'right') !== (dx > 0)) return
      suppressClick.current = Date.now() + 500
      event.stopPropagation()
      onSwipe()
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (Date.now() < suppressClick.current) { event.preventDefault(); event.stopPropagation() }
    },
  }
}

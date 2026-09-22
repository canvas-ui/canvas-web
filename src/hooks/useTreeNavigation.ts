import { useEffect, useRef, type TouchEvent } from 'react'
import { readKeyBindings, shortcutForEvent, swipeDirection } from '@/lib/key-bindings'

export function useTreeNavigation(enabled: boolean, cycle: (direction: number) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const suppressClickUntil = useRef(0)
  useEffect(() => {
    if (!enabled) return
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.getModifierState('AltGraph')) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="alertdialog"]')) return
      if (document.querySelector('[aria-modal="true"], dialog[open]')) return
      const binding = shortcutForEvent(event)
      if (!binding) return
      const bindings = readKeyBindings()
      const direction = binding === bindings.previousTree ? -1 : binding === bindings.nextTree ? 1 : 0
      if (!direction) return
      event.preventDefault()
      cycle(direction)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [enabled, cycle])

  return {
    onTouchStart(event: TouchEvent) {
      suppressClickUntil.current = 0
      start.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null
    },
    onTouchMove(event: TouchEvent) {
      if (event.touches.length !== 1) start.current = null
    },
    onTouchCancel() { start.current = null },
    onTouchEnd(event: TouchEvent) {
      if (!start.current || !enabled) return
      const touch = event.changedTouches[0]
      const direction = swipeDirection(touch.clientX - start.current.x, touch.clientY - start.current.y)
      start.current = null
      if (!direction) return
      suppressClickUntil.current = Date.now() + 500
      event.stopPropagation()
      cycle(direction)
    },
    onClickCapture(event: React.MouseEvent) {
      if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); suppressClickUntil.current = 0 }
    },
  }
}

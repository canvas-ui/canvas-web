import { useEffect, useState, type PointerEvent, type MouseEvent, type DragEvent } from 'react'
import { createLongPress } from '@/lib/long-press'

// Dispatch through the existing context-menu handler so desktop and touch
// retain identical selection and menu behavior.
export function useLongPressContextMenu() {
  const [gesture] = useState(createLongPress)
  useEffect(() => gesture.cancel, [gesture])
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      gesture.reset()
      if (event.pointerType !== 'touch' || !event.isPrimary) return
      const target = event.target as HTMLElement
      if (!event.currentTarget.contains(target) || target.closest('button, input, textarea, select, a, [contenteditable="true"], [role="dialog"]')) return
      const { clientX, clientY } = event
      gesture.start(clientX, clientY, () => {
        // Call the normal bubble handler; the capture handler ignores this
        // programmatic event to avoid treating it as a duplicate native menu.
        target.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }))
      })
    },
    onPointerMove: (event: PointerEvent) => gesture.move(event.clientX, event.clientY),
    onPointerUp: gesture.cancel,
    onPointerCancel: gesture.cancel,
    onPointerLeave: gesture.cancel,
    onDragStartCapture: (event: DragEvent) => { gesture.cancel(); if (gesture.consumeClick()) event.preventDefault() },
    onContextMenuCapture: (event: MouseEvent) => {
      if (!event.isTrusted) return
      if (gesture.contextMenu()) { event.preventDefault(); event.stopPropagation() }
    },
    onClickCapture: (event: MouseEvent) => {
      if (gesture.consumeClick()) { event.preventDefault(); event.stopPropagation() }
    },
  }
}


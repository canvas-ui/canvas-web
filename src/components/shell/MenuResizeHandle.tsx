import { useRef } from 'react'

const MIN = 220
const MAX = 560

/** Pointer capture keeps mouse, pen and touch resizing on the same path. */
export function MenuResizeHandle({ width, onResize, onDragging }: {
  width: number
  onResize: (width: number) => void
  onDragging?: (dragging: boolean) => void
}) {
  const drag = useRef<{ id: number; x: number; width: number } | null>(null)
  const resize = (next: number) => onResize(Math.min(MAX, Math.max(MIN, next)))
  const finish = () => { drag.current = null; onDragging?.(false) }
  return <div
    role="separator" aria-label="Resize menu" aria-orientation="vertical"
    aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={width} tabIndex={0}
    title="Drag to resize; use arrow keys to adjust; Home resets width"
    className="absolute inset-y-0 right-0 z-30 flex w-3 touch-none select-none cursor-col-resize items-center justify-center hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none [@media(pointer:coarse)]:w-6"
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return
      event.preventDefault()
      event.stopPropagation()
      drag.current = { id: event.pointerId, x: event.clientX, width }
      event.currentTarget.setPointerCapture(event.pointerId)
      onDragging?.(true)
    }}
    onPointerMove={event => {
      if (drag.current?.id !== event.pointerId) return
      resize(drag.current.width + event.clientX - drag.current.x)
    }}
    onPointerUp={event => {
      if (drag.current?.id !== event.pointerId) return
      finish()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onPointerCancel={finish}
    onLostPointerCapture={finish}
    onDoubleClick={() => resize(280)}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      resize(event.key === 'Home' ? 280 : width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 64 : 16))
    }}
  ><span aria-hidden className="h-10 w-1 rounded-full bg-border" /></div>
}

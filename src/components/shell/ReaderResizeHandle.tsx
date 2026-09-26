import { useRef } from 'react'
import { useReaderWidth, setWidth } from '@/lib/reader-width'

const MIN = 320
const MAX = 1600

/** Shared across workspaces and layouts, retained through reloads in this tab. */
export function ReaderResizeHandle({ edge }: { edge: 'left' | 'right' }) {
  const current = useReaderWidth()
  const drag = useRef<{ x: number; width: number; max: number } | null>(null)
  const direction = edge === 'left' ? -1 : 1
  return (
    <div
      role="separator"
      aria-label="Resize document reader"
      aria-orientation="vertical"
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={current ?? 560}
      tabIndex={0}
      title="Drag to resize; arrow keys adjust width; double-click to reset"
      className={`absolute inset-y-0 ${edge === 'left' ? 'left-0' : 'right-0'} z-20 hidden w-2 touch-none cursor-col-resize select-none hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none md:block`}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const pane = event.currentTarget.closest<HTMLElement>('[data-reader-pane]')!
        const max = edge === 'left' ? (pane.parentElement?.clientWidth ?? window.innerWidth) - 240 : window.innerWidth
        drag.current = { x: event.clientX, width: pane.getBoundingClientRect().width, max: Math.max(MIN, max) }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        if (!drag.current) return
        setWidth(Math.min(drag.current.max, drag.current.width + direction * (event.clientX - drag.current.x)))
      }}
      onPointerUp={event => {
        drag.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => { drag.current = null }}
      onLostPointerCapture={() => { drag.current = null }}
      onDoubleClick={() => setWidth(null)}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home') return
        event.preventDefault()
        event.stopPropagation()
        const pane = event.currentTarget.closest<HTMLElement>('[data-reader-pane]')!
        if (event.key === 'Home') setWidth(null)
        else setWidth(pane.getBoundingClientRect().width + (event.key === 'ArrowRight' ? 1 : -1) * direction * (event.shiftKey ? 64 : 16))
      }}
    />
  )
}

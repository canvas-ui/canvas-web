import { useEffect, useRef, useState } from 'react'
import { DAY_MS, dateFromKey } from '@/lib/calendar/dates'
import { moveByDays } from '@/lib/calendar/drag'
import type { Occurrence } from '@/lib/calendar/occurrences'

// Drag an entry chip onto another day (month cells, the all-day lane). The
// host marks its day targets with data-day and the target is resolved from
// the pointer position. The chip re-mounts in its new cell while it moves,
// so the drag listens on the window instead of holding a pointer capture.
// `apply` substitutes the moved entry so the grid draws it live; the drop
// reports the new span and swallows the click that follows it.
export interface DayDragHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onClickCapture: (e: React.MouseEvent) => void
}

export function useDayDrag(onMove: (o: Occurrence, start: Date, end: Date) => void) {
  const [moving, setMoving] = useState<{ key: string; start: Date; end: Date } | null>(null)
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove })
  const drag = useRef<{ o: Occurrence; fromKey: string; delta: number; stop: () => void } | null>(null)
  const dropped = useRef(false)
  useEffect(() => () => drag.current?.stop(), [])
  const dayKeyAt = (e: { clientX: number; clientY: number }): string | null =>
    (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-day]') as HTMLElement | null)?.dataset.day ?? null

  const handlers = (o: Occurrence): DayDragHandlers | Record<string, never> => o.recurring ? {} : {
    onPointerDown: (e) => {
      if (e.button !== 0 || drag.current) return
      const key = dayKeyAt(e)
      if (!key) return
      const move = (ev: PointerEvent) => {
        const d = drag.current
        if (!d) return
        const to = dayKeyAt(ev)
        if (!to) return
        const delta = Math.round((dateFromKey(to).getTime() - dateFromKey(d.fromKey).getTime()) / DAY_MS)
        if (delta === d.delta) return
        d.delta = delta
        setMoving(delta ? { key: d.o.key, ...moveByDays(d.o, delta) } : null)
      }
      const up = () => {
        const d = drag.current
        if (!d) return
        d.stop()
        setMoving(null)
        if (!d.delta) return
        dropped.current = true
        setTimeout(() => { dropped.current = false }, 0)
        const span = moveByDays(d.o, d.delta)
        onMoveRef.current(d.o, span.start, span.end)
      }
      const cancel = () => { drag.current?.stop(); setMoving(null) }
      const stop = () => {
        drag.current = null
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
      drag.current = { o, fromKey: key, delta: 0, stop }
    },
    onClickCapture: (e) => {
      if (!dropped.current) return
      dropped.current = false
      e.stopPropagation()
      e.preventDefault()
    },
  }

  const apply = (list: Occurrence[]): Occurrence[] =>
    moving ? list.map(o => o.key === moving.key ? { ...o, start: moving.start, end: moving.end } : o) : list

  return { moving, handlers, apply }
}

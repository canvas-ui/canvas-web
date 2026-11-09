import { useRef, useState } from 'react'
import { DAY_MS, dateFromKey } from '@/lib/calendar/dates'
import { moveByDays } from '@/lib/calendar/drag'
import type { Occurrence } from '@/lib/calendar/occurrences'

// Drag an entry chip onto another day (month cells, the all-day lane). The
// host marks its day targets with data-day; the chip holds the pointer
// capture, so the target is resolved from the pointer position. While the
// drag runs `apply` substitutes the moved entry so the grid draws it live;
// the drop reports the new span and swallows the click that follows it.
export interface DayDragHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: () => void
  onClickCapture: (e: React.MouseEvent) => void
}

export function useDayDrag(onMove: (o: Occurrence, start: Date, end: Date) => void) {
  const [moving, setMoving] = useState<{ key: string; start: Date; end: Date } | null>(null)
  const drag = useRef<{ o: Occurrence; fromKey: string; delta: number } | null>(null)
  const dropped = useRef(false)
  const dayKeyAt = (e: React.PointerEvent): string | null =>
    (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-day]') as HTMLElement | null)?.dataset.day ?? null

  const handlers = (o: Occurrence): DayDragHandlers | Record<string, never> => o.recurring ? {} : {
    onPointerDown: (e) => {
      if (e.button !== 0) return
      const key = dayKeyAt(e)
      if (!key) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { o, fromKey: key, delta: 0 }
    },
    onPointerMove: (e) => {
      const d = drag.current
      if (!d) return
      const key = dayKeyAt(e)
      if (!key) return
      const delta = Math.round((dateFromKey(key).getTime() - dateFromKey(d.fromKey).getTime()) / DAY_MS)
      if (delta === d.delta) return
      d.delta = delta
      setMoving(delta ? { key: d.o.key, ...moveByDays(d.o, delta) } : null)
    },
    onPointerUp: (e) => {
      const d = drag.current
      drag.current = null
      if (!d) return
      e.currentTarget.releasePointerCapture(e.pointerId)
      setMoving(null)
      if (!d.delta) return
      dropped.current = true
      setTimeout(() => { dropped.current = false }, 0)
      const span = moveByDays(d.o, d.delta)
      onMove(d.o, span.start, span.end)
    },
    onPointerCancel: () => { drag.current = null; setMoving(null) },
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

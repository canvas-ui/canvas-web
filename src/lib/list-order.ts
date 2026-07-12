import { useRef, useState } from 'react'

// User-orderable lists (workspaces, contexts): explicit `order` first,
// unordered items last, stable tiebreak on createdAt then name.
export function sortByOrder<T extends { order?: number | null; createdAt?: string; name?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ao = typeof a.order === 'number' && Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER
    const bo = typeof b.order === 'number' && Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    const ac = a.createdAt ?? ''
    const bc = b.createdAt ?? ''
    if (ac !== bc) return ac < bc ? -1 : 1
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

// Renumber to sequential integers and persist only the items whose order
// actually changed (small lists, but no reason to write untouched rows).
// Individual failures (e.g. a broken/not-found workspace rejecting the PATCH)
// must not undo the rest of the reorder — collect them instead of throwing.
export async function persistSequentialOrder<T extends { order?: number | null }>(
  items: T[],
  update: (item: T, order: number) => Promise<unknown>,
): Promise<{ failed: number }> {
  const results = await Promise.allSettled(items.map((item, index) =>
    item.order === index ? Promise.resolve() : update(item, index),
  ))
  return { failed: results.filter(r => r.status === 'rejected').length }
}

// Pointer-based drag-to-reorder for vertical lists. HTML5 drag events never
// fire on touch devices, so the drag is driven by pointer events on a
// dedicated grip handle: spread `handleProps(i)` onto the grip button and
// `rowProps(i)` onto each row. While dragging, the row under the pointer is
// resolved via elementFromPoint against the row's data attribute.
// `draggingIndex`/`overIndex` are exposed for styling.
export function useListReorder(onDrop: (from: number, to: number) => void) {
  const dragRef = useRef<{ from: number; over: number } | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const handleProps = (index: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      // Keep the row's own click/drag behavior out of the gesture and stop
      // touch from scrolling the list (touch-action is set below too).
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { from: index, over: index }
      setDraggingIndex(index)
      setOverIndex(index)
      const move = (ev: PointerEvent) => {
        const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)
          ?.closest?.('[data-reorder-index]') as HTMLElement | null
        if (!el || !dragRef.current) return
        const over = Number(el.dataset.reorderIndex)
        if (Number.isFinite(over) && over !== dragRef.current.over) {
          dragRef.current.over = over
          setOverIndex(over)
        }
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        const d = dragRef.current
        dragRef.current = null
        setDraggingIndex(null)
        setOverIndex(null)
        if (d && d.from !== d.over) onDrop(d.from, d.over)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    // The grip is not a clickable action — swallow the click that follows
    // pointerup so it doesn't bubble into the row's onClick.
    onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() },
    style: { touchAction: 'none' } as React.CSSProperties,
  })

  const rowProps = (index: number) => ({ 'data-reorder-index': index })

  return { rowProps, handleProps, overIndex, draggingIndex }
}

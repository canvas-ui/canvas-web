import { useState } from 'react'

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
// `rowProps(i)` onto each row.
//
// Performance: row rects are measured ONCE at drag start (no per-move
// elementFromPoint/hit-testing), pointer moves are rAF-throttled, and the
// floating row clone is positioned via transform (compositor-only, no
// layout).
//
// Styling: `insertIndex` (0..n) marks the gap the item would be inserted
// into — render it as a line between rows, not a highlight on a row (we are
// moving, not merging). `draggingIndex` marks the source row.
export function useListReorder(onDrop: (from: number, to: number) => void) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [insertIndex, setInsertIndex] = useState<number | null>(null)

  const handleProps = (index: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      // Keep the row's own click/drag behavior out of the gesture and stop
      // touch from scrolling the list (touch-action is set below too).
      e.preventDefault()
      e.stopPropagation()

      const rowEl = (e.currentTarget as HTMLElement).closest('[data-reorder-index]') as HTMLElement | null
      if (!rowEl) return

      // Measure the sibling rows of THIS list once — drop position is then a
      // pure array lookup per frame.
      const listEl = rowEl.parentElement
      const rowEls = listEl
        ? ([...listEl.querySelectorAll(':scope > [data-reorder-index]')] as HTMLElement[])
        : [rowEl]
      const mids = rowEls
        .map(el => ({ index: Number(el.dataset.reorderIndex), rect: el.getBoundingClientRect() }))
        .filter(r => Number.isFinite(r.index))
        .sort((a, b) => a.index - b.index)
        .map(r => r.rect.top + r.rect.height / 2)

      // Float a visual clone of the whole row under the pointer.
      const rect = rowEl.getBoundingClientRect()
      const ghost = rowEl.cloneNode(true) as HTMLElement
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        pointerEvents: 'none',
        zIndex: '100',
        opacity: '0.92',
        boxShadow: '0 12px 32px rgba(0,0,0,.28)',
        willChange: 'transform',
      } as Partial<CSSStyleDeclaration>)
      document.body.appendChild(ghost)
      const origin = { x: e.clientX, y: e.clientY }

      let insert = index
      setDraggingIndex(index)
      setInsertIndex(index)

      // rAF throttle: pointermove can fire far above 60 Hz (and multiple
      // times per frame); coalesce to one style write + one state check per
      // frame.
      let last = { x: e.clientX, y: e.clientY }
      let raf = 0
      const frame = () => {
        raf = 0
        ghost.style.transform = `translate(${last.x - origin.x}px, ${last.y - origin.y}px) scale(1.02)`
        // Insertion gap: first row-midpoint below the pointer.
        let next = mids.length
        for (let i = 0; i < mids.length; i++) {
          if (last.y < mids[i]) { next = i; break }
        }
        if (next !== insert) {
          insert = next
          setInsertIndex(next)
        }
      }
      const move = (ev: PointerEvent) => {
        last = { x: ev.clientX, y: ev.clientY }
        if (!raf) raf = requestAnimationFrame(frame)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (raf) cancelAnimationFrame(raf)
        ghost.remove()
        setDraggingIndex(null)
        setInsertIndex(null)
        // Gap → target position: gaps at `from` and `from + 1` are no-ops.
        if (insert !== index && insert !== index + 1) {
          onDrop(index, insert > index ? insert - 1 : insert)
        }
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

  // Tailwind classes for the insertion line: a 3px primary-colored edge on
  // the row adjoining the active gap. Pass the list length so the below-last
  // gap renders on the final row's bottom edge.
  const insertLineClass = (index: number, length: number): string | false => {
    if (insertIndex === null || draggingIndex === null) return false
    if (insertIndex === index) return 'shadow-[0_-3px_0_0_var(--color-primary)]'
    if (insertIndex === length && index === length - 1) return 'shadow-[0_3px_0_0_var(--color-primary)]'
    return false
  }

  return { rowProps, handleProps, insertIndex, draggingIndex, insertLineClass }
}

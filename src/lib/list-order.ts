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
export async function persistSequentialOrder<T extends { order?: number | null }>(
  items: T[],
  update: (item: T, order: number) => Promise<unknown>,
): Promise<void> {
  await Promise.all(items.map((item, index) =>
    item.order === index ? Promise.resolve() : update(item, index),
  ))
}

// Minimal HTML5 drag-to-reorder state for vertical lists. Spread the returned
// props onto each row; `overIndex` marks the current drop target for styling.
export function useListReorder(onDrop: (from: number, to: number) => void) {
  const dragIndex = useRef<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const rowProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragIndex.current = index
      e.dataTransfer.effectAllowed = 'move'
      // Some browsers require data for a drag to start.
      e.dataTransfer.setData('text/plain', String(index))
    },
    onDragOver: (e: React.DragEvent) => {
      if (dragIndex.current === null) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (overIndex !== index) setOverIndex(index)
    },
    onDragLeave: () => {
      if (overIndex === index) setOverIndex(null)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const from = dragIndex.current
      dragIndex.current = null
      setOverIndex(null)
      if (from !== null && from !== index) onDrop(from, index)
    },
    onDragEnd: () => {
      dragIndex.current = null
      setOverIndex(null)
    },
  })

  return { rowProps, overIndex }
}

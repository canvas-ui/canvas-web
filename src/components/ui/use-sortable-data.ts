import { useCallback, useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'
export interface SortState { key: string | null; dir: SortDir }
export type SortAccessors<T> = Record<string, (item: T) => string | number | null | undefined>

export function useSortableData<T>(items: T[], accessors: SortAccessors<T>, initial: SortState = { key: null, dir: 'asc' }) {
  const [sort, setSort] = useState<SortState>(initial)
  const sorted = useMemo(() => {
    const accessor = sort.key ? accessors[sort.key] : null
    if (!accessor) return items
    const direction = sort.dir === 'asc' ? 1 : -1
    return [...items].sort((a, b) => {
      const left = accessor(a) ?? ''
      const right = accessor(b) ?? ''
      return (typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), undefined, { numeric: true })) * direction
    })
  }, [items, sort, accessors])
  const toggleSort = useCallback((key: string) => setSort((previous) => previous.key === key ? { key, dir: previous.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }), [])
  return { sorted, sort, toggleSort }
}

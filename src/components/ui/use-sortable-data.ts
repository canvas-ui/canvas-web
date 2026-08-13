import * as React from "react"

export type SortDir = "asc" | "desc"
export interface SortState { key: string | null; dir: SortDir }
export type SortAccessors<T> = Record<string, (item: T) => string | number | null | undefined>

/** Client-side column sort. Pass accessors keyed by column id; returns sorted rows + toggle. */
export function useSortableData<T>(
  items: T[],
  accessors: SortAccessors<T>,
  initial: SortState = { key: null, dir: "asc" },
) {
  const [sort, setSort] = React.useState<SortState>(initial)

  const sorted = React.useMemo(() => {
    const acc = sort.key ? accessors[sort.key] : null
    if (!acc) return items
    const dir = sort.dir === "asc" ? 1 : -1
    return [...items].sort((a, b) => {
      const av = acc(a) ?? ""
      const bv = acc(b) ?? ""
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
    })
  }, [items, sort, accessors])

  const toggleSort = React.useCallback((key: string) => {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }))
  }, [])

  return { sorted, sort, toggleSort }
}

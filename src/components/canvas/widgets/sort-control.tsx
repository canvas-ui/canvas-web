import { useEffect, useMemo, useState } from 'react'
import { ArrowDownWideNarrow, ArrowUpWideNarrow } from 'lucide-react'
import { listWorkspaceTimelines } from '@/services/workspace'

export type SortOrder = 'asc' | 'desc'
export interface TimelineSort {
  sortBy: string
  order: SortOrder
}

// Default listing sort: the CRUD "created" timeline, newest first. Matches the
// server's implicit ordering while being explicit about the timeline used.
export const DEFAULT_TIMELINE_SORT: TimelineSort = { sortBy: 'crud:created', order: 'desc' }

// Friendly labels for the well-known system timelines; anything else (user or
// domain timelines like `content`, `wikipedia`, …) is shown verbatim.
const KNOWN_LABELS: Record<string, string> = {
  'crud:created': 'Created',
  'crud:updated': 'Updated',
  content: 'Content',
}

function labelFor(name: string): string {
  return KNOWN_LABELS[name] ?? name
}

// Load the workspace's timelines once and merge with the always-present CRUD
// timelines, so the dropdown offers created/updated/content plus any custom
// timeline the backend exposes.
export function useTimelineOptions(workspaceId: string): { value: string; label: string }[] {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    listWorkspaceTimelines(workspaceId)
      .then((list) => { if (!cancelled) setNames(list) })
      .catch(() => { if (!cancelled) setNames([]) })
    return () => { cancelled = true }
  }, [workspaceId])

  return useMemo(() => {
    const merged = new Set<string>(['crud:created', 'crud:updated', ...names])
    return [...merged].map((value) => ({ value, label: labelFor(value) }))
  }, [names])
}

// Compact "sort by <timeline> <asc/desc>" control shared by the document,
// gallery, and mosaic widgets. `.canvas-no-drag` keeps clicks from starting a
// grid drag.
export function TimelineSortControl({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string
  value: TimelineSort
  onChange: (next: TimelineSort) => void
}) {
  const options = useTimelineOptions(workspaceId)
  const toggleOrder = () => onChange({ ...value, order: value.order === 'asc' ? 'desc' : 'asc' })

  return (
    <div className="canvas-no-drag flex items-center gap-1">
      <select
        value={value.sortBy}
        onChange={(e) => onChange({ ...value, sortBy: e.target.value })}
        className="h-7 rounded-md border bg-background px-1.5 text-xs"
        title="Sort by timeline"
      >
        {/* Keep the current value selectable even before timelines have loaded. */}
        {!options.some((o) => o.value === value.sortBy) && (
          <option value={value.sortBy}>{labelFor(value.sortBy)}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={toggleOrder}
        title={value.order === 'asc' ? 'Ascending (oldest first)' : 'Descending (newest first)'}
        className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {value.order === 'asc'
          ? <ArrowUpWideNarrow className="h-3.5 w-3.5" />
          : <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

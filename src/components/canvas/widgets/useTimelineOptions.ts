import { DEFAULT_TOOLBOX_SORT } from '@/types/workspace'
import { useEffect, useMemo, useState } from 'react'
import { listWorkspaceTimelines } from '@/services/workspace'

export type SortOrder = 'asc' | 'desc'
export interface TimelineSort {
  sortBy: string
  order: SortOrder
}

// Default listing sort: displayed name, A–Z.
export const DEFAULT_TIMELINE_SORT: TimelineSort = DEFAULT_TOOLBOX_SORT

// Friendly labels for the well-known system timelines; anything else (user or
// domain timelines like `content`, `wikipedia`, …) is shown verbatim.
const KNOWN_LABELS: Record<string, string> = {
  alphabetical: 'Alphabetical',
  type: 'Type',
  'crud:created': 'Created',
  'crud:updated': 'Updated',
  content: 'Content',
}

export function labelFor(name: string): string {
  return KNOWN_LABELS[name] ?? name
}

// Merge display-field sorts with system and custom timelines. Deleted is
// retained as a filter elsewhere, but is not a listing sort option.
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
    const merged = new Set<string>(['alphabetical', 'type', 'crud:created', 'crud:updated', 'content', ...names.filter(name => name !== 'crud:deleted')])
    return [...merged].map((value) => ({ value, label: labelFor(value) }))
  }, [names])
}

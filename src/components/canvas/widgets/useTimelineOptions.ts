import { useEffect, useMemo, useState } from 'react'
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

export function labelFor(name: string): string {
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

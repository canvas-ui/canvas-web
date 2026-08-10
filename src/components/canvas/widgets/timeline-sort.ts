import { useEffect, useMemo, useState } from 'react'
import { listWorkspaceTimelines } from '@/services/workspace'

export type SortOrder = 'asc' | 'desc'
export interface TimelineSort {
  sortBy: string
  order: SortOrder
}

export const DEFAULT_TIMELINE_SORT: TimelineSort = { sortBy: 'crud:created', order: 'desc' }

const KNOWN_LABELS: Record<string, string> = {
  'crud:created': 'Created',
  'crud:updated': 'Updated',
  content: 'Content',
}

export function timelineLabel(name: string): string {
  return KNOWN_LABELS[name] ?? name
}

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
    return [...merged].map((value) => ({ value, label: timelineLabel(value) }))
  }, [names])
}

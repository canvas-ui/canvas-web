import { ArrowDownWideNarrow, ArrowUpWideNarrow } from 'lucide-react'
import { labelFor, useTimelineOptions, type TimelineSort } from './useTimelineOptions'

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
        className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground touch-target"
      >
        {value.order === 'asc'
          ? <ArrowUpWideNarrow className="h-3.5 w-3.5" />
          : <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

import { useState } from 'react'
import { X, Save, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox, type ToolsTab } from '@/components/toolbox/toolbox-context'

// ─── MD2-style toggle switch ─────────────────────────────────────────────────

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  accent?: 'default' | 'blue' | 'green' | 'amber'
}

function MD2Toggle({ label, checked, onChange, accent = 'default' }: ToggleProps) {
  const trackColor = checked
    ? accent === 'blue'
      ? 'bg-blue-500'
      : accent === 'green'
        ? 'bg-green-500'
        : accent === 'amber'
          ? 'bg-amber-500'
          : 'bg-zinc-700'
    : 'bg-zinc-300'

  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onChange(!checked)}
      className="flex items-center justify-between gap-3 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      <span className="text-sm text-foreground truncate">{label}</span>
      <div className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', trackColor)}>
        <div
          className={cn(
            'absolute top-[2px] w-4 h-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
          )}
        />
      </div>
    </div>
  )
}

// ─── Timeline tab ─────────────────────────────────────────────────────────────

const QUICK_FILTERS = ['Today', 'Yesterday', 'This week', 'This month', 'This year'] as const
type QuickFilter = (typeof QUICK_FILTERS)[number]

const QF_KEY_MAP: Record<QuickFilter, string> = {
  Today: 'today',
  Yesterday: 'yesterday',
  'This week': 'this_week',
  'This month': 'this_month',
  'This year': 'this_year',
}

function TimelineTab() {
  const { state, setTimelineFilter } = useToolbox()
  const { timeline } = state.filters

  const quickFilter = QUICK_FILTERS.find(f => QF_KEY_MAP[f] === timeline.quickFilter) ?? null

  return (
    <div className="flex h-full min-h-0">
      {/* Timeline rail */}
      <div className="w-16 shrink-0 flex flex-col items-center py-4 border-r border-border">
        <div className="relative flex flex-col items-center flex-1 w-full">
          <div className="absolute top-0 bottom-0 w-px bg-border left-1/2 -translate-x-1/2" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="relative z-10 w-2.5 h-2.5 rounded-full bg-muted border border-border mt-8 first:mt-0 cursor-pointer hover:bg-primary/20 hover:border-primary transition-colors"
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Quick filter
          </p>
          <div className="flex flex-col gap-1">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setTimelineFilter({ quickFilter: quickFilter === f ? null : QF_KEY_MAP[f] })}
                className={cn(
                  'text-left text-sm px-2.5 py-1 rounded-md transition-colors',
                  quickFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Index actions
          </p>
          <div className="space-y-2">
            <MD2Toggle
              label="Created"
              checked={timeline.indexCreated}
              onChange={(v) => setTimelineFilter({ indexCreated: v })}
              accent="green"
            />
            <MD2Toggle
              label="Updated"
              checked={timeline.indexUpdated}
              onChange={(v) => setTimelineFilter({ indexUpdated: v })}
              accent="blue"
            />
            <MD2Toggle
              label="Deleted"
              checked={timeline.indexDeleted}
              onChange={(v) => setTimelineFilter({ indexDeleted: v })}
              accent="amber"
            />
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Content
          </p>
          <MD2Toggle
            label="Search document content"
            checked={timeline.searchContent}
            onChange={(v) => setTimelineFilter({ searchContent: v })}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Features tab ─────────────────────────────────────────────────────────────

// Friendly labels for known prefix groups
const PREFIX_LABELS: Record<string, string> = {
  data: 'Data',
  client: 'Client',
  server: 'Server',
  user: 'User',
  tag: 'Tags',
  device: 'Device',
  custom: 'Custom',
  feature: 'Feature',
}

function groupBitmaps(keys: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const key of keys) {
    const prefix = key.split('/')[0]
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(key)
  }
  return groups
}

function FeaturesTab() {
  const { state, setFeatureToggle } = useToolbox()
  const { availableBitmaps, bitmapsLoading, filters } = state
  const allOf = new Set(filters.features.allOf)
  const [search, setSearch] = useState('')

  if (bitmapsLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!availableBitmaps.length) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center py-10">
        No feature bitmaps found
      </div>
    )
  }

  const q = search.trim().toLowerCase()
  const filtered = q ? availableBitmaps.filter(k => k.toLowerCase().includes(q)) : availableBitmaps
  const groups = groupBitmaps(filtered)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search */}
      <div className="px-4 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search features…"
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md bg-muted border border-transparent focus:border-ring focus:outline-none"
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        {groups.size === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No matches</p>
        ) : (
          Array.from(groups.entries()).map(([prefix, keys]) => (
            <div key={prefix}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {PREFIX_LABELS[prefix] ?? prefix}
              </p>
              <div className="space-y-2">
                {keys.map((key) => (
                  <MD2Toggle
                    key={key}
                    label={key}
                    checked={allOf.has(key)}
                    onChange={(v) => setFeatureToggle(key, v)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── ToolsPanel ───────────────────────────────────────────────────────────────

interface ToolsPanelProps {
  onClose: () => void
}

export function ToolsPanel({ onClose }: ToolsPanelProps) {
  const { state, setToolsTab, saveFilters } = useToolbox()
  const { toolsTab, isDirty, isSaving, activeContextType } = state

  const tabs: { id: ToolsTab; label: string }[] = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'features', label: 'Features' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 bg-zinc-900 shrink-0">
        <span className="text-sm font-medium text-zinc-100">Tools</span>
        <div className="flex items-center gap-2">
          {isDirty && activeContextType !== null && (
            <button
              type="button"
              onClick={saveFilters}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save changes
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setToolsTab(tab.id)}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              toolsTab === tab.id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {toolsTab === 'timeline' && <TimelineTab />}
        {toolsTab === 'features' && <FeaturesTab />}
      </div>
    </div>
  )
}

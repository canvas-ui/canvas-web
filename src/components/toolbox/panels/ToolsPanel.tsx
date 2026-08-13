import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Save, Loader2, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox } from '@/components/toolbox/use-toolbox'
import { type ToolsTab, type FeatureMode } from '@/components/toolbox/toolbox-context'
import { useToast } from '@/components/ui/use-toast'
import { SCHEMA_META, ABSTRACTION_PREFIX, schemaMeta } from '@/lib/schema-meta'
import { MapTab } from './MapTab'
import { LensTab } from './LensTab'
import { TimelineTab } from './TimelineTab'

// ─── Features tab ─────────────────────────────────────────────────────────────

const PREFIX_LABELS: Record<string, string> = {
  data: 'Data',
  'data/backend': 'Backends',
  'data/mime': 'MIME types',
  'data/dataset': 'Datasets',
  client: 'Client',
  tag: 'Tags',
  device: 'Device',
  custom: 'Custom',
  feature: 'Feature',
}

// Virtual dataset: unstamped documents, always included unless deselected.
const DEFAULT_DATASET_KEY = 'data/dataset/default'

// Document-type (`data/schema/*`) schemas get a prominent, icon-led picker
// at the top of the Features tab — they are the filter users reach for most.
// The icon + label registry (SCHEMA_META / schemaMeta) is shared with the map
// filter, so a note reads the same everywhere (see @/lib/schema-meta).

function groupBitmaps(keys: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const key of keys) {
    // Backend-source tags and MIME-type tags each get their own group — they
    // answer a different question ("where does it live" / "what kind of file")
    // than the data/schema/* schema tags.
    const prefix = key.startsWith('data/backend/') ? 'data/backend'
      : key.startsWith('data/mime/') ? 'data/mime'
      : key.startsWith('data/dataset/') ? 'data/dataset'
      : key.split('/')[0]
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(key)
  }
  return groups
}

// Whole-row click cycles the filter mode: off → any → all → not → off.
const MODE_CYCLE: FeatureMode[] = ['off', 'anyOf', 'allOf', 'noneOf']
function nextMode(mode: FeatureMode): FeatureMode {
  return MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % MODE_CYCLE.length]
}

// Tri-state sigil control: any (OR) · all (+ gate) · not (! exclude).
// Mirrors synapsd feature algebra. Click the active mode to clear it.
const MODE_OPTS: { m: FeatureMode; label: string; on: string }[] = [
  { m: 'anyOf', label: 'any', on: 'bg-info text-info-foreground' },
  { m: 'allOf', label: 'all', on: 'bg-success text-success-foreground' },
  { m: 'noneOf', label: 'not', on: 'bg-destructive text-destructive-foreground' },
]

function ModeControl({ mode, onSet }: { mode: FeatureMode; onSet: (m: FeatureMode) => void }) {
  return (
    <div className="flex shrink-0 rounded-md overflow-hidden border border-border divide-x divide-border">
      {MODE_OPTS.map(o => (
        <button
          key={o.m}
          type="button"
          onClick={() => onSet(mode === o.m ? 'off' : o.m)}
          className={cn(
            'px-2 py-0.5 text-[11px] font-medium transition-colors',
            mode === o.m ? o.on : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          title={`${o.label} — ${o.m}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Big, tap-friendly document-type picker. Each tile cycles its filter mode
// (off → any → all → not) like the rows below, but with an icon + label and a
// mode badge, so the most-used filter is easy to hit — especially on mobile.
function SchemaTypePicker({
  keys,
  modeOf,
  onCycle,
}: {
  keys: string[]
  modeOf: (key: string) => FeatureMode
  onCycle: (key: string) => void
}) {
  if (!keys.length) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Document types
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {keys.map((key) => {
          const { label, icon: Icon } = schemaMeta(key)
          const mode = modeOf(key)
          const badge = MODE_OPTS.find((o) => o.m === mode)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onCycle(key)}
              title={`${key} — ${mode === 'off' ? 'tap to filter' : mode}`}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 min-h-[4.5rem] transition-colors select-none',
                mode === 'off'
                  ? 'border-border bg-muted/40 text-foreground hover:bg-muted'
                  : mode === 'anyOf' ? 'border-info bg-info/10 text-foreground'
                  : mode === 'allOf' ? 'border-success bg-success/10 text-foreground'
                  : 'border-destructive bg-destructive/10 text-foreground',
              )}
            >
              {badge && (
                <span className={cn('absolute right-1.5 top-1.5 rounded px-1 py-0.5 text-[9px] font-semibold leading-none', badge.on)}>
                  {badge.label}
                </span>
              )}
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs font-medium leading-none">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FeaturesTab() {
  const { state, setFeatureMode, clearFilters, hasActiveFilters, deleteBitmap, deleteDataset } = useToolbox()
  const { availableBitmaps, bitmapsLoading, filters } = state
  const allOf = new Set(filters.features.allOf)
  const anyOf = new Set(filters.features.anyOf)
  const noneOf = new Set(filters.features.noneOf)
  const modeOf = (key: string): FeatureMode =>
    allOf.has(key) ? 'allOf' : anyOf.has(key) ? 'anyOf' : noneOf.has(key) ? 'noneOf' : 'off'
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const { showToast } = useToast()

  const handleDelete = async (key: string) => {
    // Named datasets: lifecycle drop — deletes the STAMPED DOCUMENTS too.
    if (key.startsWith('data/dataset/') && key !== DEFAULT_DATASET_KEY) {
      const name = key.slice('data/dataset/'.length)
      if (!window.confirm(`Drop dataset "${name}"?\n\nALL documents stamped with this dataset will be PERMANENTLY DELETED. Documents in other datasets (or the default dataset) are unaffected. Re-ingesting recreates the dataset from scratch.`)) return
      setDeleting(key)
      try {
        const deleted = await deleteDataset(key)
        showToast({ title: 'Dataset dropped', description: `"${name}" — ${deleted} document(s) deleted` })
      } catch (e) {
        showToast({ title: 'Dataset drop failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
      } finally {
        setDeleting(null)
      }
      return
    }
    if (key.startsWith('data/')) return
    if (!window.confirm(`Delete bitmap "${key}"?\n\nThis removes the bitmap from the database. Documents are unaffected, but any features/filters relying on this bitmap will lose their grouping.`)) return
    setDeleting(key)
    try {
      await deleteBitmap(key)
      showToast({ title: 'Bitmap deleted', description: key })
    } catch (e) {
      showToast({ title: 'Delete failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

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
  // Pull the document-type schemas out into the prominent picker; group the rest.
  const schemaKeys = filtered.filter(k => k.startsWith(ABSTRACTION_PREFIX)).sort((a, b) => {
    const order = Object.keys(SCHEMA_META)
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib) || a.localeCompare(b)
  })
  const groups = groupBitmaps(filtered.filter(k => !k.startsWith(ABSTRACTION_PREFIX)))
  // The virtual 'default' dataset (unstamped documents) is engine-side and never
  // listed as a bitmap — synthesize its row whenever named datasets exist, so
  // the tri-state reads: default is on; 'not' hides it; 'all' shows only it.
  const datasetKeys = groups.get('data/dataset')
  if (datasetKeys && !datasetKeys.includes(DEFAULT_DATASET_KEY) && (!q || DEFAULT_DATASET_KEY.includes(q))) {
    datasetKeys.unshift(DEFAULT_DATASET_KEY)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search + clear */}
      <div className="px-4 py-2 border-b border-border shrink-0 space-y-2">
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
        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="flex items-center gap-1.5 w-full justify-center px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <X className="w-3 h-3" />
          Clear all filters
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        <SchemaTypePicker
          keys={schemaKeys}
          modeOf={modeOf}
          onCycle={(key) => setFeatureMode(key, nextMode(modeOf(key)))}
        />
        {groups.size === 0 && schemaKeys.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No matches</p>
        ) : (
          Array.from(groups.entries()).map(([prefix, keys]) => (
            <div key={prefix}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {PREFIX_LABELS[prefix] ?? prefix}
              </p>
              <div className="flex flex-col gap-1">
                {keys.map((key, rowIndex) => {
                  const isProtected = key.startsWith('data/')
                  const isVirtualDefault = key === DEFAULT_DATASET_KEY
                  const isNamedDataset = key.startsWith('data/dataset/') && !isVirtualDefault
                  const mode = modeOf(key)
                  return (
                    <div
                      key={key}
                      onClick={() => setFeatureMode(key, nextMode(mode))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFeatureMode(key, nextMode(mode)) } }}
                      className={cn(
                        // Grey/white zebra keeps long bitmap lists scannable;
                        // the whole row is clickable (cycles off→any→all→not).
                        'flex items-center gap-2 group rounded-md pl-2 pr-1.5 py-1 border-l-2 transition-colors cursor-pointer select-none',
                        rowIndex % 2 === 0 ? 'bg-muted/50' : 'bg-transparent',
                        'hover:bg-muted',
                        mode === 'off' ? 'border-l-transparent'
                          : mode === 'anyOf' ? 'border-l-blue-500 !bg-info/10'
                          : mode === 'allOf' ? 'border-l-emerald-500 !bg-success/10'
                          : 'border-l-rose-500 !bg-destructive/10',
                      )}
                    >
                      <span
                        className="flex-1 min-w-0 text-xs font-mono text-foreground truncate"
                        title={isVirtualDefault
                          ? 'Virtual dataset: documents not stamped with any dataset. Included by default — "not" hides them, "all" shows only them.'
                          : key}
                      >
                        {key}
                        {isVirtualDefault && <span className="ml-1.5 text-[10px] text-muted-foreground font-sans">virtual · on by default</span>}
                      </span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <ModeControl mode={mode} onSet={(m) => setFeatureMode(key, m)} />
                      </span>
                      {(!isProtected || isNamedDataset) && (
                        <button
                          type="button"
                          disabled={deleting === key}
                          onClick={(e) => { e.stopPropagation(); handleDelete(key) }}
                          className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 reveal-on-hover"
                          title={isNamedDataset
                            ? `Drop dataset "${key.slice('data/dataset/'.length)}" — DELETES its documents`
                            : `Delete bitmap "${key}" from database`}
                          aria-label={isNamedDataset ? `Drop dataset ${key}` : `Delete bitmap ${key}`}
                        >
                          {deleting === key
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── ToolsPanel ───────────────────────────────────────────────────────────────

export function ToolsPanel() {
  const { state, setToolsTab, saveFilters, clearFilters, hasActiveFilters } = useToolbox()
  const { toolsTab, isDirty, isSaving, activeContextType, savedSearchQuery } = state
  const location = useLocation()
  const currentSearchQuery = new URLSearchParams(location.search).get('q') || new URLSearchParams(location.search).get('search') || ''
  const searchDirty = activeContextType !== null && currentSearchQuery.trim() !== (savedSearchQuery || '')
  const canSave = activeContextType !== null && (isDirty || searchDirty)

  const tabs: { id: ToolsTab; label: string }[] = [
    { id: 'features', label: 'Features' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'map', label: 'Map' },
    { id: 'lens', label: 'Lens' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar — full-width underline tabs (matches the M2 tab style). The old
          dark title header was dropped; the toolbox top bar already names this
          panel, and Clear/Save live in the contextual action row below. */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setToolsTab(tab.id)}
            className={cn(
              'flex-1 py-2.5 text-xs transition-colors',
              toolsTab === tab.id
                ? '-mb-px border-b-2 border-foreground font-semibold text-foreground'
                : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contextual action row — only present when there's something to do. */}
      {(hasActiveFilters || canSave) && (
        <div className="flex items-center justify-end gap-2 border-b border-border px-3 py-1.5 shrink-0">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Clear all active filters"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
          {canSave && (
            <button
              type="button"
              onClick={saveFilters}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save filters
            </button>
          )}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {toolsTab === 'features' && <FeaturesTab />}
        {toolsTab === 'timeline' && <TimelineTab />}
        {toolsTab === 'map' && <MapTab />}
      {toolsTab === 'lens' && <LensTab />}
      </div>
    </div>
  )
}

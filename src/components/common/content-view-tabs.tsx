import { useState } from 'react'
import { Plus, X, LayoutList, Columns3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_VIEW, defaultBoardColumns, type ContentView, type ContentViewKind } from './content-views'

/**
 * The tab strip for a layer's named content-area views — model and
 * persistence rules live in content-views.ts.
 */

interface ContentViewTabsProps {
  views: ContentView[]
  activeId: string
  onSelect: (id: string) => void
  /** Persist the full view list (add/rename/remove/config changes). */
  onSave: (views: ContentView[], nextActiveId?: string) => void
  readOnly?: boolean
  className?: string
}

export function ContentViewTabs({ views, activeId, onSelect, onSave, readOnly = false, className }: ContentViewTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  const commitRename = () => {
    if (!editingId) return
    const name = draft.trim()
    if (name) onSave(views.map((v) => (v.id === editingId ? { ...v, name } : v)))
    setEditingId(null)
  }

  const addView = (kind: ContentViewKind) => {
    setAdding(false)
    const id = `view-${Date.now().toString(36)}`
    const name = kind === 'columns' ? 'Board' : `View ${views.length + 1}`
    const view: ContentView = kind === 'columns' ? { id, name, kind, columns: defaultBoardColumns() } : { id, name, kind }
    onSave([...views, view], id)
    // Straight into rename so "+ then type" names the tab in one motion.
    setEditingId(id)
    setDraft(name)
  }

  const removeView = (id: string) => {
    const next = views.filter((v) => v.id !== id)
    onSave(next.length > 0 ? next : [DEFAULT_VIEW], id === activeId ? (next[0]?.id ?? DEFAULT_VIEW.id) : undefined)
  }

  return (
    // Paper tabs: the ACTIVE tab connects through the header's main divider
    // (the accent line the host renders at the strip's bottom edge) — a
    // physical tab extending from a binder. The host draws the line; active
    // tabs sit on top of it (z-[1], opaque background), inactive tabs rest
    // above it (mb-[3px], the line runs beneath them uninterrupted).
    <div className={cn('flex min-w-0 items-end', className)}>
      {/* Only the tab list scrolls — the add control stays pinned outside the
          scroll region so it can never drift out of view. */}
      <div className="flex min-w-0 items-end gap-0.5 overflow-x-auto pt-1">
      {views.map((view) => {
        const isActive = view.id === activeId
        if (editingId === view.id) {
          return (
            <input
              key={view.id}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="relative z-[1] h-8 w-28 rounded-t-md border border-b-0 border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          )
        }
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onSelect(view.id)}
            onDoubleClick={() => { if (!readOnly) { setEditingId(view.id); setDraft(view.name) } }}
            title={readOnly ? view.name : `${view.name} — double-click to rename`}
            className={cn(
              'group flex h-8 shrink-0 items-center gap-1.5 rounded-t-md px-3 text-xs transition-colors',
              isActive
                // Opaque bg + no bottom border + z above the host's divider =
                // the tab visibly "opens into" the content below the line.
                ? 'relative z-[1] border border-b-0 border-border bg-background font-medium text-foreground'
                : 'mb-[3px] border border-b-0 border-transparent bg-muted/40 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {view.kind === 'columns' ? <Columns3 className="h-3 w-3 shrink-0" /> : <LayoutList className="h-3 w-3 shrink-0" />}
            <span className="max-w-32 truncate">{view.name}</span>
            {!readOnly && views.length > 1 && (
              // Chrome semantics: the ACTIVE tab always shows its close (the
              // only way it is reachable on touch); inactive tabs reveal it
              // on hover.
              <X
                className={cn(
                  'h-3 w-3 shrink-0 transition-opacity hover:text-destructive',
                  isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
                onClick={(e) => { e.stopPropagation(); removeView(view.id) }}
              />
            )}
          </button>
        )
      })}
      </div>

      {!readOnly && (adding ? (
        <span className="relative z-[1] mb-1.5 ml-1 flex shrink-0 items-center gap-1">
          {/* Deleted the default "All" view? Offer it back verbatim. */}
          {!views.some((v) => v.id === DEFAULT_VIEW.id) && (
            <button
              type="button"
              onClick={() => { setAdding(false); onSave([{ ...DEFAULT_VIEW }, ...views], DEFAULT_VIEW.id) }}
              className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <LayoutList className="h-3 w-3" /> All
            </button>
          )}
          <button
            type="button"
            onClick={() => addView('documents')}
            className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <LayoutList className="h-3 w-3" /> List
          </button>
          <button
            type="button"
            onClick={() => addView('columns')}
            className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <Columns3 className="h-3 w-3" /> Board
          </button>
          <button type="button" onClick={() => setAdding(false)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Cancel">
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          title="Add view"
          aria-label="Add view"
          className="relative z-[1] mb-1.5 ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}

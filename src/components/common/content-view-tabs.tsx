import { useState } from 'react'
import { Plus, X, LayoutList, Columns3, ListTodo, StickyNote, PanelRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { relativeLuminance } from '@/utils/color'
import { CONTENT_APPS, DEFAULT_VIEW, defaultBoardColumns, type ContentAppId, type ContentView, type ContentViewKind } from './content-views'

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
  /**
   * Workspace/context accent the host's divider is painted with — the active
   * tab fills with it so it visibly grows out of the line. A user-picked hex,
   * not a theme token: text contrast is derived from its own luminance.
   */
  accentColor?: string
  /** Show a hover affordance that opens the tab's view in a side pane. */
  onOpenToSide?: (viewId: string) => void
}

export function ContentViewTabs({ views, activeId, onSelect, onSave, readOnly = false, className, accentColor, onOpenToSide }: ContentViewTabsProps) {
  // Full-strength contrast (unlike onAccentTextClass's muted glyphs): the tab
  // label is primary UI, so it goes plain black/white on the accent fill.
  const accentTextClass = accentColor
    ? ((relativeLuminance(accentColor) ?? 0) > 0.5 ? 'text-black' : 'text-white')
    : ''
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  // Native HTML5 drag-to-reorder (same approach as MenuTreeView): the order
  // is persisted once, on drop.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)

  const endDrag = () => { setDragId(null); setDropTarget(null) }

  const handleDrop = () => {
    if (dragId && dropTarget && dragId !== dropTarget.id) {
      const dragged = views.find((v) => v.id === dragId)
      const next = views.filter((v) => v.id !== dragId)
      const idx = next.findIndex((v) => v.id === dropTarget.id)
      if (dragged && idx >= 0) {
        next.splice(dropTarget.before ? idx : idx + 1, 0, dragged)
        if (next.some((v, i) => v.id !== views[i].id)) onSave(next)
      }
    }
    endDrag()
  }

  const commitRename = () => {
    if (!editingId) return
    const name = draft.trim()
    if (name) onSave(views.map((v) => (v.id === editingId ? { ...v, name } : v)))
    setEditingId(null)
  }

  const addView = (kind: ContentViewKind, app?: ContentAppId) => {
    setAdding(false)
    const id = `view-${Date.now().toString(36)}`
    const name = kind === 'columns' ? 'Board'
      : kind === 'app' ? (CONTENT_APPS.find((a) => a.id === app)?.label ?? 'App')
      : `View ${views.length + 1}`
    const view: ContentView = kind === 'columns' ? { id, name, kind, columns: defaultBoardColumns() }
      : kind === 'app' ? { id, name, kind, app }
      : { id, name, kind }
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
            title={readOnly ? view.name : `${view.name} — double-click to rename, drag to reorder`}
            draggable={!readOnly}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', view.name)
              e.dataTransfer.effectAllowed = 'move'
              setDragId(view.id)
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === view.id) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const rect = e.currentTarget.getBoundingClientRect()
              const before = e.clientX < rect.left + rect.width / 2
              setDropTarget((prev) => (prev?.id === view.id && prev.before === before ? prev : { id: view.id, before }))
            }}
            onDrop={(e) => { e.preventDefault(); handleDrop() }}
            onDragEnd={endDrag}
            className={cn(
              'group flex h-8 shrink-0 items-center gap-1.5 rounded-t-md px-3 text-xs transition-colors',
              isActive
                // Opaque bg + no bottom border + z above the host's divider =
                // the tab visibly "opens into" the content below the line.
                // With an accent it fills with the divider's own color.
                ? cn('relative z-[1] border border-b-0 font-medium',
                    accentColor ? accentTextClass : 'border-border bg-background text-foreground')
                : 'mb-[3px] border border-b-0 border-transparent bg-muted/40 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              dragId === view.id && 'opacity-50',
              // Insertion indicator on the side the drop would land on.
              dropTarget?.id === view.id && (dropTarget.before ? 'border-l-2 border-l-primary' : 'border-r-2 border-r-primary'),
            )}
            // Inline borderColor would trump the drop-indicator classes, so
            // it is skipped while this tab is the drag target.
            style={isActive && accentColor
              ? { backgroundColor: accentColor, ...(dropTarget?.id === view.id ? {} : { borderColor: accentColor }) }
              : undefined}
          >
            {view.kind === 'columns' ? <Columns3 className="h-3 w-3 shrink-0" />
              : view.kind === 'app' ? (view.app === 'todos' ? <ListTodo className="h-3 w-3 shrink-0" /> : <StickyNote className="h-3 w-3 shrink-0" />)
              : <LayoutList className="h-3 w-3 shrink-0" />}
            <span className="max-w-32 truncate">{view.name}</span>
            {onOpenToSide && (
              <PanelRight
                className="h-3 w-3 shrink-0 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-60"
                aria-label="Open to the side"
                onClick={(e) => { e.stopPropagation(); onOpenToSide(view.id) }}
              />
            )}
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
          {CONTENT_APPS.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => addView('app', app.id)}
              className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              {app.id === 'todos' ? <ListTodo className="h-3 w-3" /> : <StickyNote className="h-3 w-3" />} {app.label}
            </button>
          ))}
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

import { useEffect, useRef, useState } from 'react'
import { Plus, X, LayoutList, Columns3, ListTodo, StickyNote, PanelRight, SlidersHorizontal, Brush, ScanEye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { onAccentSolidTextClass } from '@/utils/color'
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
  /** Workspace/context accent shared by the divider and active tab. */
  accentColor?: string
  /** Show a hover affordance that opens the tab's view in a side pane. */
  onOpenToSide?: (viewId: string) => void
}

const appIcons = { todos: ListTodo, 'todo-app': ListTodo, notes: StickyNote, 'notes-app': StickyNote, filters: SlidersHorizontal, sketch: Brush, lens: ScanEye }

export function ContentViewTabs({ views, activeId, onSelect, onSave, readOnly = false, className, accentColor, onOpenToSide }: ContentViewTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  // Native HTML5 drag-to-reorder (same approach as MenuTreeView): the order
  // is persisted once, on drop.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)

  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || strip.scrollWidth <= strip.clientWidth) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1
      event.preventDefault()
      strip.scrollLeft += delta * scale
    }
    strip.addEventListener('wheel', wheel, { passive: false })
    return () => strip.removeEventListener('wheel', wheel)
  }, [])

  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('[aria-pressed="true"], input')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, editingId])

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
      : 'List'
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
    // All tabs share one borderless shape. The divider runs over inactive
    // fills; the active workspace fill joins it from above.
    <div className={cn('relative flex h-full min-w-0 items-end', className)}>
      {/* Only the tab list scrolls — the add control stays pinned outside the
          scroll region so it can never drift out of view. */}
      <div ref={stripRef} className="flex min-w-0 items-end gap-0.5 overflow-x-auto overscroll-x-contain pt-1 [scrollbar-width:none]">
      {views.map((view) => {
        const isActive = view.id === activeId
        const ViewIcon = view.kind === 'columns' ? Columns3 : view.kind === 'app' && view.app ? appIcons[view.app] : LayoutList
        if (editingId === view.id) {
          return (
            <input
              key={view.id}
              autoFocus
              aria-label="Tab name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
              className={cn('relative h-[2.3rem] w-28 shrink-0 rounded-t-[.5rem] border-0 px-3 pb-1 text-xs outline-none ring-0',
                isActive ? cn('z-[2] bg-background font-medium', accentColor ? onAccentSolidTextClass(accentColor) : 'text-foreground') : 'bg-muted text-muted-foreground')}
              style={{ backgroundColor: isActive ? accentColor : undefined }}
            />
          )
        }
        return (
          <button
            key={view.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(view.id)}
            onDoubleClick={() => { if (!readOnly) { setEditingId(view.id); setDraft(view.name) } }}
            title={readOnly ? view.name : `${view.name}: double-click to rename, drag to reorder`}
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
              'group relative flex h-[2.3rem] shrink-0 items-center gap-1.5 rounded-t-[.5rem] border-0 px-3 pb-1 text-xs transition-colors',
              isActive
                // The workspace fill joins the divider without a bottom seam.
                ? cn('z-[2] bg-background font-medium', accentColor ? onAccentSolidTextClass(accentColor) : 'text-foreground')
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
              dragId === view.id && 'opacity-50',
            )}
            // An inset drop indicator does not shift the tab's contents.
            style={{
              backgroundColor: isActive ? accentColor : undefined,
              boxShadow: dropTarget?.id === view.id ? `inset ${dropTarget.before ? '2px' : '-2px'} 0 0 var(--primary)` : undefined,
            }}
          >
            <ViewIcon className="h-3 w-3 shrink-0" />
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
        <span className="absolute left-0 top-full z-30 flex w-full min-w-64 flex-wrap items-center gap-2 rounded-b-xl border bg-card p-2 shadow-lg">
          <button
            type="button"
            onClick={() => addView('documents')}
            className="flex h-10 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <LayoutList className="h-3 w-3" /> List
          </button>
          <button
            type="button"
            onClick={() => addView('columns')}
            className="flex h-10 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <Columns3 className="h-3 w-3" /> Board
          </button>
          {CONTENT_APPS.map((app) => {
            const AppIcon = appIcons[app.id]
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => addView('app', app.id)}
                className="flex h-10 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                <AppIcon className="h-3 w-3" /> {app.label}
              </button>
            )
          })}
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
          className="relative ml-1 flex h-[2.3rem] w-10 shrink-0 items-center justify-center rounded-md pb-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}

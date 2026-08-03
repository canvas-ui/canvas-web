import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GripVertical, LayoutDashboard, PinOff, ExternalLink, Maximize2, Minimize2, Minus } from 'lucide-react'
import { CanvasGrid } from '@/components/canvas/CanvasGrid'
import { findTreeNodeByPath, getWorkspaceTreeByName } from '@/services/workspace'
import type { PinnedCanvas } from '@/services/user-config'
import type { TreeNode } from '@/types/workspace'

type Resolved = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; node: TreeNode }

// The pin stores an address, not a snapshot: the canvas is re-resolved against
// the live tree on every mount, so widget/filter edits made in the workspace
// show up here without the pin ever being rewritten. The cost is that a renamed
// or deleted canvas resolves to `missing` rather than following the rename.
function usePinnedCanvas(pin: PinnedCanvas): Resolved {
  const addressKey = `${pin.workspaceName}\0${pin.treeName}\0${pin.path}`
  // Keyed by the address rather than reset on change: a stale result from the
  // previously pinned address can never be shown, without a setState in the effect.
  const [loaded, setLoaded] = useState<{ key: string; node: TreeNode | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    getWorkspaceTreeByName(pin.workspaceName, pin.treeName)
      .then((res) => {
        if (!cancelled) setLoaded({ key: addressKey, node: findTreeNodeByPath(res.payload, pin.path) })
      })
      .catch(() => { if (!cancelled) setLoaded({ key: addressKey, node: null }) })
    return () => { cancelled = true }
  }, [addressKey, pin.workspaceName, pin.treeName, pin.path])

  if (!loaded || loaded.key !== addressKey) return { state: 'loading' }
  return loaded.node ? { state: 'ready', node: loaded.node } : { state: 'missing' }
}

function canvasUrl(pin: PinnedCanvas) {
  const base = `/workspaces/${encodeURIComponent(pin.workspaceName)}`
  const path = pin.path.replace(/^\//, '')
  return pin.treeName === 'context'
    ? `${base}/path/${path}`
    : `${base}/trees/${encodeURIComponent(pin.treeName)}/path/${path}`
}

// HTML5 drag-and-drop payload type for tile reordering. A custom type keeps
// foreign drags (files, text selections) from lighting up drop indicators.
export const PIN_DRAG_TYPE = 'application/x-canvas-pin'

export function PinnedCanvasTile({ pin, onUnpin, onMinimize, onDropPin }: {
  pin: PinnedCanvas
  onUnpin: () => void
  /** Collapse the tile into the home tab strip (tile unmounts, pin untouched). */
  onMinimize?: () => void
  /** Another tile was dropped on this one; insert it before/after this pin.
      Presence also enables dragging this tile (by its header). */
  onDropPin?: (draggedId: string, after: boolean) => void
}) {
  const resolved = usePinnedCanvas(pin)
  const [isFilled, setIsFilled] = useState(false)
  // 'before' | 'after' while a pin drag hovers this tile (drop indicator side).
  const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null)

  const canDrag = Boolean(onDropPin) && !isFilled

  // Left half of the tile = insert before, right half = insert after — the
  // home grid flows rows of columns, so the horizontal midpoint is the
  // natural split.
  const sideOf = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientX > rect.left + rect.width / 2 ? 'after' as const : 'before' as const
  }

  const dragProps = canDrag ? {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(PIN_DRAG_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropSide(sideOf(e))
    },
    onDragLeave: () => setDropSide(null),
    onDrop: (e: React.DragEvent) => {
      const draggedId = e.dataTransfer.getData(PIN_DRAG_TYPE)
      setDropSide(null)
      if (!draggedId || draggedId === pin.id) return
      e.preventDefault()
      onDropPin?.(draggedId, sideOf(e) === 'after')
    },
  } : {}
  const node = resolved.state === 'ready' ? resolved.node : null
  const label = node?.label || pin.label || pin.path.split('/').filter(Boolean).pop() || 'Canvas'
  const color = node?.color

  // Escape leaves the filled view - the tile covers the whole viewport, chrome
  // included, so the restore button is the only other way out.
  useEffect(() => {
    if (!isFilled) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFilled(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFilled])

  return (
    // Height comes from the grid row (stretched to the bottom of the view).
    // Filled: fixed to the viewport above the rail (z-rail) and the mobile
    // drawers (z-side). Nothing in the shell transforms, so `fixed` resolves
    // against the viewport rather than the content area.
    <section
      {...dragProps}
      className={
        isFilled
          ? 'fixed inset-0 z-picker flex flex-col bg-background'
          : `flex flex-col rounded-lg border bg-background overflow-hidden min-h-0 min-w-0 ${
              dropSide ? 'ring-2 ring-primary/60' : ''
            }`
      }
    >
      <header
        draggable={canDrag}
        onDragStart={canDrag ? (e) => {
          e.dataTransfer.setData(PIN_DRAG_TYPE, pin.id)
          e.dataTransfer.effectAllowed = 'move'
        } : undefined}
        className={`flex items-center gap-2 px-3 py-2 border-b bg-muted/20 shrink-0 min-w-0 ${
          canDrag ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        {canDrag && <GripVertical className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" aria-hidden />}
        {color && <div className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
        <LayoutDashboard className="w-4 h-4 shrink-0 text-primary" />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-semibold leading-tight truncate">{label}</span>
          <span className="text-[11px] text-muted-foreground truncate leading-tight font-mono">
            {pin.workspaceName}://{pin.path.replace(/^\//, '')}
          </span>
        </div>
        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            title="Minimize to tab bar"
            aria-label="Minimize to tab bar"
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsFilled((v) => !v)}
          aria-pressed={isFilled}
          title={isFilled ? 'Restore tile (Esc)' : 'Fill view area'}
          aria-label={isFilled ? 'Restore tile' : 'Fill view area'}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {isFilled ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <Link
          to={canvasUrl(pin)}
          title="Open in workspace"
          aria-label="Open in workspace"
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
        <button
          type="button"
          onClick={onUnpin}
          title="Unpin from home"
          aria-label="Unpin from home"
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <PinOff className="w-3.5 h-3.5" />
        </button>
      </header>

      <div className="flex-1 min-h-0">
        {resolved.state === 'loading' && (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Loading…</div>
        )}
        {resolved.state === 'missing' && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <p className="text-sm text-muted-foreground">This canvas is no longer available.</p>
            <p className="text-xs text-muted-foreground">It may have been renamed, moved or deleted.</p>
            <button type="button" onClick={onUnpin} className="mt-1 px-2.5 py-1 text-xs border rounded-md hover:bg-accent">
              Remove pin
            </button>
          </div>
        )}
        {resolved.state === 'ready' && (
          <CanvasGrid
            workspaceId={pin.workspaceName}
            treeName={pin.treeName}
            path={pin.path}
            layerId={resolved.node.id}
            querySpec={resolved.node.querySpec}
            metadata={resolved.node.metadata}
            // Home is a dashboard, not an editor: read-only keeps the layout
            // authoritative in the workspace and drops the add/save toolbar.
            readOnly
          />
        )}
      </div>
    </section>
  )
}

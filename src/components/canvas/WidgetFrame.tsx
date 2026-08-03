import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2, Expand, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Shared chrome for every widget: a draggable title bar (the `.canvas-drag-handle`
// is what react-grid-layout grabs), a maximize toggle (fills the viewport), and
// a remove button. Controls carry `.canvas-no-drag` so clicking them never
// starts a drag. Widgets stay dumb and only render their own body.
export function WidgetFrame({
  title,
  icon: Icon,
  onRemove,
  onFill,
  readOnly = false,
  children,
}: {
  title: string
  icon?: LucideIcon
  onRemove?: () => void
  /** Expand this widget to fill the whole canvas (single-widget canvas setup). */
  onFill?: () => void
  readOnly?: boolean
  children: ReactNode
}) {
  const [maximized, setMaximized] = useState(false)
  // In-app: maximize fills the CONTENT AREA (portal into #content-area).
  // Public share pages have no #content-area → fall back to full viewport.
  const contentHost = maximized ? document.getElementById('content-area') : null

  const frame = (
    <div
      className={
        maximized
          ? (contentHost
              ? 'absolute inset-0 z-40 flex flex-col bg-background'
              : 'fixed inset-0 z-50 flex flex-col bg-background')
          : 'flex flex-col h-full rounded-lg border bg-background overflow-hidden'
      }
    >
      <div className="canvas-drag-handle flex items-center gap-2 px-2 py-1 border-b bg-muted/30 cursor-move select-none">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <span className="text-xs font-medium truncate flex-1">{title}</span>
        {!readOnly && onFill && !maximized && (
          <button
            type="button"
            onClick={onFill}
            className="canvas-no-drag shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent touch-target"
            title="Fill canvas"
          >
            <Expand className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setMaximized((v) => !v)}
          className="canvas-no-drag shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent touch-target"
          title={maximized ? 'Restore' : 'Full screen'}
        >
          {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        {!readOnly && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="canvas-no-drag shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 touch-target"
            title="Remove widget"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2">{children}</div>
    </div>
  )

  // Maximized: portal OUT of the grid item — inside react-grid-layout the
  // ancestor transform hijacks `fixed`, so "full screen" only covered the cell.
  return maximized ? createPortal(frame, contentHost ?? document.body) : frame
}

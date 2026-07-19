import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import { Plus, Save } from 'lucide-react'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './canvas-grid.css'
import './widgets'
import { getWidget, listWidgets } from './widget-registry'
import { WidgetFrame } from './WidgetFrame'
import { DEFAULT_TIMELINE_SORT, type TimelineSort } from './widgets/sort-control'
import type { WidgetCanvasContext, WidgetConfig, WidgetDocumentsResult, WidgetFetchOpts } from './widget-types'
import { saveCanvasUi, getCanvasPathDocuments } from '@/services/workspace'
import type { CanvasQuerySpec, Document, LayerMetadata } from '@/types/workspace'

const ReactGridLayout = WidthProvider(GridLayout)
const COLS = 12
// A FIXED cell height (metro-style), so resizing a widget taller changes its
// pixel height by an absolute, predictable amount and the grid scrolls when it
// outgrows the host. This deliberately replaces the old "scale rowHeight to
// exactly fill the host" behaviour: dividing the host height by the live row
// count made every vertical resize a no-op for the bottom widget (its pixel
// height resolved to host-2*margin regardless of row span). Widgets that should
// still stretch to the bottom use the fillH flag / "Fill canvas" button, which
// grows them to the host's row count (see hostRows).
const ROW_HEIGHT = 80
const NARROW_ROW_HEIGHT = 40
const GRID_MARGIN: [number, number] = [12, 12]

type CanvasLayoutItem = Layout & { fillW?: boolean; fillH?: boolean }

type WidgetEntry = { type: string; config: WidgetConfig }
type WidgetMap = Record<string, WidgetEntry>

interface CanvasUi {
  layout: CanvasLayoutItem[]
  widgets: WidgetMap
}

function gridExtent(layout: CanvasLayoutItem[]) {
  return Math.max(1, ...layout.map((item) => item.y + item.h))
}

function inferFillFlags(next: CanvasLayoutItem[], prev?: CanvasLayoutItem[]): CanvasLayoutItem[] {
  const extent = gridExtent(next)
  return next.map((item) => {
    const prevItem = prev?.find((p) => p.i === item.i)
    const atBottom = item.y + item.h >= extent
    const grew = prevItem != null && item.h > prevItem.h
    return {
      ...item,
      fillW: item.w >= COLS,
      fillH: item.fillH === true || (atBottom && grew),
    }
  })
}

function itemsOverlap(a: CanvasLayoutItem, b: CanvasLayoutItem) {
  return a.x < b.x + b.w && a.x + a.w > b.x
}

// `hostRows` is how many rows fit in the visible host. A fillH widget that is
// the last one in its column band grows to reach it (fill to the bottom);
// without it, a fillH widget only grows to the next widget below. When the host
// hasn't been measured yet (0) we fall back to the grid's own extent.
function applyFillLayout(layout: CanvasLayoutItem[], hostRows = 0): CanvasLayoutItem[] {
  const extent = gridExtent(layout)
  const bottomRows = hostRows > extent ? hostRows : extent
  return layout.map((item) => {
    const fillW = item.fillW ?? item.w >= COLS
    const placed = { ...item, x: fillW ? 0 : item.x, w: fillW ? COLS : item.w }
    let h = item.h
    if (item.fillH) {
      // Grow to the next widget below (same column band), not over it; if none,
      // grow to the host bottom.
      const belowY = layout.reduce<number | null>((min, other) => {
        if (other.i === item.i || other.y <= item.y || !itemsOverlap(placed, other)) return min
        return min == null || other.y < min ? other.y : min
      }, null)
      h = Math.max(item.minH ?? 1, (belowY ?? bottomRows) - item.y)
    }
    return { ...placed, h }
  })
}

// How many whole rows fit in the visible host. react-grid-layout's
// containerPadding (defaults to `margin`) adds a gutter above the first row and
// below the last, so n rows occupy n*ROW_HEIGHT + (n+1)*marginY.
function hostRowCapacity(height: number) {
  const marginY = GRID_MARGIN[1]
  return Math.max(1, Math.floor((height - marginY) / (ROW_HEIGHT + marginY)))
}

// Narrow-viewport threshold below which the grid collapses to a single
// stacked column (widgets full-width, top-to-bottom by their grid position).
const NARROW_WIDTH = 640

function stackLayout(layout: CanvasLayoutItem[]): CanvasLayoutItem[] {
  const sorted = [...applyFillLayout(layout)].sort((a, b) => (a.y - b.y) || (a.x - b.x))
  let y = 0
  return sorted.map((item) => {
    const h = Math.max(item.h, item.minH ?? 1)
    const stacked = { ...item, x: 0, w: COLS, y, h }
    y += h
    return stacked
  })
}

function readUi(metadata?: LayerMetadata): CanvasUi {
  const ui = (metadata?.ui ?? {}) as Partial<CanvasUi>
  const raw = Array.isArray(ui.layout) ? ui.layout as CanvasLayoutItem[] : []
  return {
    // Re-derive fill flags from saved geometry so shared/read-only views match edit mode.
    layout: raw.length ? inferFillFlags(raw, raw) : [],
    widgets: (ui.widgets && typeof ui.widgets === 'object') ? ui.widgets as WidgetMap : {},
  }
}

export function CanvasGrid({
  workspaceId,
  treeName,
  path,
  layerId,
  querySpec,
  metadata,
  isLocked = false,
  readOnly = false,
  interactive = true,
  fetchDocuments,
  onSaved,
}: {
  workspaceId: string
  treeName: string
  path: string
  layerId: string
  querySpec?: CanvasQuerySpec
  metadata?: LayerMetadata
  /** Kept for callers; shared canvases stay structurally locked in the tree but remain widget-editable. */
  isLocked?: boolean
  readOnly?: boolean
  /** Allow document-level controls (todo toggle, etc.). Defaults true for the
   *  authenticated app; the public share passes false. Independent of readOnly. */
  interactive?: boolean
  fetchDocuments?: (opts?: WidgetFetchOpts) => Promise<WidgetDocumentsResult>
  onSaved?: () => void
}) {
  void isLocked
  const editable = !readOnly
  const initial = useMemo(() => readUi(metadata), [metadata])
  const [layout, setLayout] = useState<CanvasLayoutItem[]>(initial.layout)
  const [widgets, setWidgets] = useState<WidgetMap>(initial.widgets)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isNarrow, setIsNarrow] = useState(false)
  // Rows that fit the visible host — only used to let a fillH widget reach the
  // bottom; the row height itself is fixed.
  const [hostRows, setHostRows] = useState(0)
  // Canvas-level view order. Seeded from the stored querySpec so widgets show
  // the baked sort; edited via a widget's sort control and persisted back into
  // querySpec.sort on Save (only when actually touched → sortDirtyRef).
  const [canvasSort, setCanvasSortState] = useState<TimelineSort>(() => querySpec?.sort ?? DEFAULT_TIMELINE_SORT)
  const sortDirtyRef = useRef(false)
  const gridHostRef = useRef<HTMLDivElement>(null)

  const latest = useRef<CanvasUi>({ layout: initial.layout, widgets: initial.widgets })
  // Narrow viewports (mobile) collapse to a stacked single column: the saved
  // 12-col layout is unusable there and widgets never filled the area.
  const displayLayout = useMemo(
    () => (isNarrow ? stackLayout(layout) : applyFillLayout(layout, hostRows)),
    [layout, isNarrow, hostRows],
  )
  const rowHeight = isNarrow ? NARROW_ROW_HEIGHT : ROW_HEIGHT
  const savedUiKey = useMemo(() => JSON.stringify(metadata?.ui ?? null), [metadata?.ui])

  // Reset local state when navigating to a different canvas.
  useEffect(() => {
    const next = readUi(metadata)
    setLayout(next.layout)
    setWidgets(next.widgets)
    latest.current = next
    setCanvasSortState(querySpec?.sort ?? DEFAULT_TIMELINE_SORT)
    sortDirtyRef.current = false
    setIsDirty(false)
  }, [path, layerId])

  // Public/read-only views reload metadata over the socket; keep in sync without remounting.
  useEffect(() => {
    if (!readOnly) return
    const next = readUi(metadata)
    setLayout(next.layout)
    setWidgets(next.widgets)
    latest.current = next
  }, [readOnly, savedUiKey, metadata])

  // Track the narrow (stacked) breakpoint and how many rows fit the host, so a
  // fillH widget can stretch to the bottom. The row height itself is fixed.
  useEffect(() => {
    const host = gridHostRef.current
    if (!host || layout.length === 0) return

    const measure = () => {
      const height = host.clientHeight
      const narrow = host.clientWidth > 0 && host.clientWidth < NARROW_WIDTH
      setIsNarrow(narrow)
      if (height > 0) setHostRows(hostRowCapacity(height))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [layout])

  const setCanvasSort = useCallback((sort: TimelineSort) => {
    setCanvasSortState(sort)
    sortDirtyRef.current = true
    setIsDirty(true)
  }, [])

  const canvas: WidgetCanvasContext = useMemo(
    () => ({
      workspaceId,
      treeName,
      path,
      layerId,
      querySpec,
      readOnly: !editable,
      interactive,
      canvasSort,
      setCanvasSort: editable ? setCanvasSort : undefined,
      fetchDocuments: fetchDocuments ?? (async (opts) => {
        const res = await getCanvasPathDocuments(workspaceId, path, treeName, opts)
        return { payload: (res.payload as Document[]) || [], count: res.count, totalCount: res.totalCount }
      }),
    }),
    [workspaceId, treeName, path, layerId, querySpec, editable, interactive, fetchDocuments, canvasSort, setCanvasSort],
  )

  const markDirty = useCallback((nextLayout: CanvasLayoutItem[], nextWidgets: WidgetMap) => {
    latest.current = { layout: nextLayout, widgets: nextWidgets }
    setIsDirty(true)
  }, [])

  const normalizeLayout = useCallback((next: Layout[], prev: CanvasLayoutItem[]) => {
    return inferFillFlags(next as CanvasLayoutItem[], prev)
  }, [])

  const saveNow = useCallback(async () => {
    if (!editable || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const ui = {
        ...latest.current,
        layout: inferFillFlags(latest.current.layout, latest.current.layout),
      }
      latest.current = ui
      // Bake a widget-changed view order into the canvas querySpec so the frozen
      // view (folder listing + public shares) sorts identically. Only send it
      // when touched, to avoid clobbering a folder-view-saved sort.
      const nextQuerySpec = sortDirtyRef.current
        ? { ...(querySpec || {}), sort: canvasSort.sortBy ? canvasSort : null }
        : undefined
      await saveCanvasUi(workspaceId, path, treeName, { ...(metadata || {}), ui }, nextQuerySpec)
      sortDirtyRef.current = false
      setIsDirty(false)
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh', {
        detail: { workspaceName: workspaceId, treeName },
      }))
      onSaved?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      setSaveError(message)
      console.error('Failed to save canvas layout:', err)
    } finally {
      setIsSaving(false)
    }
  }, [editable, isSaving, workspaceId, path, treeName, metadata, onSaved, querySpec, canvasSort])

  const handleLayoutChange = useCallback((next: Layout[]) => {
    // Never persist the derived stacked (narrow) layout over the saved grid.
    if (!editable || isNarrow) return
    setLayout((prev) => {
      const normalized = normalizeLayout(next, prev)
      markDirty(normalized, widgets)
      return normalized
    })
  }, [editable, isNarrow, normalizeLayout, markDirty, widgets])

  const addWidget = useCallback((type: string) => {
    const def = getWidget(type)
    if (!def) return
    const id = crypto.randomUUID()
    const { w, h, minW, minH, maxW, maxH } = def.defaultSize
    const nextLayout: CanvasLayoutItem[] = [...layout, { i: id, x: 0, y: Infinity, w, h, minW, minH, maxW, maxH, fillW: w >= COLS }]
    const nextWidgets = { ...widgets, [id]: { type, config: { ...(def.defaultConfig || {}) } } }
    setLayout(nextLayout)
    setWidgets(nextWidgets)
    setMenuOpen(false)
    markDirty(nextLayout, nextWidgets)
  }, [layout, widgets, markDirty])

  const removeWidget = useCallback((id: string) => {
    const nextLayout = layout.filter((item) => item.i !== id)
    const nextWidgets = { ...widgets }
    delete nextWidgets[id]
    setLayout(nextLayout)
    setWidgets(nextWidgets)
    markDirty(nextLayout, nextWidgets)
  }, [layout, widgets, markDirty])

  // Expand one widget to occupy the whole canvas (full width + height), pushing
  // any other widgets below it. Makes a single-widget canvas trivial to set up.
  const fillWidget = useCallback((id: string) => {
    if (!editable) return
    setLayout((prev) => {
      const target = prev.find((item) => item.i === id)
      if (!target) return prev
      // Fill the whole VISIBLE canvas: as many rows as fit the host (row height
      // is fixed now, so this is what "cover the canvas" means), falling back to
      // a sensible span before the host is measured.
      const h = Math.max(target.minH ?? 1, hostRows || target.h, 4)
      const filled: CanvasLayoutItem = { ...target, x: 0, y: 0, w: COLS, h, fillW: true, fillH: true }
      const pushed = prev
        .filter((item) => item.i !== id)
        .map((item) => ({ ...item, y: item.y + h }))
      const next = inferFillFlags([filled, ...pushed], prev)
      markDirty(next, widgets)
      return next
    })
  }, [editable, markDirty, widgets, hostRows])

  const setWidgetConfig = useCallback((id: string, config: WidgetConfig) => {
    setWidgets((prev) => {
      const next = { ...prev, [id]: { ...prev[id], config } }
      markDirty(layout, next)
      return next
    })
  }, [layout, markDirty])

  const ids = Object.keys(widgets)

  return (
    <div className="flex flex-col h-full min-h-0">
      {editable && (
      <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-accent"
          >
            <Plus className="w-3.5 h-3.5" />
            Add widget
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 z-20 w-48 rounded-md border bg-popover shadow-md py-1">
              {listWidgets().map((def) => (
                <button
                  key={def.type}
                  type="button"
                  onClick={() => addWidget(def.type)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent"
                >
                  <def.icon className="w-3.5 h-3.5 text-muted-foreground" />
                  {def.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={saveNow}
          disabled={!isDirty || isSaving}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-accent disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <span className="text-xs text-muted-foreground">
          {ids.length} widget{ids.length === 1 ? '' : 's'}
          {isDirty ? ' · unsaved' : ''}
          {saveError ? ` · ${saveError}` : ''}
        </span>
      </div>
      )}

      {/* Scrollable on y: with a fixed ROW_HEIGHT the grid is as tall as its
          rows demand, which may exceed the host (a home tile, a short window, a
          canvas the user grew) — it scrolls instead of clipping. When the rows
          fit, no scrollbar appears.
          overflow-x-hidden is required, not cosmetic: an unset overflow-x
          computes to `auto` once overflow-y is set, and that x-scrollbar eats
          16px of clientHeight -> the grid no longer fits -> a y-scrollbar
          appears on every canvas. The grid never needs to scroll sideways (12
          columns, measured to the host width), so pin it shut. */}
      <div ref={gridHostRef} className="canvas-grid-host flex-1 min-h-0 bg-muted/10 overflow-y-auto overflow-x-hidden">
        {ids.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>No widgets yet.</p>
            {editable && <p className="text-xs">Use “Add widget” to place one on the canvas.</p>}
          </div>
        ) : (
          <ReactGridLayout
            className="layout"
            layout={displayLayout}
            cols={COLS}
            rowHeight={rowHeight}
            margin={GRID_MARGIN}
            isDraggable={editable && !isNarrow}
            isResizable={editable && !isNarrow}
            // Edge handles too (not just the SE corner): dragging the bottom
            // edge to resize vertically is the metro-tile gesture users expect.
            resizeHandles={['s', 'e', 'se']}
            draggableHandle=".canvas-drag-handle"
            draggableCancel=".canvas-no-drag"
            onLayoutChange={handleLayoutChange}
            compactType="vertical"
          >
            {ids.map((id) => {
              const entry = widgets[id]
              const def = getWidget(entry.type)
              return (
                <div key={id}>
                  {def ? (
                    <WidgetFrame title={def.name} icon={def.icon} readOnly={!editable} onRemove={() => removeWidget(id)} onFill={editable ? () => fillWidget(id) : undefined}>
                      {/* Older saved layouts can lack config entirely — widgets
                          index into it (config.format etc.), so default it. */}
                      <def.component
                        config={entry.config ?? { ...(def.defaultConfig || {}) }}
                        setConfig={(config) => setWidgetConfig(id, config)}
                        canvas={canvas}
                      />
                    </WidgetFrame>
                  ) : (
                    <WidgetFrame title={`Unknown: ${entry.type}`} readOnly={!editable} onRemove={() => removeWidget(id)}>
                      <div className="text-xs text-muted-foreground">This widget type is not available.</div>
                    </WidgetFrame>
                  )}
                </div>
              )
            })}
          </ReactGridLayout>
        )}
      </div>
    </div>
  )
}

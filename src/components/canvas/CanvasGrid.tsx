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
import { DEFAULT_TIMELINE_SORT, type TimelineSort } from './widgets/useTimelineOptions'
import type { WidgetCanvasContext, WidgetConfig, WidgetDocumentsResult, WidgetFetchOpts } from './widget-types'
import { saveCanvasUi, getCanvasPathDocuments } from '@/services/workspace'
import { cn } from '@/lib/utils'
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

// Which axes a widget stretches on, keyed by widget id.
//
// Deliberately NOT stored on the layout items: react-grid-layout's
// cloneLayoutItem copies a fixed set of keys, so any custom prop is dropped on
// every onLayoutChange. The old code worked around that by re-deriving the
// flags from geometry each time ("did it grow, is it at the bottom") — which
// meant a widget was only ever filled for the single render after a resize,
// and never after a reload. This map is ours, RGL never touches it, and it is
// baked back onto the saved layout items on Save so the persisted shape (and
// with it every read-only/public view) stays exactly as before.
type FillMap = Record<string, { w: boolean; h: boolean }>

// The saved shape (metadata.ui).
interface CanvasUi {
  layout: CanvasLayoutItem[]
  widgets: WidgetMap
}

// The in-memory shape: saved geometry plus the fill intents pulled out of it.
interface CanvasState extends CanvasUi {
  fills: FillMap
}

const NO_FILL = { w: false, h: false }

// Row index just past the lowest widget. NON-FINITE entries are skipped on
// purpose: a freshly added widget still carries react-grid-layout's `y:
// Infinity` "place me at the bottom" marker, and letting that into the extent
// grows every fillH widget to an infinite height. An Infinity-height item then
// sends RGL's vertical compaction into `while (l.y > 0) l.y--` with l.y at
// Infinity — an unbreakable loop that hard-freezes the tab, not a glitch.
function gridExtent(layout: CanvasLayoutItem[]) {
  return Math.max(1, ...layout.map((item) => item.y + item.h).filter(Number.isFinite))
}

// y+h of the lowest widget (0 for an empty canvas) — where the next widget
// goes. Same non-finite guard as gridExtent.
function gridBottom(layout: CanvasLayoutItem[]) {
  return Math.max(0, ...layout.map((item) => item.y + item.h).filter(Number.isFinite))
}

// Saved layouts are JSON, and JSON has no Infinity — an item written out while
// it carried one comes back as null. Re-floor anything non-numeric so the
// geometry math downstream stays finite.
function sanitizeItem(item: CanvasLayoutItem): CanvasLayoutItem {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return { ...item, x: num(item.x, 0), y: num(item.y, 0), w: num(item.w, 1), h: num(item.h, 1) }
}

// A filled widget OWNS the canvas on that axis: it starts at the top of its
// column band and claims every visible row, so react-grid-layout's own
// compaction pushes whatever shares those columns below the fold. That is what
// removes the arithmetic — no neighbour spans, no growing "up to" the widget
// below, nothing that can deadlock against compaction the way sizing off a
// neighbour's y did.
//
// The row count here exists only so RGL's collision/compaction agrees with what
// is on screen; the PIXEL height comes from a CSS rule keyed on the data-fill
// attribute (see canvas-grid.css), which is what makes fill exact instead of
// quantised to whole rows.
//
// hostRows is 0 until the host has been measured; the grid's own extent stands
// in until then so a filled widget doesn't collapse for a frame.
function applyFillLayout(layout: CanvasLayoutItem[], fills: FillMap, hostRows = 0): CanvasLayoutItem[] {
  const fullRows = hostRows > 0 ? hostRows : gridExtent(layout)
  return layout.map((item) => {
    const fill = fills[item.i] ?? NO_FILL
    if (!fill.w && !fill.h) return item
    return {
      ...item,
      x: fill.w ? 0 : item.x,
      w: fill.w ? COLS : item.w,
      y: fill.h ? 0 : item.y,
      h: fill.h ? Math.max(item.minH ?? 1, fullRows) : item.h,
    }
  })
}

// How many rows a filled widget has to RESERVE to cover the visible host.
//
// Rounded UP, not down: the widget's pixels come from CSS (host height minus
// its two gutters) while collisions and drag placeholders still speak in rows,
// and a host height is rarely an exact multiple of the row pitch. Rounding down
// let the next widget be placed inside the stretched one — on a 901px host the
// row grid said the widget ended at 828px while it visibly ran to 889px, and
// the widget below landed on top of it. Rounding up reserves a sliver more than
// is on screen, which costs nothing: everything after a filled widget is below
// the fold by definition.
//
// The tolerance stops a 2px overshoot from claiming a whole extra row. The row
// height is a parameter because the stacked (narrow) grid uses a shorter one —
// measuring a phone with the wide row height put "fill height" at about half
// the screen.
const FILL_ROW_TOLERANCE_PX = 4

function hostRowCapacity(height: number, rowHeight: number) {
  const marginY = GRID_MARGIN[1]
  return Math.max(1, Math.ceil((height - marginY - FILL_ROW_TOLERANCE_PX) / (rowHeight + marginY)))
}

// How close to the canvas edge a dragged edge has to land to snap to a standing
// fill instead of an exact size — half a row, the tiling-WM gesture.
const EDGE_SNAP_PX = 45

// Narrow-viewport threshold below which the grid collapses to a single
// stacked column (widgets full-width, top-to-bottom by their grid position).
const NARROW_WIDTH = 640

function stackLayout(layout: CanvasLayoutItem[], fills: FillMap, hostRows = 0): CanvasLayoutItem[] {
  // Run the same fill pass first so a filled widget sorts to the top here too
  // and claims the whole phone screen; the rest scrolls beneath it.
  const sorted = [...applyFillLayout(layout, fills, hostRows)].sort((a, b) => (a.y - b.y) || (a.x - b.x))
  let y = 0
  return sorted.map((item) => {
    const h = Math.max(item.h, item.minH ?? 1)
    const stacked = { ...item, x: 0, w: COLS, y, h }
    y += h
    return stacked
  })
}

// A canvas stores one query string; the widget search stack restores as a
// single element (matching the folder view — see index.tsx serverSearchQueries).
const queriesFromSpec = (q?: string | null): string[] => (q && q.trim() ? [q] : [])

function readUi(metadata?: LayerMetadata): CanvasState {
  const ui = (metadata?.ui ?? {}) as Partial<CanvasUi>
  const raw = Array.isArray(ui.layout) ? (ui.layout as CanvasLayoutItem[]).map(sanitizeItem) : []
  const fills: FillMap = {}
  for (const item of raw) {
    // Canvases saved before fill-width was explicit only recorded it as "spans
    // every column", so keep reading that as the intent.
    fills[item.i] = { w: item.fillW ?? item.w >= COLS, h: item.fillH === true }
  }
  return {
    layout: raw,
    fills,
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
  // Fill intents, mirrored into a ref because react-grid-layout's resize and
  // layout callbacks fire back-to-back in one event: the ref lets the layout
  // merge below read a flag the resize handler just cleared, without waiting
  // for a re-render.
  const [fills, setFills] = useState<FillMap>(initial.fills)
  const fillsRef = useRef<FillMap>(initial.fills)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isNarrow, setIsNarrow] = useState(false)
  // Rows that fit the visible host — only used to let a fillH widget reach the
  // bottom; the row height itself is fixed.
  const [hostRows, setHostRows] = useState(0)
  // Live host pixel height, for the edge-snap test on resize. A ref, not state:
  // it is read inside a react-grid-layout callback, never rendered.
  const hostHeightRef = useRef(0)
  const applyFills = useCallback((next: FillMap) => {
    fillsRef.current = next
    setFills(next)
  }, [])
  // Canvas-level view order. Seeded from the stored querySpec so widgets show
  // the baked sort; edited via a widget's sort control and persisted back into
  // querySpec.sort on Save (only when actually touched → sortDirtyRef).
  const [canvasSort, setCanvasSortState] = useState<TimelineSort>(() => querySpec?.sort ?? DEFAULT_TIMELINE_SORT)
  const sortDirtyRef = useRef(false)
  // Canvas-level search stack, seeded from the stored querySpec.query. Widget
  // search boxes append to this (via the canvas context) and it persists back
  // into querySpec.query on Save — only when touched (queriesDirtyRef), so a
  // folder-view-saved query is not clobbered by an untouched canvas save.
  const [canvasQueries, setCanvasQueriesState] = useState<string[]>(() => queriesFromSpec(querySpec?.query))
  const queriesDirtyRef = useRef(false)
  const gridHostRef = useRef<HTMLDivElement>(null)

  const latest = useRef<CanvasState>(initial)
  // Narrow viewports (mobile) collapse to a stacked single column: the saved
  // 12-col layout is unusable there and widgets never filled the area.
  const displayLayout = useMemo(
    () => (isNarrow ? stackLayout(layout, fills, hostRows) : applyFillLayout(layout, fills, hostRows)),
    [layout, fills, isNarrow, hostRows],
  )
  const rowHeight = isNarrow ? NARROW_ROW_HEIGHT : ROW_HEIGHT
  const savedUiKey = useMemo(() => JSON.stringify(metadata?.ui ?? null), [metadata?.ui])

  // Reset local state when navigating to a different canvas.
  useEffect(() => {
    const next = readUi(metadata)
    setLayout(next.layout)
    setWidgets(next.widgets)
    applyFills(next.fills)
    latest.current = next
    setCanvasSortState(querySpec?.sort ?? DEFAULT_TIMELINE_SORT)
    sortDirtyRef.current = false
    setCanvasQueriesState(queriesFromSpec(querySpec?.query))
    queriesDirtyRef.current = false
    setIsDirty(false)
  }, [path, layerId])

  // Public/read-only views reload metadata over the socket; keep in sync without remounting.
  useEffect(() => {
    if (!readOnly) return
    const next = readUi(metadata)
    setLayout(next.layout)
    setWidgets(next.widgets)
    applyFills(next.fills)
    latest.current = next
  }, [readOnly, savedUiKey, metadata, applyFills])

  // Track the narrow (stacked) breakpoint and how many rows fit the host, so a
  // fillH widget can stretch to the bottom. The row height itself is fixed.
  useEffect(() => {
    const host = gridHostRef.current
    if (!host) return

    const measure = () => {
      const height = host.clientHeight
      const narrow = host.clientWidth > 0 && host.clientWidth < NARROW_WIDTH
      setIsNarrow(narrow)
      hostHeightRef.current = height
      // Publish the measured height to CSS. A filled widget is sized by the
      // stylesheet against this, not by the row grid, so it lands exactly on
      // the canvas edge instead of on the nearest whole row.
      host.style.setProperty('--canvas-host-h', `${height}px`)
      if (height > 0) setHostRows(hostRowCapacity(height, narrow ? NARROW_ROW_HEIGHT : ROW_HEIGHT))
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

  const setCanvasQueries = useCallback((next: string[]) => {
    setCanvasQueriesState(next)
    queriesDirtyRef.current = true
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
      canvasQueries,
      setCanvasQueries: editable ? setCanvasQueries : undefined,
      fetchDocuments: fetchDocuments ?? (async (opts) => {
        const res = await getCanvasPathDocuments(workspaceId, path, treeName, opts)
        return { payload: (res.payload as Document[]) || [], count: res.count ?? undefined, totalCount: res.totalCount ?? undefined }
      }),
    }),
    [workspaceId, treeName, path, layerId, querySpec, editable, interactive, fetchDocuments, canvasSort, setCanvasSort, canvasQueries, setCanvasQueries],
  )

  const markDirty = useCallback((nextLayout: CanvasLayoutItem[], nextWidgets: WidgetMap, nextFills?: FillMap) => {
    latest.current = { layout: nextLayout, widgets: nextWidgets, fills: nextFills ?? fillsRef.current }
    setIsDirty(true)
  }, [])

  const saveNow = useCallback(async () => {
    if (!editable || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    try {
      // Fill intents ride back out on the layout items, the shape every stored
      // canvas already has, so read-only and public views restore them too.
      const ui: CanvasUi = {
        widgets: latest.current.widgets,
        layout: latest.current.layout.map((item) => ({
          ...item,
          fillW: fillsRef.current[item.i]?.w === true,
          fillH: fillsRef.current[item.i]?.h === true,
        })),
      }
      latest.current = { ...ui, fills: fillsRef.current }
      // Bake widget-changed view order / search into the canvas querySpec so the
      // frozen view (folder listing + public shares) matches. Only send the keys
      // actually touched, to avoid clobbering a folder-view-saved sort or query.
      const nextQuerySpec = (sortDirtyRef.current || queriesDirtyRef.current)
        ? {
            ...(querySpec || {}),
            ...(sortDirtyRef.current ? { sort: canvasSort.sortBy ? canvasSort : null } : {}),
            ...(queriesDirtyRef.current ? { query: canvasQueries.join(' ').trim() || null } : {}),
          }
        : undefined
      await saveCanvasUi(workspaceId, path, treeName, { ...(metadata || {}), ui }, nextQuerySpec)
      sortDirtyRef.current = false
      queriesDirtyRef.current = false
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
  }, [editable, isSaving, workspaceId, path, treeName, metadata, onSaved, querySpec, canvasSort, canvasQueries])

  const handleLayoutChange = useCallback((next: Layout[]) => {
    // Never persist the derived stacked (narrow) layout over the saved grid.
    if (!editable || isNarrow) return
    setLayout((prev) => {
      // Keep BASE geometry underneath a fill. On a filled axis react-grid-layout
      // reports the stretched size, and writing that back would bake one
      // viewport's dimensions into the canvas — exactly what must not happen
      // when the same canvas opens on a TV and on a phone. Positions (y) always
      // come from RGL: those are compaction results, not user intent.
      const merged = (next as CanvasLayoutItem[]).map((item) => {
        const base = prev.find((p) => p.i === item.i)
        const fill = fillsRef.current[item.i]
        if (!base) return item
        return {
          ...item,
          x: fill?.w ? base.x : item.x,
          w: fill?.w ? base.w : item.w,
          y: fill?.h ? base.y : item.y,
          h: fill?.h ? base.h : item.h,
        }
      })
      markDirty(merged, widgets)
      return merged
    })
  }, [editable, isNarrow, markDirty, widgets])

  // Dragging a resize handle is an explicit size choice, so it releases fill on
  // whichever axis actually moved (the other keeps stretching). RGL calls this
  // before onLayoutChange, so clearing the ref here is already visible to the
  // merge above — the dragged size sticks instead of being overwritten by the
  // stale base.
  const handleResizeStop = useCallback((_next: Layout[], oldItem: Layout, newItem: Layout) => {
    if (!editable) return
    const current = fillsRef.current[newItem.i] ?? NO_FILL
    // Snap like a tiling window manager: an edge dropped on (or within half a
    // row of) the canvas edge becomes a standing fill rather than a literal
    // size, so it keeps holding the edge on the next viewport. Note this SETS
    // the durable flag at the end of a gesture — it is not re-derived from
    // geometry on every render, which is what made the old flags evaporate.
    const bottomPx = GRID_MARGIN[1] + (newItem.y + newItem.h) * (ROW_HEIGHT + GRID_MARGIN[1])
    const next = {
      w: newItem.x + newItem.w >= COLS,
      h: hostHeightRef.current > 0 && bottomPx >= hostHeightRef.current - EDGE_SNAP_PX,
    }
    // Anything short of the edge is an explicit size: fill is released on the
    // axis that actually moved, and left alone on the axis that did not.
    if (!next.w) next.w = current.w && newItem.w === oldItem.w
    if (!next.h) next.h = current.h && newItem.h === oldItem.h
    if (next.w === current.w && next.h === current.h) return
    const nextFills = { ...fillsRef.current, [newItem.i]: next }
    applyFills(nextFills)
    markDirty(latest.current.layout, widgets, nextFills)
  }, [editable, applyFills, markDirty, widgets])

  // Turn stretching on/off for one axis of one widget. This is the whole point
  // of the control: it is a standing instruction re-evaluated against whatever
  // viewport the canvas is opened on, not a one-time resize.
  const toggleFill = useCallback((id: string, axis: 'w' | 'h') => {
    if (!editable) return
    const current = fillsRef.current[id] ?? NO_FILL
    const nextFills = { ...fillsRef.current, [id]: { ...current, [axis]: !current[axis] } }
    applyFills(nextFills)
    markDirty(layout, widgets, nextFills)
  }, [editable, applyFills, markDirty, layout, widgets])

  const addWidget = useCallback((type: string) => {
    const def = getWidget(type)
    if (!def) return
    const id = crypto.randomUUID()
    const { w, h, minW, minH, maxW, maxH } = def.defaultSize
    // Placed at the current bottom rather than react-grid-layout's `y: Infinity`
    // idiom — vertical compaction floats it up to the same spot, and keeping
    // the layout finite keeps gridExtent/applyFillLayout out of Infinity math.
    // Placed below what is actually on screen (displayLayout, not the base
    // layout) rather than react-grid-layout's `y: Infinity` idiom — vertical
    // compaction floats it up to the same spot, and keeping the layout finite
    // keeps gridExtent/applyFillLayout out of Infinity math.
    const nextLayout: CanvasLayoutItem[] = [...layout, { i: id, x: 0, y: gridBottom(displayLayout), w, h, minW, minH, maxW, maxH }]
    const nextWidgets = { ...widgets, [id]: { type, config: { ...(def.defaultConfig || {}) } } }
    const nextFills = { ...fillsRef.current, [id]: { w: w >= COLS, h: false } }
    setLayout(nextLayout)
    setWidgets(nextWidgets)
    applyFills(nextFills)
    setMenuOpen(false)
    markDirty(nextLayout, nextWidgets, nextFills)
  }, [layout, displayLayout, widgets, applyFills, markDirty])

  const removeWidget = useCallback((id: string) => {
    const nextLayout = layout.filter((item) => item.i !== id)
    const nextWidgets = { ...widgets }
    delete nextWidgets[id]
    const nextFills = { ...fillsRef.current }
    delete nextFills[id]
    setLayout(nextLayout)
    setWidgets(nextWidgets)
    applyFills(nextFills)
    markDirty(nextLayout, nextWidgets, nextFills)
  }, [layout, widgets, applyFills, markDirty])

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
            <div className="absolute left-0 top-full mt-1 z-20 w-48 rounded-md border bg-popover shadow-elevation-2 py-1">
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
          // Purple when there are unsaved layout changes — same affordance as the
          // toolbox "Save filters" button, so a dirty canvas is spottable at a
          // glance. Falls back to the neutral bordered look once saved/disabled.
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors disabled:opacity-50',
            isDirty
              ? 'bg-primary text-primary-foreground hover:bg-primary'
              : 'border hover:bg-accent',
          )}
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
            onResizeStop={handleResizeStop}
            compactType="vertical"
          >
            {ids.map((id) => {
              const entry = widgets[id]
              const def = getWidget(entry.type)
              const fill = fills[id] ?? NO_FILL
              // The attribute is the whole mechanism: canvas-grid.css sizes a
              // filled item against the measured host, overriding the pixel
              // height react-grid-layout writes inline.
              const fillAttr = [fill.w ? 'w' : '', fill.h ? 'h' : ''].filter(Boolean).join(' ')
              return (
                <div key={id} data-fill={fillAttr || undefined}>
                  {def ? (
                    <WidgetFrame
                      title={def.name}
                      icon={def.icon}
                      readOnly={!editable}
                      onRemove={() => removeWidget(id)}
                      fill={fills[id] ?? NO_FILL}
                      onToggleFill={editable ? (axis) => toggleFill(id, axis) : undefined}
                    >
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

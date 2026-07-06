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
import type { WidgetCanvasContext, WidgetConfig, WidgetDocumentsResult } from './widget-types'
import { saveCanvasUi, getCanvasPathDocuments } from '@/services/workspace'
import type { CanvasQuerySpec, Document, LayerMetadata } from '@/types/workspace'

const ReactGridLayout = WidthProvider(GridLayout)
const COLS = 12
const MIN_ROW_HEIGHT = 32
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

function applyFillLayout(layout: CanvasLayoutItem[]): CanvasLayoutItem[] {
  const extent = gridExtent(layout)
  return layout.map((item) => {
    const fillW = item.fillW ?? item.w >= COLS
    const placed = { ...item, x: fillW ? 0 : item.x, w: fillW ? COLS : item.w }
    let h = item.h
    if (item.fillH) {
      // Grow to the next widget below (same column band), not over it.
      const belowY = layout.reduce<number | null>((min, other) => {
        if (other.i === item.i || other.y <= item.y || !itemsOverlap(placed, other)) return min
        return min == null || other.y < min ? other.y : min
      }, null)
      h = Math.max(item.minH ?? 1, (belowY ?? extent) - item.y)
    }
    return { ...placed, h }
  })
}

function rowHeightForContainer(height: number, layout: CanvasLayoutItem[]) {
  const extent = gridExtent(applyFillLayout(layout))
  const marginY = GRID_MARGIN[1]
  const totalMargin = Math.max(0, extent - 1) * marginY
  return Math.max(MIN_ROW_HEIGHT, Math.floor((height - totalMargin) / extent))
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
  fetchDocuments?: (opts?: { limit?: number; page?: number }) => Promise<WidgetDocumentsResult>
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
  const [rowHeight, setRowHeight] = useState(MIN_ROW_HEIGHT)
  const [isNarrow, setIsNarrow] = useState(false)
  const gridHostRef = useRef<HTMLDivElement>(null)

  const latest = useRef<CanvasUi>({ layout: initial.layout, widgets: initial.widgets })
  // Narrow viewports (mobile) collapse to a stacked single column: the saved
  // 12-col layout is unusable there and widgets never filled the area.
  const displayLayout = useMemo(
    () => (isNarrow ? stackLayout(layout) : applyFillLayout(layout)),
    [layout, isNarrow],
  )
  const savedUiKey = useMemo(() => JSON.stringify(metadata?.ui ?? null), [metadata?.ui])

  // Reset local state when navigating to a different canvas.
  useEffect(() => {
    const next = readUi(metadata)
    setLayout(next.layout)
    setWidgets(next.widgets)
    latest.current = next
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

  // Scale row height so the grid always fills the host — keeps full-width /
  // full-height widgets proportional on workspace and shared canvases alike.
  useEffect(() => {
    const host = gridHostRef.current
    if (!host || layout.length === 0) return

    const measure = () => {
      const height = host.clientHeight
      const narrow = host.clientWidth > 0 && host.clientWidth < NARROW_WIDTH
      setIsNarrow(narrow)
      if (height <= 0) return
      // Stacked (mobile) mode scrolls vertically at a fixed comfortable row
      // height instead of squeezing the whole stack into the viewport.
      setRowHeight(narrow ? 40 : rowHeightForContainer(height, layout))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [layout])

  const canvas: WidgetCanvasContext = useMemo(
    () => ({
      workspaceId,
      treeName,
      path,
      layerId,
      querySpec,
      readOnly: !editable,
      fetchDocuments: fetchDocuments ?? (async (opts) => {
        const res = await getCanvasPathDocuments(workspaceId, path, treeName, opts)
        return { payload: (res.payload as Document[]) || [], count: res.count, totalCount: res.totalCount }
      }),
    }),
    [workspaceId, treeName, path, layerId, querySpec, editable, fetchDocuments],
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
      await saveCanvasUi(workspaceId, path, treeName, { ...(metadata || {}), ui })
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
  }, [editable, isSaving, workspaceId, path, treeName, metadata, onSaved])

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

      <div ref={gridHostRef} className={`canvas-grid-host flex-1 min-h-0 bg-muted/10 ${isNarrow ? 'overflow-y-auto' : 'overflow-hidden'}`}>
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
                    <WidgetFrame title={def.name} icon={def.icon} readOnly={!editable} onRemove={() => removeWidget(id)}>
                      <def.component
                        config={entry.config}
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

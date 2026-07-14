import { useCallback, useEffect, useMemo, useRef, useState, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// Marker clustering: overlapping/nearby pins collapse into a numbered circle
// (shows the count), split on zoom, and spiderfy at max zoom so each doc stays
// individually hoverable/clickable — the standard fix for stacked map pins.
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { Square, Hexagon, Trash2, X, Check, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox } from '../toolbox-context'
import { useDocumentModal } from '@/components/shell/document-modal-context'
import { schemaIcon } from '@/lib/schema-meta'
import { readDocGeo, pointInGeoSelection } from '@/utils/geo'
import { getDocumentDisplayInfo } from '@/lib/document-display'

const IN_COLOR = '#8b5cf6'   // violet — document inside the selection
const OUT_COLOR = '#94a3b8'  // slate — outside (dimmed)
const SELECT_STYLE: L.PathOptions = { color: IN_COLOR, weight: 2, fillColor: IN_COLOR, fillOpacity: 0.12 }
const DRAFT_STYLE: L.PathOptions = { color: IN_COLOR, weight: 2, dashArray: '5,5', fillColor: IN_COLOR, fillOpacity: 0.06 }

type DrawMode = 'idle' | 'rect' | 'polygon'
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

// Cluster badge: a violet circle with the child count. Grows a little with the
// order of magnitude so 3-digit counts still fit.
function clusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 32 : count < 100 ? 38 : 44
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${IN_COLOR};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);font:600 12px system-ui,sans-serif;cursor:pointer">${count}</div>`
  return L.divIcon({ html, className: 'canvas-map-cluster', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

// Cache the rendered glyph markup + the full divIcon per (schema, inside) so
// panning / re-filtering never re-renders markup.
const glyphCache = new Map<string, string>()
function glyph(schema: string): string {
  let s = glyphCache.get(schema)
  if (s == null) {
    s = renderToStaticMarkup(createElement(schemaIcon(schema), { width: 13, height: 13, strokeWidth: 2.5 }))
    glyphCache.set(schema, s)
  }
  return s
}
const divIconCache = new Map<string, L.DivIcon>()
function pinIcon(schema: string, inside: boolean): L.DivIcon {
  const key = `${schema}|${inside ? 1 : 0}`
  let icon = divIconCache.get(key)
  if (!icon) {
    const bg = inside ? IN_COLOR : OUT_COLOR
    const html = `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${bg};color:#fff;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:pointer">${glyph(schema)}</div>`
    icon = L.divIcon({ html, className: 'canvas-map-pin', iconSize: [26, 26], iconAnchor: [13, 13] })
    divIconCache.set(key, icon)
  }
  return icon
}

// Location filter (client-side). Plots every geo-tagged document in the current
// result set as a type-icon pin, and lets you draw a rectangle or a polygon to
// refine the content area in real time — pins recolor in/out and the browser
// filters the ALREADY-fetched set (no re-fetch, no backend polygon needed).
export function MapTab() {
  const { state, setGeoSelection, setGeoBBox } = useToolbox()
  const { mapDocuments, geoSelection, mapWorkspaceId } = state
  // Rectangle = a STORABLE geo filter (geo:bbox → server-applied, savable to
  // canvas/context). Polygon stays a client-side ephemeral refine (no backend
  // polygon coverer).
  const bbox = state.filters.geo.bbox
  const { open: openDocument } = useDocumentModal()

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const pinsRef = useRef<L.MarkerClusterGroup | null>(null)
  const selectionRef = useRef<L.Layer | null>(null)
  const draftLayerRef = useRef<L.LayerGroup | null>(null)
  const draftRef = useRef<L.LatLng[]>([])
  const didFitRef = useRef(false)

  const [mode, setMode] = useState<DrawMode>('idle')
  const [draftCount, setDraftCount] = useState(0)
  const modeRef = useRef<DrawMode>(mode)

  const geoCount = useMemo(() => mapDocuments.reduce((n, d) => n + (readDocGeo(d) ? 1 : 0), 0), [mapDocuments])
  const inAreaCount = useMemo(() => {
    if (!geoSelection) return 0
    return mapDocuments.reduce((n, d) => {
      const g = readDocGeo(d)
      return n + (g && pointInGeoSelection(g.lat, g.lon, geoSelection) ? 1 : 0)
    }, 0)
  }, [mapDocuments, geoSelection])

  // ── Polygon draft helpers (imperative leaflet layers) ──────────────────────
  const redrawDraft = useCallback(() => {
    const layer = draftLayerRef.current
    if (!layer) return
    layer.clearLayers()
    const pts = draftRef.current
    if (pts.length === 0) return
    if (pts.length >= 2) L.polyline(pts, DRAFT_STYLE).addTo(layer)
    pts.forEach((p) => L.circleMarker(p, { radius: 4, color: IN_COLOR, weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(layer))
  }, [])

  const clearDraft = useCallback(() => {
    draftRef.current = []
    setDraftCount(0)
    draftLayerRef.current?.clearLayers()
  }, [])

  const finishPolygon = useCallback(() => {
    const pts = draftRef.current
    if (pts.length >= 3) {
      setGeoSelection({ kind: 'polygon', points: pts.map((p) => ({ lat: round6(p.lat), lon: round6(p.lng) })) })
    }
    clearDraft()
    setMode('idle')
  }, [setGeoSelection, clearDraft])

  const clearSelection = useCallback(() => {
    clearDraft()
    setMode('idle')
    setGeoSelection(null)
    setGeoBBox(null)
  }, [clearDraft, setGeoSelection, setGeoBBox])

  // ── Init the map once ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, { center: [20, 0], zoom: 2, worldCopyJump: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    pinsRef.current = L.markerClusterGroup({
      showCoverageOnHover: false,   // no polygon flash on hover — keep it clean
      maxClusterRadius: 44,
      spiderfyOnMaxZoom: true,      // fan out exact-overlap pins at max zoom
      chunkedLoading: true,
      iconCreateFunction: (cluster) => clusterIcon(cluster.getChildCount()),
    }).addTo(map)
    draftLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // Rectangle: pointer-drag on the container (mouse + touch). Only active while
    // in 'rect' mode (dragging is disabled then, so the gesture draws).
    const container = map.getContainer()
    let start: L.LatLng | null = null
    let temp: L.Rectangle | null = null
    const clearTemp = () => { if (temp) { temp.remove(); temp = null } }
    const onDown = (ev: PointerEvent) => {
      if (modeRef.current !== 'rect') return
      ev.preventDefault()
      start = map.mouseEventToLatLng(ev)
      clearTemp()
      try { container.setPointerCapture(ev.pointerId) } catch { /* ignore */ }
    }
    const onMove = (ev: PointerEvent) => {
      if (modeRef.current !== 'rect' || !start) return
      ev.preventDefault()
      const bounds = L.latLngBounds(start, map.mouseEventToLatLng(ev))
      if (!temp) temp = L.rectangle(bounds, DRAFT_STYLE).addTo(map)
      else temp.setBounds(bounds)
    }
    const onUp = (ev: PointerEvent) => {
      if (modeRef.current !== 'rect' || !start) return
      const bounds = L.latLngBounds(start, map.mouseEventToLatLng(ev))
      start = null
      clearTemp()
      try { container.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
      const sw = bounds.getSouthWest(); const ne = bounds.getNorthEast()
      if (sw.lat !== ne.lat && sw.lng !== ne.lng) {
        setGeoBBox({ minLat: round6(sw.lat), minLon: round6(sw.lng), maxLat: round6(ne.lat), maxLon: round6(ne.lng) })
      }
      setMode('idle')
    }
    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerup', onUp)
    container.addEventListener('pointercancel', onUp)

    // Polygon: each click/tap drops a vertex (leaflet fires 'click' on tap too,
    // and never on a pan-drag — so panning between points is fine).
    const onClick = (ev: L.LeafletMouseEvent) => {
      if (modeRef.current !== 'polygon') return
      draftRef.current = [...draftRef.current, ev.latlng]
      setDraftCount(draftRef.current.length)
      redrawDraft()
    }
    map.on('click', onClick)

    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    const t = window.setTimeout(() => map.invalidateSize(), 120)

    return () => {
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerup', onUp)
      container.removeEventListener('pointercancel', onUp)
      map.off('click', onClick)
      ro.disconnect(); window.clearTimeout(t)
      map.remove()
      mapRef.current = null; pinsRef.current = null; draftLayerRef.current = null; selectionRef.current = null
    }
  }, [setGeoSelection, setGeoBBox, redrawDraft])

  // ── Toggle pan-drag vs draw ────────────────────────────────────────────────
  useEffect(() => {
    modeRef.current = mode
    const map = mapRef.current
    if (!map) return
    const el = map.getContainer()
    // Leaving polygon mode without finishing drops the draft.
    if (mode !== 'polygon' && draftRef.current.length) clearDraft()
    if (mode === 'rect') {
      map.dragging.disable(); map.doubleClickZoom.disable()
      el.style.cursor = 'crosshair'; el.style.touchAction = 'none'
    } else if (mode === 'polygon') {
      // Dragging stays ON — clicks add points, drags pan.
      map.dragging.enable(); map.doubleClickZoom.disable()
      el.style.cursor = 'crosshair'; el.style.touchAction = ''
    } else {
      map.dragging.enable(); map.doubleClickZoom.enable()
      el.style.cursor = ''; el.style.touchAction = ''
    }
  }, [mode, clearDraft])

  // ── Keep sized to the (resizable) container ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const el = containerRef.current
    if (!map || !el) return
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── (Re)draw pins when the result set or the selection changes ─────────────
  useEffect(() => {
    const map = mapRef.current, layer = pinsRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const pts: L.LatLngExpression[] = []
    const markers: L.Marker[] = []
    for (const doc of mapDocuments) {
      const g = readDocGeo(doc)
      if (!g) continue
      pts.push([g.lat, g.lon])
      const inside = geoSelection ? pointInGeoSelection(g.lat, g.lon, geoSelection) : true
      const marker = L.marker([g.lat, g.lon], {
        icon: pinIcon(doc.schema, inside),
        opacity: geoSelection && !inside ? 0.55 : 1,
        zIndexOffset: inside ? 1000 : 0,
      })
      marker.bindTooltip(escapeHtml(getDocumentDisplayInfo(doc).title), { direction: 'top', offset: [0, -14] })
      // Click a pin → open the shared document details modal. Suppressed while
      // drawing so a rect/polygon gesture isn't hijacked by a pin.
      marker.on('click', () => {
        if (modeRef.current === 'idle') openDocument(doc, mapWorkspaceId ?? '')
      })
      markers.push(marker)
    }
    layer.addLayers(markers)   // bulk add → clustering computed once
    // Frame the data once, so the map opens on the documents rather than the globe.
    if (!didFitRef.current && pts.length && !geoSelection) {
      didFitRef.current = true
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 14, animate: false })
    }
  }, [mapDocuments, geoSelection, openDocument, mapWorkspaceId])

  // ── Reflect the committed selection shape ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (selectionRef.current) { selectionRef.current.remove(); selectionRef.current = null }
    if (!bbox && !geoSelection) return
    const group = L.layerGroup()
    if (bbox) {
      L.rectangle(L.latLngBounds([bbox.minLat, bbox.minLon], [bbox.maxLat, bbox.maxLon]), SELECT_STYLE).addTo(group)
    }
    if (geoSelection?.kind === 'polygon') {
      L.polygon(geoSelection.points.map((p) => [p.lat, p.lon]) as L.LatLngExpression[], SELECT_STYLE).addTo(group)
    }
    group.addTo(map)
    selectionRef.current = group
  }, [bbox, geoSelection])

  const status = mode === 'rect' ? 'Drag a box on the map…'
    : mode === 'polygon' ? `Tap to add points${draftCount ? ` · ${draftCount}` : ''}`
    : (bbox || geoSelection) ? 'Area selected' : 'Pan & pick an area'

  const drawBtn = 'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={() => setMode(mode === 'rect' ? 'idle' : 'rect')}
          className={cn(drawBtn, mode === 'rect' ? 'border-violet-500 bg-violet-500/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}
          title="Drag a rectangle to select an area"
        >
          <Square className="h-3.5 w-3.5" />
          Box
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'polygon' ? 'idle' : 'polygon')}
          className={cn(drawBtn, mode === 'polygon' ? 'border-violet-500 bg-violet-500/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}
          title="Tap points to enclose an area"
        >
          <Hexagon className="h-3.5 w-3.5" />
          Polygon
        </button>
        {mode === 'polygon' && (
          <>
            <button
              type="button"
              onClick={finishPolygon}
              disabled={draftCount < 3}
              className={cn(drawBtn, 'border-violet-500 bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600')}
              title="Close the polygon and filter"
            >
              <Check className="h-3.5 w-3.5" />
              Finish
            </button>
            {draftCount > 0 && (
              <button
                type="button"
                onClick={clearDraft}
                className={cn(drawBtn, 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}
                title="Discard the points placed so far"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={clearSelection}
          disabled={!bbox && !geoSelection && mode === 'idle'}
          className={cn(drawBtn, 'border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent')}
          title="Clear the area selection"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">{status}</span>
      </div>

      {/* Map — `isolate` gives leaflet its own stacking context so its internal
          z-indexes (controls at 1000, panes/tooltips 200–700) stay contained and
          never paint over app modals/drawers that sit above the toolbox. */}
      <div className="relative isolate flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />
        {geoCount === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
            <div className="rounded-lg border bg-card/95 px-4 py-3 text-center shadow-md">
              <p className="text-sm font-medium text-foreground">No located documents</p>
              <p className="text-xs text-muted-foreground">None of the current results carry location metadata.</p>
            </div>
          </div>
        )}
      </div>

      {/* Located / in-area readout */}
      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2 shrink-0 text-[11px] text-muted-foreground">
        <MapPin className="h-3 w-3" />
        {geoCount} of {mapDocuments.length} located
        {geoSelection && <span className="text-foreground font-medium">· {inAreaCount} in area</span>}
      </div>
    </div>
  )
}

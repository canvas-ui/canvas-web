import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Square, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox } from '../toolbox-context'
import type { GeoBBox } from '@/types/workspace'

const SELECT_STYLE: L.PathOptions = { color: '#8b5cf6', weight: 2, fillColor: '#8b5cf6', fillOpacity: 0.12 }

function bboxToBounds(b: GeoBBox): L.LatLngBounds {
  return L.latLngBounds([b.minLat, b.minLon], [b.maxLat, b.maxLon])
}
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

// Location filter: pan/zoom an OpenStreetMap map, drag to select an area, and
// the toolbox turns it into a `geo:bbox:` query filter (synapsd geo grammar).
// The backend has no polygon coverer yet, so the selection is a bounding box.
export function MapTab() {
  const { state, setGeoBBox } = useToolbox()
  const bbox = state.filters.geo.bbox

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const selectionRef = useRef<L.Rectangle | null>(null)
  const [drawing, setDrawing] = useState(false)
  // Mirror `drawing` into a ref so the map event handlers (bound once) can read
  // the latest value without rebinding. Written in the toggle effect below.
  const drawingRef = useRef(drawing)

  // ── Init the map once ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, { center: [20, 0], zoom: 2, worldCopyJump: true, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    // Drag-to-draw rectangle. Uses POINTER events on the map container so it
    // works for both mouse and touch (leaflet's `mousedown`/`mousemove` map
    // events don't fire for touch drags — that broke selection on mobile/PWA).
    // Dragging is disabled while `drawing` (toggled in a separate effect) so the
    // gesture draws instead of panning.
    const container = map.getContainer()
    let start: L.LatLng | null = null
    let temp: L.Rectangle | null = null
    const clearTemp = () => { if (temp) { temp.remove(); temp = null } }
    const onDown = (ev: PointerEvent) => {
      if (!drawingRef.current) return
      ev.preventDefault()
      start = map.mouseEventToLatLng(ev)
      clearTemp()
      try { container.setPointerCapture(ev.pointerId) } catch { /* ignore */ }
    }
    const onMove = (ev: PointerEvent) => {
      if (!drawingRef.current || !start) return
      ev.preventDefault()
      const bounds = L.latLngBounds(start, map.mouseEventToLatLng(ev))
      if (!temp) temp = L.rectangle(bounds, SELECT_STYLE).addTo(map)
      else temp.setBounds(bounds)
    }
    const onUp = (ev: PointerEvent) => {
      if (!drawingRef.current || !start) return
      const bounds = L.latLngBounds(start, map.mouseEventToLatLng(ev))
      start = null
      clearTemp()
      try { container.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
      const sw = bounds.getSouthWest()
      const ne = bounds.getNorthEast()
      if (sw.lat !== ne.lat && sw.lng !== ne.lng) {
        setGeoBBox({
          minLat: round6(sw.lat), minLon: round6(sw.lng),
          maxLat: round6(ne.lat), maxLon: round6(ne.lng),
        })
      }
      setDrawing(false)
    }
    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerup', onUp)
    container.addEventListener('pointercancel', onUp)

    return () => {
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerup', onUp)
      container.removeEventListener('pointercancel', onUp)
      map.remove(); mapRef.current = null; selectionRef.current = null
    }
  }, [setGeoBBox])

  // ── Keep the map sized to its (resizable) container ────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const el = containerRef.current
    if (!map || !el) return
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    const t = window.setTimeout(() => map.invalidateSize(), 120)
    return () => { ro.disconnect(); window.clearTimeout(t) }
  }, [])

  // ── Toggle pan-drag vs draw-drag ───────────────────────────────────────────
  useEffect(() => {
    drawingRef.current = drawing
    const map = mapRef.current
    if (!map) return
    const el = map.getContainer()
    if (drawing) {
      map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable()
      el.style.cursor = 'crosshair'
      el.style.touchAction = 'none' // let the pointer draw instead of scroll/zoom
    } else {
      map.dragging.enable(); map.touchZoom.enable(); map.doubleClickZoom.enable()
      el.style.cursor = ''
      el.style.touchAction = ''
    }
  }, [drawing])

  // ── Reflect the current selection (from filter state) onto the map ─────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (selectionRef.current) { selectionRef.current.remove(); selectionRef.current = null }
    if (bbox) {
      const rect = L.rectangle(bboxToBounds(bbox), SELECT_STYLE).addTo(map)
      selectionRef.current = rect
      map.fitBounds(rect.getBounds(), { padding: [24, 24], maxZoom: 13, animate: false })
    }
  }, [bbox])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Controls */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={() => setDrawing((d) => !d)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
            drawing
              ? 'border-violet-500 bg-violet-500/10 text-foreground'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          title="Drag a box on the map to select an area"
        >
          {drawing ? <X className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {drawing ? 'Cancel' : 'Select area'}
        </button>
        <button
          type="button"
          onClick={() => { setDrawing(false); setGeoBBox(null) }}
          disabled={!bbox}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          title="Clear the area selection"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {drawing ? 'Drag on the map…' : bbox ? 'Area selected' : 'No area'}
        </span>
      </div>

      {/* Map */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      {/* Selected bounds readout */}
      {bbox && (
        <div className="border-t border-border px-3 py-2 shrink-0 font-mono text-[11px] text-muted-foreground">
          <div className="truncate" title={`${bbox.minLat}, ${bbox.minLon} → ${bbox.maxLat}, ${bbox.maxLon}`}>
            SW {bbox.minLat.toFixed(4)}, {bbox.minLon.toFixed(4)} · NE {bbox.maxLat.toFixed(4)}, {bbox.maxLon.toFixed(4)}
          </div>
          <div className="mt-0.5 text-muted-foreground/70">Queries documents within this bounding box.</div>
        </div>
      )}
    </div>
  )
}

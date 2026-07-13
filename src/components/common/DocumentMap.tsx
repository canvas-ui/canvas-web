import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin } from 'lucide-react'
import type { Document } from '@/types/workspace'
import { getDocumentDisplayInfo } from '@/lib/document-display'

// Read a document's location from its extracted metadata (EXIF GPS etc.).
function docGeo(doc: Document): { lat: number; lon: number } | null {
  const g = (doc.metadata as Record<string, unknown> | undefined)?.geo as { lat?: unknown; lon?: unknown } | undefined
  const lat = Number(g?.lat)
  const lon = Number(g?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

// Results-as-pins map view. Renders the documents that carry a location as
// circle markers; clicking one opens its details. Documents without geo are
// summarised (they simply can't be placed). Reuses the same Leaflet setup as
// the map filter.
export function DocumentMap({ documents, onOpen }: { documents: Document[]; onOpen: (doc: Document) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  // Keep the latest onOpen reachable from the (once-bound) marker handlers.
  const onOpenRef = useRef(onOpen)
  useEffect(() => { onOpenRef.current = onOpen }, [onOpen])

  // ── Init once ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, { center: [20, 0], zoom: 2, worldCopyJump: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    const t = window.setTimeout(() => map.invalidateSize(), 120)
    return () => {
      ro.disconnect(); window.clearTimeout(t)
      map.remove(); mapRef.current = null; layerRef.current = null
    }
  }, [])

  // ── (Re)draw markers when the document set changes ─────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const pts: L.LatLngTuple[] = []
    for (const doc of documents) {
      const g = docGeo(doc)
      if (!g) continue
      pts.push([g.lat, g.lon])
      const marker = L.circleMarker([g.lat, g.lon], {
        radius: 6, color: '#8b5cf6', weight: 2, fillColor: '#8b5cf6', fillOpacity: 0.7,
      })
      const title = getDocumentDisplayInfo(doc).title
      marker.bindTooltip(escapeHtml(title), { direction: 'top', offset: [0, -4] })
      marker.on('click', () => onOpenRef.current(doc))
      marker.addTo(layer)
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 14, animate: false })
  }, [documents])

  const geoCount = documents.reduce((n, d) => n + (docGeo(d) ? 1 : 0), 0)

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Located-count badge */}
      <div className="pointer-events-none absolute right-2 top-2 z-[1000] rounded-md border bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        <MapPin className="mr-1 inline h-3 w-3 align-[-2px]" />
        {geoCount} of {documents.length} located
      </div>

      {geoCount === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div className="rounded-lg border bg-card/95 px-4 py-3 text-center shadow-md">
            <p className="text-sm font-medium text-foreground">No located documents</p>
            <p className="text-xs text-muted-foreground">None of these documents carry location metadata.</p>
          </div>
        </div>
      )}
    </div>
  )
}

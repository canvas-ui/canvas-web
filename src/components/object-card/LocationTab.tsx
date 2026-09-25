import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/** Read-only location view; editing remains in the document's edit form. */
export default function LocationTab({ lat, lon }: { lat: number; lon: number }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!container.current) return
    const map = L.map(container.current).setView([lat, lon], 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)
    // A vector marker avoids Leaflet's external default marker image assets.
    L.circleMarker([lat, lon], { radius: 8, color: '#ffffff', weight: 2, fillColor: '#8b5cf6', fillOpacity: 1 }).addTo(map)
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container.current)
    return () => { observer.disconnect(); map.remove() }
  }, [lat, lon])

  return <div className="flex h-full min-h-80 flex-col gap-3">
    <p className="text-sm tabular-nums">{lat.toFixed(5)}, {lon.toFixed(5)}</p>
    <div ref={container} role="region" aria-label="Document location map" className="relative z-0 min-h-64 flex-1 overflow-hidden rounded-md border" />
  </div>
}

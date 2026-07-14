import type { Document, GeoSelection } from '@/types/workspace'

// Read a document's location from its extracted metadata (EXIF GPS, geocoded
// address, etc.). Any document type can carry `metadata.geo.{lat,lon}` — photos
// and notes most commonly, but also todos, files and emails.
export function readDocGeo(doc: Document): { lat: number; lon: number } | null {
  const g = (doc.metadata as Record<string, unknown> | undefined)?.geo as { lat?: unknown; lon?: unknown } | undefined
  const rawLat = g?.lat
  const rawLon = g?.lon
  // Reject missing/empty coords BEFORE coercing — Number(null) and Number('')
  // are 0 (both finite), which would drop the document on "Null Island" (0,0)
  // in the middle of the ocean. A record with { lat: null, lon: null } is
  // "no location", not the equator.
  if (rawLat == null || rawLon == null || rawLat === '' || rawLon === '') return null
  const lat = Number(rawLat)
  const lon = Number(rawLon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  // Exact (0,0) is almost always sentinel/bad data rather than a real fix off
  // the Gulf of Guinea — treat it as unlocated too.
  if (lat === 0 && lon === 0) return null
  return { lat, lon }
}

// Ray-casting point-in-polygon. `ring` is an array of {lat,lon} vertices.
function pointInRing(lat: number, lon: number, ring: Array<{ lat: number; lon: number }>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat, xi = ring[i].lon
    const yj = ring[j].lat, xj = ring[j].lon
    const intersects = (yi > lat) !== (yj > lat)
      && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export function pointInGeoSelection(lat: number, lon: number, sel: GeoSelection): boolean {
  if (sel.kind === 'rect') {
    const b = sel.bbox
    return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon
  }
  return sel.points.length >= 3 && pointInRing(lat, lon, sel.points)
}

// A document is inside a selection only when it carries a location and that
// point falls within the drawn area. Non-located documents are excluded while a
// selection is active (the map filter answers "what's in this area").
export function docInGeoSelection(doc: Document, sel: GeoSelection): boolean {
  const g = readDocGeo(doc)
  if (!g) return false
  return pointInGeoSelection(g.lat, g.lon, sel)
}

/**
 * LocationPickerSheet — slide-in map for picking a location by hand ("custom
 * geotag"), for documents whose place has nothing to do with where the device
 * is: a todo at the peak of Slavkovský štít, a note about a restaurant, a file
 * about a site you visited last year.
 *
 * Same tile stack as the toolbox MapTab (Leaflet + OSM), plus Nominatim search
 * and reverse geocoding. Both Nominatim calls are best-effort: the picker is a
 * MAP picker, and a failed/rate-limited lookup must never block confirming a
 * point that is already selected on screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Check, Crosshair, LocateFixed, Loader2, MapPin, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEscapeClose } from '@/hooks/useEscapeClose'

// Violet, matching the MapTab pin. Literal hex, not a theme token: it is written
// into a raw HTML string for the divIcon, where `var()` does not resolve.
const PIN_COLOR = '#8b5cf6'

const NOMINATIM = 'https://nominatim.openstreetmap.org'
// Nominatim's usage policy asks for at most one request a second. Search runs
// on explicit submit only (Enter / the button), and reverse lookups are
// debounced and abortable, so a drag across the map fires one call, not fifty.
const REVERSE_DEBOUNCE_MS = 700

export interface PickedLocation {
  lat: number
  lon: number
  /** Reverse-geocoded display name. UI only — the server drops unknown geo keys. */
  label?: string
}

interface SearchResult {
  lat: string
  lon: string
  display_name: string
  boundingbox?: [string, string, string, string]
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

function pinIcon(): L.DivIcon {
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px 9999px 9999px 2px;transform:rotate(-45deg);background:${PIN_COLOR};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"><div style="width:8px;height:8px;border-radius:9999px;background:#fff"></div></div>`
  return L.divIcon({ html, className: 'canvas-map-pick', iconSize: [28, 28], iconAnchor: [14, 28] })
}

export function LocationPickerSheet({
  initial, onPick, onClose,
}: {
  initial?: { lat: number; lon: number } | null
  onPick: (location: PickedLocation) => void
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  const [picked, setPicked] = useState<PickedLocation | null>(
    initial ? { lat: initial.lat, lon: initial.lon } : null,
  )
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [locating, setLocating] = useState(false)
  // Drives the enter transition — mounted off-screen, then slid in on the next
  // frame so the browser has a "from" state to animate out of.
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Shared overlay stack (useEscapeClose) so Esc closes THIS sheet, not the
  // modal it may be stacked over.
  useEscapeClose(onClose)

  // Move (or create) the pin and remember the point. Reverse geocoding is
  // kicked off separately so the coordinates are usable immediately.
  const placePin = useCallback((lat: number, lon: number, label?: string) => {
    const map = mapRef.current
    if (!map) return
    const pos = L.latLng(lat, lon)
    if (markerRef.current) markerRef.current.setLatLng(pos)
    else {
      markerRef.current = L.marker(pos, { icon: pinIcon(), draggable: true, autoPan: true }).addTo(map)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current!.getLatLng()
        setPicked({ lat: round6(p.lat), lon: round6(p.lng) })
      })
    }
    setPicked({ lat: round6(lat), lon: round6(lon), ...(label ? { label } : {}) })
  }, [])

  // ── Init the map once ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, {
      center: initial ? [initial.lat, initial.lon] : [20, 0],
      zoom: initial ? 13 : 2,
      worldCopyJump: true,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    if (initial) placePin(initial.lat, initial.lon)

    map.on('click', (ev: L.LeafletMouseEvent) => placePin(ev.latlng.lat, ev.latlng.lng))

    // The panel slides in after mount, so leaflet's first size read is of a
    // zero/￼off-screen box — re-measure once the transition settles and on resize.
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    const t = setTimeout(() => map.invalidateSize(), 260)

    return () => {
      clearTimeout(t)
      ro.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // Mount-only: `initial` is a starting point, not a live binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reverse geocode the picked point (best effort) ─────────────────────────
  useEffect(() => {
    if (!picked || picked.label) return
    const { lat, lon } = picked
    const ctrl = new AbortController()
    // Flagged inside the timer, not in the effect body: a pin dragged across the
    // map re-runs this effect per move, and the lookup only actually starts once
    // the debounce elapses.
    const t = setTimeout(() => {
      setResolving(true)
      fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lon}`, {
        signal: ctrl.signal, headers: { Accept: 'application/json' },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const name = j?.display_name
          if (typeof name === 'string' && name) {
            setPicked((p) => (p && p.lat === lat && p.lon === lon ? { ...p, label: name } : p))
          }
        })
        .catch(() => { /* a nameless point is still a valid point */ })
        .finally(() => setResolving(false))
    }, REVERSE_DEBOUNCE_MS)
    // abort() rejects the in-flight fetch, so its own finally clears the flag.
    return () => { clearTimeout(t); ctrl.abort() }
  }, [picked])

  // ── Search ─────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (q.length < 2) return
    setSearching(true)
    setSearchError(null)
    try {
      const res = await fetch(`${NOMINATIM}/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const list = (await res.json()) as SearchResult[]
      setResults(list)
      if (!list.length) setSearchError('No match — try a different spelling, or just click the map')
    } catch {
      setSearchError('Search is unavailable right now — click the map to place a pin')
    } finally {
      setSearching(false)
    }
  }, [query])

  // Device fix as a starting point — the edit path has no other way to say
  // "here", and on the add path it saves a search for somewhere you're standing.
  // The pin it drops is still a manual pick, so it stays draggable.
  const locateMe = useCallback(() => {
    if (!navigator.geolocation) { setSearchError('This browser has no geolocation'); return }
    setLocating(true)
    setSearchError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 16)
        placePin(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setLocating(false)
        setSearchError('Could not read your location — search or click the map instead')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [placePin])

  const chooseResult = useCallback((r: SearchResult) => {
    const map = mapRef.current
    const lat = Number(r.lat)
    const lon = Number(r.lon)
    if (!map || !Number.isFinite(lat) || !Number.isFinite(lon)) return
    // Fit the result's own bounds when it has them (a town gets its extent, a
    // summit gets a tight box), otherwise zoom in close on the point.
    const bb = r.boundingbox?.map(Number)
    if (bb && bb.length === 4 && bb.every(Number.isFinite)) {
      map.fitBounds(L.latLngBounds([bb[0], bb[2]], [bb[1], bb[3]]), { maxZoom: 16 })
    } else {
      map.setView([lat, lon], 15)
    }
    placePin(lat, lon, r.display_name)
    setResults([])
  }, [placePin])

  return createPortal(
    <>
      <div
        className={cn('fixed inset-0 z-[60] bg-black/40 transition-opacity duration-200', shown ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Pick a location on the map"
        className={cn(
          'fixed inset-y-0 right-0 z-[61] flex w-[min(560px,100vw)] flex-col bg-background shadow-elevation-4 transition-transform duration-200 ease-out',
          shown ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-4 w-4 text-info" />
            Custom geotag
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative shrink-0 border-b px-3 py-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                autoFocus
                onChange={(e) => { setQuery(e.target.value); setSearchError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
                placeholder="Search a place — e.g. Slavkovský štít"
                spellCheck={false}
                className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <button
              type="button"
              onClick={locateMe}
              disabled={locating}
              title="Use my current location"
              aria-label="Use my current location"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || query.trim().length < 2}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Search
            </button>
          </div>
          {searchError && <p className="mt-1 text-xs text-warning">{searchError}</p>}

          {results.length > 0 && (
            <div className="absolute inset-x-3 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-elevation-4">
              {results.map((r) => (
                <button
                  key={`${r.lat},${r.lon},${r.display_name}`}
                  type="button"
                  onClick={() => chooseResult(r)}
                  className="block w-full border-b border-border/60 px-3 py-2 text-left text-xs last:border-0 hover:bg-muted"
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="relative min-h-0 flex-1">
          <div ref={containerRef} className="h-full w-full" />
          {!picked && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <span className="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-elevation-2">
                Click the map to drop a pin — drag it to fine-tune
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t px-3 py-2">
          <div className="min-w-0 text-xs">
            {picked ? (
              <>
                <div className="flex items-center gap-1.5 tabular-nums text-foreground">
                  <Crosshair className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {picked.lat.toFixed(5)}, {picked.lon.toFixed(5)}
                  {resolving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                {picked.label && <div className="truncate text-muted-foreground">{picked.label}</div>}
              </>
            ) : (
              <span className="text-muted-foreground">No point selected</span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!picked}
              onClick={() => { if (picked) { onPick(picked); onClose() } }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Use this point
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocumentGeo } from '@/types/workspace'

export type GeotagPermission = 'granted' | 'prompt' | 'denied' | 'unsupported'

// enableHighAccuracy: a note/photo pin is worth the extra second and battery.
// maximumAge lets a fix from the last minute answer instantly — walking-speed
// staleness is far below the accuracy radius we'd get anyway.
const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }

function toGeo(position: GeolocationPosition): DocumentGeo {
  const c = position.coords
  const geo: DocumentGeo = { lat: c.latitude, lon: c.longitude, source: 'device' }
  if (c.altitude != null && Number.isFinite(c.altitude)) geo.alt = c.altitude
  if (Number.isFinite(c.accuracy)) geo.accuracy = Math.round(c.accuracy)
  return geo
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS))
}

function describeError(err: unknown): string {
  const code = (err as GeolocationPositionError | undefined)?.code
  if (code === 1) return 'Location permission denied'
  if (code === 2) return 'Location unavailable; no fix right now'
  if (code === 3) return 'Timed out waiting for a location fix'
  return 'Could not read your location'
}

export interface Geotag {
  /** Geolocation is usable at all (API present AND secure context). */
  supported: boolean
  permission: GeotagPermission
  enabled: boolean
  busy: boolean
  error: string | null
  /** Last fix taken, shown as feedback while the form is open. */
  fix: DocumentGeo | null
  setEnabled: (on: boolean) => void
  /** Hand-picked point (map picker), source 'manual'. Overrides the device fix. */
  manual: DocumentGeo | null
  /** Display name of the manual point — UI only, never persisted (see setManual). */
  manualLabel: string | null
  setManual: (point: { lat: number; lon: number; label?: string } | null) => void
  /** Fresh fix for the doc about to be saved; null when off/unavailable. */
  capture: () => Promise<DocumentGeo | null>
}

/**
 * Opt-in device geotagging for document creation. Default OFF — a location is
 * never attached unless the user asks for it on this specific document.
 */
export function useGeotag(): Geotag {
  // Geolocation is a secure-context API. Served over plain http on a LAN IP
  // (http://192.168.x.x:8001) `navigator.geolocation` may still exist but every
  // call fails — so check isSecureContext too and grey the toggle out with an
  // honest reason rather than letting it fail at save time.
  const supported = typeof navigator !== 'undefined'
    && 'geolocation' in navigator
    && typeof window !== 'undefined'
    && window.isSecureContext

  const [permission, setPermission] = useState<GeotagPermission>(supported ? 'prompt' : 'unsupported')
  const [enabled, setEnabledState] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fix, setFix] = useState<DocumentGeo | null>(null)
  const [manual, setManualState] = useState<DocumentGeo | null>(null)
  const [manualLabel, setManualLabel] = useState<string | null>(null)

  // capture() is called from save() closures — refs keep it reading live values
  // without re-creating the callback on every keystroke.
  const enabledRef = useRef(false)
  const fixRef = useRef<DocumentGeo | null>(null)
  const manualRef = useRef<DocumentGeo | null>(null)

  useEffect(() => {
    if (!supported || !navigator.permissions?.query) return
    let cancelled = false
    let status: PermissionStatus | null = null
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        if (cancelled) return
        status = s
        setPermission(s.state as GeotagPermission)
        // Reflect a grant/revoke made in browser settings while the form is open.
        s.onchange = () => setPermission(s.state as GeotagPermission)
      })
      // Safari/iOS doesn't expose geolocation to the Permissions API at all.
      // Staying on 'prompt' is the correct fallback: the toggle stays live and
      // the OS prompt fires on first tap. Never grey out on a query failure —
      // that would disable geotagging for every iOS PWA user.
      .catch(() => { /* keep 'prompt' */ })
    return () => {
      cancelled = true
      if (status) status.onchange = null
    }
  }, [supported])

  /**
   * Set (or clear) a hand-picked location. Independent of device support: a
   * custom geotag is just a point on a map, so it works on an insecure origin
   * and with location permission denied — the cases where the switch is dead.
   *
   * The label is kept for the form's own feedback only. The server's
   * normalizeGeo() coerces geo to {lat,lon,alt,accuracy,source} and drops
   * everything else, so persisting a name here would be a silent no-op.
   */
  const setManual = useCallback((point: { lat: number; lon: number; label?: string } | null) => {
    setError(null)
    if (!point) {
      manualRef.current = null
      setManualState(null)
      setManualLabel(null)
      // Only the manual pin is being cleared; a device fix (if the switch is on)
      // stays the active source.
      if (!enabledRef.current) setEnabledState(false)
      return
    }
    // 'manual' outranks device/exif server-side (core/workspace/lib/geo.js), so a
    // hand-placed pin survives re-indexing instead of being reverted to a fix.
    const geo: DocumentGeo = { lat: point.lat, lon: point.lon, source: 'manual' }
    manualRef.current = geo
    setManualState(geo)
    setManualLabel(point.label ?? null)
    setEnabledState(true)
  }, [])

  const setEnabled = useCallback((on: boolean) => {
    setError(null)
    if (!on) {
      enabledRef.current = false
      manualRef.current = null
      setManualState(null)
      setManualLabel(null)
      setEnabledState(false)
      return
    }
    // A manual pin already answers "where"; flipping the switch on top of it
    // would fire the OS prompt and then lose to the pin at capture() anyway.
    if (manualRef.current) return
    if (!supported) return
    enabledRef.current = true
    setEnabledState(true)
    // Warm a fix immediately: the OS prompt then appears while the user is
    // looking at the toggle they just flipped (not silently at save), it proves
    // the permission works, and it shows the accuracy they're about to record.
    setBusy(true)
    getPosition()
      .then((p) => {
        const geo = toGeo(p)
        fixRef.current = geo
        setFix(geo)
        setPermission('granted')
      })
      .catch((err) => {
        setError(describeError(err))
        if ((err as GeolocationPositionError)?.code === 1) {
          setPermission('denied')
          enabledRef.current = false
          setEnabledState(false)
        }
      })
      .finally(() => setBusy(false))
  }, [supported])

  const capture = useCallback(async (): Promise<DocumentGeo | null> => {
    // A hand-picked point wins outright: the user said where this document
    // belongs, so never overwrite it with wherever the device happens to be.
    if (manualRef.current) return manualRef.current
    if (!enabledRef.current || !supported) return null
    try {
      return toGeo(await getPosition())
    } catch {
      // Fall back to the fix taken when the toggle flipped rather than failing
      // the save — a minute-old location still beats no location.
      return fixRef.current
    }
  }, [supported])

  return {
    supported, permission, enabled, busy, error, fix, setEnabled,
    manual, manualLabel, setManual, capture,
  }
}

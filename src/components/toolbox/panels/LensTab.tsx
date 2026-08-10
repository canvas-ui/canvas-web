import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CircleStop, LocateFixed, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox } from '../toolbox-context'
import { useWebcam } from '@/hooks/useWebcam'
import { searchByImage } from '@/services/lens'

// The Lens filter tab: LIVE feeds refining the current view, sitting beside
// Features / Timeline / Map.
//
//  - GPS refine: a watched device fix → `geo:near:<lat>,<lon>,<radius>m`
//    filter token. The fix is rounded (4dp ≈ 11 m) and only re-committed when
//    it actually moves, so GPS jitter never causes refetch storms.
//  - Camera / Desktop refine: frames at ~1 FPS → search-by-image (idsOnly,
//    frames are ephemeral) → majority-vote smoothing → the survivors become an
//    `ids` constraint ANDed into the listing.
//
// All of it is deliberately EPHEMERAL state: cleared rather than persisted —
// a saved canvas must not replay yesterday's position or a long-gone frame.

const RADII = [
  { label: '25 m', m: 25 },
  { label: '100 m', m: 100 },
  { label: '500 m', m: 500 },
  { label: '2 km', m: 2000 },
  { label: '10 km', m: 10000 },
] as const

const SMOOTH_WINDOW = 3
const FRAME_MS = 1000
const KNN_LIMIT = 32

const selectClass = 'h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring'
const inputClass = 'h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring'

const round4 = (n: number) => Math.round(n * 10000) / 10000

export function LensTab() {
  const { state, setLensGps, setLensIds } = useToolbox()
  const lens = state.filters.lens
  const workspaceName = state.activeWorkspaceName

  // ── GPS refine ─────────────────────────────────────────────────────────────
  const [gpsOn, setGpsOn] = useState(lens.gps !== null)
  const [radiusM, setRadiusM] = useState(lens.gps?.radiusM ?? 100)
  const [gpsError, setGpsError] = useState<string | null>(null)
  // Bumping this re-runs the watch effect → a fresh watchPosition call, which
  // re-opens the permission dialog when the browser still allows prompting
  // (on Android, DISMISSING the dialog leaves state 'prompt' — retryable;
  // an explicit block leaves 'denied' — only site settings can undo that).
  const [gpsAttempt, setGpsAttempt] = useState(0)
  // Best-effort permission state (Safari/iOS has no permissions.query → stays
  // 'prompt' and the retry button simply remains available).
  const [gpsPermission, setGpsPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt')
  const watchRef = useRef<number | null>(null)
  const radiusRef = useRef(radiusM)
  useEffect(() => { radiusRef.current = radiusM }, [radiusM])

  const gpsSupported = 'geolocation' in navigator && window.isSecureContext

  useEffect(() => {
    if (!navigator.permissions?.query) return
    let status: PermissionStatus | null = null
    navigator.permissions.query({ name: 'geolocation' }).then((st) => {
      status = st
      setGpsPermission(st.state === 'granted' ? 'granted' : st.state === 'denied' ? 'denied' : 'prompt')
      st.onchange = () => setGpsPermission(st.state === 'granted' ? 'granted' : st.state === 'denied' ? 'denied' : 'prompt')
    }).catch(() => {})
    return () => { if (status) status.onchange = null }
  }, [])

  useEffect(() => {
    if (!gpsOn || !gpsSupported) return
    void gpsAttempt // effect dep: a retry re-invokes watchPosition (re-prompts)
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = round4(pos.coords.latitude)
        const lon = round4(pos.coords.longitude)
        // Re-commit only on actual movement (or radius change, handled below).
        setLensGps({ lat, lon, radiusM: radiusRef.current })
      },
      (err) => setGpsError(err.code === err.PERMISSION_DENIED ? 'Location permission denied.' : err.message),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    )
    watchRef.current = id
    return () => { navigator.geolocation.clearWatch(id); watchRef.current = null }
  }, [gpsOn, gpsSupported, gpsAttempt, setLensGps])

  const toggleGps = (on: boolean) => {
    setGpsOn(on)
    setGpsError(null)
    if (!on) setLensGps(null)
  }

  const retryGps = () => {
    setGpsError(null)
    setGpsOn(true)
    setGpsAttempt((n) => n + 1)
  }

  const changeRadius = (m: number) => {
    setRadiusM(m)
    if (lens.gps) setLensGps({ ...lens.gps, radiusM: m })
  }

  // ── Camera / Desktop refine ────────────────────────────────────────────────
  // Ending a screen share via the browser's own UI must also tear the loop
  // down — the hook reports it through onEnded (no reactive effect needed).
  const feedEndedRef = useRef<() => void>(() => {})
  const { videoRef, error: mediaError, start, startScreen, stop, captureFrame } = useWebcam({ onEnded: () => feedEndedRef.current() })
  const [source, setSource] = useState<'camera' | 'screen' | null>(null)
  const [maxDistance, setMaxDistance] = useState('')
  const [feedError, setFeedError] = useState<string | null>(null)
  const [lastCount, setLastCount] = useState<number | null>(null)

  const loopRef = useRef({ running: false, workspaceName: '', maxDistance: NaN })
  const historyRef = useRef<number[][]>([])
  const timerRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const tickRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    loopRef.current.workspaceName = workspaceName ?? ''
    loopRef.current.maxDistance = maxDistance === '' ? NaN : Number(maxDistance)
  }, [workspaceName, maxDistance])

  const tick = useCallback(async () => {
    const s = loopRef.current
    if (!s.running) return
    const frame = captureFrame()
    if (frame && s.workspaceName) {
      abortRef.current = new AbortController()
      try {
        const res = await searchByImage(s.workspaceName, frame, {
          maxDistance: Number.isFinite(s.maxDistance) ? s.maxDistance : undefined,
          limit: KNN_LIMIT,
          idsOnly: true,
          signal: abortRef.current.signal,
        })
        setFeedError(null)
        historyRef.current = [...historyRef.current.slice(-(SMOOTH_WINDOW - 1)), res.ids]
        const history = historyRef.current
        const union = [...new Set(history.flat())]
        // Majority vote across the window (raw pass-through until it fills).
        const smoothed = history.length < 2
          ? res.ids
          : union.filter((id) => history.filter((f) => f.includes(id)).length >= 2)
        setLastCount(smoothed.length)
        setLensIds(smoothed)
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') setFeedError((err as Error)?.message || 'search failed')
      }
    }
    if (loopRef.current.running) {
      timerRef.current = window.setTimeout(() => void tickRef.current(), FRAME_MS)
    }
  }, [captureFrame, setLensIds])

  useEffect(() => { tickRef.current = tick }, [tick])

  const startFeed = useCallback(async (kind: 'camera' | 'screen') => {
    const ok = kind === 'camera' ? await start() : await startScreen()
    if (!ok) return
    setSource(kind)
    historyRef.current = []
    loopRef.current.running = true
    void tick()
  }, [start, startScreen, tick])

  const stopFeed = useCallback(() => {
    loopRef.current.running = false
    if (timerRef.current) window.clearTimeout(timerRef.current)
    abortRef.current?.abort()
    stop()
    setSource(null)
    setLastCount(null)
    setLensIds(null)
  }, [stop, setLensIds])

  useEffect(() => { feedEndedRef.current = stopFeed }, [stopFeed])

  useEffect(() => stopFeed, [stopFeed])

  const feedRunning = source !== null

  return (
    <div className="flex flex-col gap-4 p-3 text-sm">
      {/* GPS */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={gpsOn}
              disabled={!gpsSupported}
              onChange={(e) => toggleGps(e.target.checked)}
            />
            <LocateFixed className="h-4 w-4 text-muted-foreground" />
            <span>Refine with GPS</span>
          </label>
          <select className={selectClass} value={radiusM} onChange={(e) => changeRadius(Number(e.target.value))} disabled={!gpsOn}>
            {RADII.map((r) => <option key={r.m} value={r.m}>{r.label}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          {!gpsSupported
            ? 'Needs a secure context (https or localhost) with location access.'
            : gpsPermission === 'denied'
              ? <span className="text-destructive">Location is blocked for this site — allow it in your browser/app settings, then retry.</span>
              : gpsError
                ? (
                  <span className="text-destructive">
                    {gpsError}{' '}
                    <button type="button" onClick={retryGps} className="underline hover:text-foreground">
                      Request again
                    </button>
                  </span>
                )
                : lens.gps
                ? `Showing documents within ${radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`} of ${lens.gps.lat}, ${lens.gps.lon}.`
                : gpsOn ? 'Waiting for a position fix…' : 'Resurface documents geotagged near your current position.'}
        </p>
      </section>

      {/* Camera / Desktop */}
      <section className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {feedRunning ? (
            <button
              type="button"
              onClick={stopFeed}
              className="flex h-7 items-center gap-1 rounded-md bg-destructive px-2.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              <CircleStop className="h-3.5 w-3.5" /> Stop {source === 'camera' ? 'camera' : 'recording'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void startFeed('camera')}
                disabled={!workspaceName}
                className="flex h-7 items-center gap-1 rounded-md bg-foreground px-2.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" /> Camera
              </button>
              <button
                type="button"
                onClick={() => void startFeed('screen')}
                disabled={!workspaceName}
                className="flex h-7 items-center gap-1 rounded-md bg-foreground px-2.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                <Monitor className="h-3.5 w-3.5" /> Desktop
              </button>
            </>
          )}
          <input
            className={cn(inputClass, 'w-24')}
            placeholder="max dist"
            inputMode="decimal"
            value={maxDistance}
            onChange={(e) => setMaxDistance(e.target.value)}
            title="Cosine-distance floor (0 = identical). Empty = top-K — loose but tunable."
          />
        </div>

        <div className={cn('relative overflow-hidden rounded-lg border border-border bg-black/80', feedRunning ? 'aspect-video' : 'hidden')}>
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        </div>

        <p className="text-xs text-muted-foreground">
          {mediaError || feedError ? (
            <span className="text-destructive">{mediaError || feedError}</span>
          ) : feedRunning ? (
            `Live — view narrowed to ${lastCount ?? '…'} match${lastCount === 1 ? '' : 'es'}. Frames are ephemeral, never stored.`
          ) : !workspaceName ? (
            'Open a workspace to refine with a live feed.'
          ) : (
            'Point a camera (or share a screen) — the view narrows to what the feed matches.'
          )}
        </p>
      </section>
    </div>
  )
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useToolboxOptional } from './toolbox-context'
import { useWebcam } from '@/hooks/useWebcam'
import { searchByImage } from '@/services/lens'
import { DEFAULT_LENS_RATE_MS } from './lens-rates'
import type { Document } from '@/types/workspace'

/**
 * The live Lens feed, hoisted out of the panels that display it.
 *
 * The camera used to be owned by whichever component drew it — so closing the
 * toolbox (`ToolboxPanel` renders null), switching T1 tabs, or moving between
 * Filters sub-tabs unmounted the owner and its cleanup killed the MediaStream
 * mid-session. On mobile that made the camera refine unusable outright: the
 * toolbox is a full-bleed drawer, so seeing your own results REQUIRES closing
 * the thing that was producing them.
 *
 * Here the stream and the frame loop live above the panels, at AppShell level,
 * and a panel is only ever a view onto them. When no view is mounted the feed
 * keeps running and `LensFeedWidget` collapses it into a floating preview —
 * a camera that outlives its UI must stay visible and killable from anywhere.
 *
 * Two consumers share one loop, because only one feed can run at a time:
 *  - `filter` (Filters → Lens): idsOnly kNN → smoothed survivors become the
 *    `lens.ids` constraint ANDed into the listing;
 *  - `applet` (Apps → Lens): hydrated documents + distances, optional fused
 *    text, scoped to the applet's bound path → its own result grid.
 *
 * All of it stays EPHEMERAL: frames are embedded for the query and never
 * stored, and nothing here is persisted across a reload.
 */

const SMOOTH_WINDOW = 3 // majority vote over the last N frames kills flicker
const FILTER_KNN_LIMIT = 32
const APPLET_LIMIT = 12

export type LensSource = 'camera' | 'screen'
export type LensConsumer = 'filter' | 'applet'

export interface LensHit {
  doc: Document
  distance?: number
}

interface StartOptions {
  /** Workspace the search runs against — the loop stops if it changes. */
  workspaceRef: string
  /** Applet only: bound path scoping the candidate set. */
  contextPath?: string | null
}

interface LensFeedValue {
  source: LensSource | null
  running: boolean
  paused: boolean
  consumer: LensConsumer | null
  stream: MediaStream | null
  workspaceRef: string
  rateMs: number
  setRateMs: (ms: number) => void
  maxDistance: string
  setMaxDistance: (value: string) => void
  /** Optional text → fused mode. Applet consumer only. */
  text: string
  setText: (value: string) => void
  error: string | null
  latencyMs: number | null
  /** Size of the current smoothed match set (null before the first response). */
  lastCount: number | null
  /** Hydrated hits — populated for the applet consumer only. */
  hits: LensHit[]
  start: (kind: LensSource, consumer: LensConsumer, opts: StartOptions) => Promise<boolean>
  /** Re-scope a running applet feed — its binding follows navigation. */
  setContextPath: (path: string | null) => void
  stop: () => void
  setPaused: (paused: boolean) => void
  /** Re-open the panel this feed was started from. */
  reopen: () => void
  /** True while some panel is displaying the feed (the widget stands down). */
  hasViewer: boolean
  registerViewer: () => () => void
}

const LensFeedCtx = createContext<LensFeedValue | null>(null)

export function useLensFeed(): LensFeedValue {
  const ctx = useContext(LensFeedCtx)
  if (!ctx) throw new Error('useLensFeed must be used within a LensFeedProvider')
  return ctx
}

/**
 * Declare that this component is showing the feed. While at least one viewer
 * is mounted the collapsed widget hides — two live previews of the same camera
 * on screen reads as two cameras.
 *
 * Pass false when the panel is mounted but NOT displaying the stream (the
 * other consumer owns it): the feed is then still unattended, and the widget
 * has to stay up.
 */
export function useLensFeedViewer(showing = true): void {
  const { registerViewer } = useLensFeed()
  useEffect(() => {
    if (!showing) return
    return registerViewer()
  }, [showing, registerViewer])
}

/**
 * A display surface for the live feed. Each mount gets its own <video> bound
 * to the shared MediaStream — the panel's preview and the widget's preview are
 * different elements showing one stream, so either can unmount freely.
 */
export function LensFeedVideo({ className }: { className?: string }) {
  const { stream } = useLensFeed()
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    if (stream) void el.play().catch(() => {})
    return () => { el.srcObject = null }
  }, [stream])
  return <video ref={ref} muted playsInline className={className} />
}

export function LensFeedProvider({ children }: { children: ReactNode }) {
  // Optional on purpose: the standalone applet host (/apps/lens) mounts this
  // provider outside the shell, where there is no toolbox to publish a filter
  // into or re-open. Reached through a ref so the loop's callbacks stay stable.
  const toolbox = useToolboxOptional()
  const toolboxRef = useRef(toolbox)
  useEffect(() => { toolboxRef.current = toolbox })
  const activeWorkspaceName = toolbox?.state.activeWorkspaceName ?? null
  const insideShell = toolbox !== null

  // Ending a share from the browser's own UI must tear the loop down too,
  // rather than leave it searching against black frames.
  const endedRef = useRef<() => void>(() => {})
  const { videoRef, stream, error: mediaError, start: startCamera, startScreen, stop: stopMedia, captureFrame } =
    useWebcam({ onEnded: () => endedRef.current() })

  const [source, setSource] = useState<LensSource | null>(null)
  const [consumer, setConsumer] = useState<LensConsumer | null>(null)
  const [paused, setPausedState] = useState(false)
  const [rateMs, setRateMs] = useState<number>(DEFAULT_LENS_RATE_MS)
  const [maxDistance, setMaxDistance] = useState('')
  const [text, setText] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [lastCount, setLastCount] = useState<number | null>(null)
  const [hits, setHits] = useState<LensHit[]>([])
  const [viewers, setViewers] = useState(0)
  const [workspaceRef, setWorkspaceRef] = useState('')

  // Loop state lives in refs: the chained-timeout tick must always read the
  // CURRENT knob values without re-creating the loop on every keystroke.
  const cfgRef = useRef({
    running: false,
    paused: false,
    consumer: null as LensConsumer | null,
    workspaceRef: '',
    contextPath: null as string | null,
    text: '',
    maxDistance: NaN,
    rateMs: DEFAULT_LENS_RATE_MS,
  })
  const historyRef = useRef<number[][]>([])
  const docsRef = useRef(new Map<number, LensHit>())
  // Last committed filter set — a stable scene must not dispatch identical
  // filter state every tick (each dispatch re-renders every toolbox consumer).
  const committedRef = useRef<number[] | null>(null)
  const timerRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // In-flight getUserMedia — see start().
  const startingRef = useRef(false)
  // The chained timeout re-enters tick() through this ref — a direct self-
  // reference inside its own useCallback trips lint and would go stale.
  const tickRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    cfgRef.current.text = text
    cfgRef.current.maxDistance = maxDistance === '' ? NaN : Number(maxDistance)
    cfgRef.current.rateMs = rateMs
    cfgRef.current.paused = paused
  }, [text, maxDistance, rateMs, paused])

  const registerViewer = useCallback(() => {
    setViewers((n) => n + 1)
    return () => setViewers((n) => Math.max(0, n - 1))
  }, [])

  // ── Result publishing ──────────────────────────────────────────────────────

  // Filter consumer: majority vote across the window, committed as an ids
  // constraint only when the set actually changes.
  const publishFilter = useCallback((ids: number[]) => {
    historyRef.current = [...historyRef.current.slice(-(SMOOTH_WINDOW - 1)), ids]
    const history = historyRef.current
    const union = [...new Set(history.flat())]
    const smoothed = history.length < 2
      ? ids
      : union.filter((id) => history.filter((f) => f.includes(id)).length >= 2)
    setLastCount(smoothed.length)
    const prev = committedRef.current
    if (!prev || prev.length !== smoothed.length || prev.some((id, i) => id !== smoothed[i])) {
      committedRef.current = smoothed
      toolboxRef.current?.setLensIds(smoothed)
    }
  }, [])

  // Applet consumer: same vote, but hydrated docs — and recently departed docs
  // that still hold a majority are re-adopted, so a hit doesn't blink out of
  // the grid the moment one frame misses it.
  const publishApplet = useCallback((docs: Document[], distances: Map<number, number>) => {
    for (const doc of docs) docsRef.current.set(doc.id, { doc, distance: distances.get(doc.id) })
    const ids = docs.map((d) => d.id)
    historyRef.current = [...historyRef.current.slice(-(SMOOTH_WINDOW - 1)), ids]
    const history = historyRef.current
    const latest = history[history.length - 1] ?? []
    const display = history.length < 2
      ? latest
      : latest.filter((id) => history.filter((frame) => frame.includes(id)).length >= 2)
    const majorityAbsent = [...docsRef.current.keys()].filter(
      (id) => !latest.includes(id) && history.filter((f) => f.includes(id)).length >= 2,
    )
    const shown = [...display, ...majorityAbsent]
      .map((id) => docsRef.current.get(id))
      .filter((h): h is LensHit => !!h)
    setLastCount(shown.length)
    setHits(shown)
  }, [])

  // ── The frame loop ─────────────────────────────────────────────────────────

  const tick = useCallback(async () => {
    const s = cfgRef.current
    if (!s.running) return
    const t0 = performance.now()
    if (!s.paused) {
      const frame = captureFrame()
      if (frame && s.workspaceRef) {
        const applet = s.consumer === 'applet'
        abortRef.current = new AbortController()
        try {
          const res = await searchByImage(s.workspaceRef, frame, {
            q: applet ? (s.text || undefined) : undefined,
            maxDistance: Number.isFinite(s.maxDistance) ? s.maxDistance : undefined,
            contextPath: applet ? s.contextPath : null,
            limit: applet ? APPLET_LIMIT : FILTER_KNN_LIMIT,
            idsOnly: !applet,
            debug: applet,
            signal: abortRef.current.signal,
          })
          setLatencyMs(Math.round(performance.now() - t0))
          setSearchError(null)
          if (applet) {
            publishApplet(res.documents, new Map((res.distances ?? []).map((d) => [d.id, d.distance])))
          } else {
            publishFilter(res.ids)
          }
        } catch (err) {
          if ((err as Error)?.name !== 'AbortError') setSearchError((err as Error)?.message || 'search failed')
        }
      }
    }
    if (cfgRef.current.running) {
      // Charge frame-capture + request time against the interval so the
      // selected rate is the actual rate; at 15–30 fps this degrades to
      // back-to-back (never overlapping) requests, capped by search latency.
      const delay = Math.max(0, cfgRef.current.rateMs - (performance.now() - t0))
      timerRef.current = window.setTimeout(() => void tickRef.current(), delay)
    }
  }, [captureFrame, publishApplet, publishFilter])

  useEffect(() => { tickRef.current = tick }, [tick])

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    const wasFilter = cfgRef.current.consumer === 'filter'
    cfgRef.current.running = false
    cfgRef.current.consumer = null
    if (timerRef.current) window.clearTimeout(timerRef.current)
    abortRef.current?.abort()
    stopMedia()
    historyRef.current = []
    docsRef.current.clear()
    committedRef.current = null
    setSource(null)
    setConsumer(null)
    setPausedState(false)
    setWorkspaceRef('')
    setHits([])
    setLastCount(null)
    setLatencyMs(null)
    setSearchError(null)
    // Only the filter consumer owns a listing constraint; clearing it for the
    // applet would wipe a refine the user set from the Filters tab.
    if (wasFilter) toolboxRef.current?.setLensIds(null)
  }, [stopMedia])

  useEffect(() => { endedRef.current = stop }, [stop])

  const start = useCallback(async (kind: LensSource, who: LensConsumer, opts: StartOptions) => {
    if (!opts.workspaceRef) return false
    // One feed at a time — a second start replaces the first rather than
    // racing it for frames. `running` only flips after the await, so an
    // impatient double-tap needs its own guard: two getUserMedia grants would
    // leave one stream live with nothing tracking it.
    if (startingRef.current) return false
    if (cfgRef.current.running) stop()
    startingRef.current = true
    const ok = kind === 'camera' ? await startCamera() : await startScreen()
    startingRef.current = false
    if (!ok) return false
    historyRef.current = []
    docsRef.current.clear()
    committedRef.current = null
    setHits([])
    setLastCount(null)
    setSearchError(null)
    setWorkspaceRef(opts.workspaceRef)
    cfgRef.current = {
      ...cfgRef.current,
      running: true,
      paused: false,
      consumer: who,
      workspaceRef: opts.workspaceRef,
      contextPath: opts.contextPath ?? null,
    }
    setSource(kind)
    setConsumer(who)
    setPausedState(false)
    void tick()
    return true
  }, [startCamera, startScreen, stop, tick])

  // The applet's binding tracks navigation, so the scope has to stay live for
  // the running loop rather than being frozen at start().
  const setContextPath = useCallback((path: string | null) => {
    cfgRef.current.contextPath = path
  }, [])

  const setPaused = useCallback((next: boolean) => {
    cfgRef.current.paused = next
    setPausedState(next)
  }, [])

  // The results are meaningless against a different workspace, so navigating
  // away ends the session rather than silently re-scoping it. Only inside the
  // shell — the standalone host has no navigation state and would read every
  // workspace as "changed".
  useEffect(() => {
    if (!insideShell || !cfgRef.current.running) return
    if (activeWorkspaceName && activeWorkspaceName === cfgRef.current.workspaceRef) return
    stop()
  }, [insideShell, activeWorkspaceName, stop])

  const reopen = useCallback(() => {
    const tb = toolboxRef.current
    if (!tb) return
    if (cfgRef.current.consumer === 'applet') {
      tb.setView('apps')
      tb.openApplet('lens')
      return
    }
    tb.setView('tools')
    tb.setToolsTab('lens')
  }, [])

  useEffect(() => stop, [stop])

  const value = useMemo<LensFeedValue>(() => ({
    source,
    running: source !== null,
    paused,
    consumer,
    stream,
    workspaceRef,
    rateMs,
    setRateMs,
    maxDistance,
    setMaxDistance,
    text,
    setText,
    error: mediaError || searchError,
    latencyMs,
    lastCount,
    hits,
    start,
    setContextPath,
    stop,
    setPaused,
    reopen,
    hasViewer: viewers > 0,
    registerViewer,
  }), [source, paused, consumer, stream, workspaceRef, rateMs, maxDistance, text, mediaError, searchError, latencyMs, lastCount, hits, start, setContextPath, stop, setPaused, reopen, viewers, registerViewer])

  return (
    <LensFeedCtx.Provider value={value}>
      {children}
      {/* The capture source. It must stay mounted and rendered wherever the
          feed is displayed — captureFrame() draws from THIS element, and a
          `display:none` video stops producing frames in several browsers, so
          it is parked off-screen at 1px instead of hidden. */}
      <video
        ref={videoRef}
        muted
        playsInline
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-0 h-px w-px opacity-0"
      />
    </LensFeedCtx.Provider>
  )
}

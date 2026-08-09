import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CircleStop, Focus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppletTarget } from './applet-target'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { useDocumentThumbnail } from '@/components/renderers/useDocumentThumbnail'
import { getDocumentDisplayInfo, isImageFile } from '@/lib/document-display'
import { useWebcam } from '@/hooks/useWebcam'
import { searchByImage } from '@/services/lens'
import type { Document } from '@/types/workspace'

// The Lens applet: point a camera at something, the documents related to it
// surface underneath — v0 of the sensord loop, running client-side. Webcam
// frames at a low fixed cadence → POST /documents/search/image (frames are
// ephemeral: embedded for the query, never stored or indexed) → majority-vote
// smoothing over the last few responses → result grid. Optional text switches
// the server to fused mode so notes surface next to photos. The applet binding
// scopes the search: bound to a path, only documents under it can match.

const RATES = [
  { label: '2 fps', ms: 500 },
  { label: '1 fps', ms: 1000 },
  { label: '0.5 fps', ms: 2000 },
] as const

const SMOOTH_WINDOW = 3 // majority vote over the last N frames kills flicker

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'
const inputClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring'

function LensHit({ workspaceRef, doc, distance }: { workspaceRef: string; doc: Document; distance?: number }) {
  const isImage = isImageFile(doc)
  const { blobUrl } = useDocumentThumbnail(workspaceRef, doc.id, 256, { enabled: isImage })
  const info = getDocumentDisplayInfo(doc)
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
        {isImage && blobUrl ? (
          <img src={blobUrl} alt={info.title} className="h-full w-full object-cover" />
        ) : (
          <DocumentIcon document={doc} size={10} />
        )}
      </div>
      <div className="p-2 min-w-0">
        <div className="text-xs font-medium truncate" title={info.title}>{info.title}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {info.schemaLabel}
          {distance != null ? ` · d=${distance.toFixed(3)}` : ''}
        </div>
      </div>
    </div>
  )
}

export function LensApplet() {
  const target = useAppletTarget()
  const { videoRef, active, error: cameraError, start, stop, captureFrame } = useWebcam()
  const [rateMs, setRateMs] = useState<number>(1000)
  const [text, setText] = useState('')
  const [maxDistance, setMaxDistance] = useState('')
  const [running, setRunning] = useState(false)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [hits, setHits] = useState<Array<{ doc: Document; distance?: number }>>([])

  const workspaceRef = target?.mode === 'workspace' ? target.workspaceName : ''
  const boundPath = target?.mode === 'workspace' && target.path !== '/' ? target.path : null

  // Loop state lives in refs: the chained-timeout tick must always read the
  // CURRENT knob values without re-creating the loop on every keystroke.
  const loopRef = useRef({ running: false, workspaceRef: '', boundPath: null as string | null, text: '', maxDistance: NaN, rateMs: 1000 })
  const historyRef = useRef<number[][]>([])
  const docsRef = useRef(new Map<number, { doc: Document; distance?: number }>())
  const timerRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // The chained timeout re-enters tick() through this ref — a direct self-
  // reference inside its own useCallback trips lint and would go stale.
  const tickRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    loopRef.current.workspaceRef = workspaceRef
    loopRef.current.boundPath = boundPath
    loopRef.current.text = text
    loopRef.current.maxDistance = maxDistance === '' ? NaN : Number(maxDistance)
    loopRef.current.rateMs = rateMs
  }, [workspaceRef, boundPath, text, maxDistance, rateMs])

  const applySmoothing = useCallback(() => {
    const history = historyRef.current
    const latest = history[history.length - 1] ?? []
    // Under 2 samples show raw; after that require presence in ≥2 of the window.
    const display =
      history.length < 2
        ? latest
        : latest.filter((id) => history.filter((frame) => frame.includes(id)).length >= 2)
    // Re-adopt recently departed docs that still hold a majority (sticky-out).
    const majorityAbsent = [...docsRef.current.keys()].filter(
      (id) => !latest.includes(id) && history.filter((f) => f.includes(id)).length >= 2,
    )
    const ids = [...display, ...majorityAbsent]
    setHits(ids.map((id) => docsRef.current.get(id)).filter((h): h is { doc: Document; distance?: number } => !!h))
  }, [])

  const tick = useCallback(async () => {
    const s = loopRef.current
    if (!s.running) return
    const frame = captureFrame()
    if (frame && s.workspaceRef) {
      abortRef.current = new AbortController()
      const t0 = performance.now()
      try {
        const res = await searchByImage(s.workspaceRef, frame, {
          q: s.text || undefined,
          maxDistance: Number.isFinite(s.maxDistance) ? s.maxDistance : undefined,
          contextPath: s.boundPath,
          limit: 12,
          debug: true,
          signal: abortRef.current.signal,
        })
        setLatencyMs(Math.round(performance.now() - t0))
        setRequestError(null)
        const distances = new Map((res.distances ?? []).map((d) => [d.id, d.distance]))
        const ids = res.documents.map((d) => d.id)
        for (const doc of res.documents) docsRef.current.set(doc.id, { doc, distance: distances.get(doc.id) })
        historyRef.current = [...historyRef.current.slice(-(SMOOTH_WINDOW - 1)), ids]
        applySmoothing()
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          setRequestError((err as Error)?.message || 'search failed')
        }
      }
    }
    if (loopRef.current.running) {
      timerRef.current = window.setTimeout(() => void tickRef.current(), loopRef.current.rateMs)
    }
  }, [captureFrame, applySmoothing])

  useEffect(() => { tickRef.current = tick }, [tick])

  const startLens = useCallback(async () => {
    const ok = await start()
    if (!ok) return
    historyRef.current = []
    docsRef.current.clear()
    setHits([])
    loopRef.current.running = true
    setRunning(true)
    void tick()
  }, [start, tick])

  const stopLens = useCallback(() => {
    loopRef.current.running = false
    setRunning(false)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    abortRef.current?.abort()
    stop()
  }, [stop])

  useEffect(() => stopLens, [stopLens])

  if (target?.mode !== 'workspace') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Lens searches a workspace — bind it to a workspace path to start.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <select className={selectClass} value={rateMs} onChange={(e) => setRateMs(Number(e.target.value))}>
          {RATES.map((r) => (
            <option key={r.ms} value={r.ms}>{r.label}</option>
          ))}
        </select>
        <input
          className={cn(inputClass, 'w-44')}
          placeholder="Optional text (fused mode)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          className={cn(inputClass, 'w-28')}
          placeholder="max distance"
          inputMode="decimal"
          value={maxDistance}
          onChange={(e) => setMaxDistance(e.target.value)}
          title="Cosine-distance floor (0 = identical). Empty = top-K."
        />
        <button
          type="button"
          onClick={() => (running ? stopLens() : void startLens())}
          className={cn(
            'flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors',
            running ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-foreground text-background hover:bg-foreground/90',
          )}
        >
          {running ? <CircleStop className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
          {running ? 'Stop' : 'Start'}
        </button>
      </div>

      <div className="relative shrink-0 overflow-hidden rounded-xl border border-border bg-black/80 aspect-video max-h-64">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            <Focus className="mr-2 h-4 w-4" /> camera off
          </div>
        )}
      </div>

      <div className="shrink-0 text-xs text-muted-foreground">
        {cameraError || requestError ? (
          <span className="text-destructive">{cameraError || requestError}</span>
        ) : running ? (
          <>live · {latencyMs != null ? `${latencyMs} ms/frame` : 'searching…'} · {hits.length} match{hits.length === 1 ? '' : 'es'}{boundPath ? ` · scoped to ${boundPath}` : ''}</>
        ) : (
          'Frames are ephemeral: embedded for the query, never stored or indexed.'
        )}
      </div>

      {hits.length === 0 ? (
        <div className="flex min-h-24 flex-1 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          {running ? 'Nothing matching in view' : 'Matches appear here'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {hits.map((h) => (
            <LensHit key={h.doc.id} workspaceRef={workspaceRef} doc={h.doc} distance={h.distance} />
          ))}
        </div>
      )}
    </div>
  )
}

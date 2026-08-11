import { useEffect } from 'react'
import { Camera, CircleStop, Focus, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppletTarget } from './applet-target'
import { useDocumentModal } from '@/components/shell/document-modal-context'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { useDocumentThumbnail } from '@/components/renderers/useDocumentThumbnail'
import { getDocumentDisplayInfo, isImageFile } from '@/lib/document-display'
import { useLensFeed, useLensFeedViewer, LensFeedVideo } from '../lens-feed-context'
import { LENS_RATES } from '../lens-rates'
import type { Document } from '@/types/workspace'

// The Lens applet: point a camera at something, the documents related to it
// surface underneath — v0 of the sensord loop, running client-side. Webcam
// frames at a low fixed cadence → POST /documents/search/image (frames are
// ephemeral: embedded for the query, never stored or indexed) → majority-vote
// smoothing over the last few responses → result grid. Optional text switches
// the server to fused mode so notes surface next to photos. The applet binding
// scopes the search: bound to a path, only documents under it can match.
//
// The feed itself belongs to LensFeedProvider (see lens-feed-context.tsx), so
// closing the toolbox collapses it to a widget instead of killing the camera.

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'
const inputClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring'

function LensHit({ workspaceRef, doc, distance, onOpen }: { workspaceRef: string; doc: Document; distance?: number; onOpen: (doc: Document) => void }) {
  const isImage = isImageFile(doc)
  const { blobUrl } = useDocumentThumbnail(workspaceRef, doc.id, 256, { enabled: isImage })
  const info = getDocumentDisplayInfo(doc)
  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      title={`Open ${info.title}`}
      className="rounded-lg border border-border bg-card overflow-hidden flex flex-col text-left cursor-pointer transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
    </button>
  )
}

export function LensApplet() {
  const target = useAppletTarget()
  const documentModal = useDocumentModal()
  const feed = useLensFeed()
  const { rateMs, setRateMs, text, setText, maxDistance, setMaxDistance, latencyMs, error: feedError } = feed
  const workspaceRef = target?.mode === 'workspace' ? target.workspaceName : ''
  const boundPath = target?.mode === 'workspace' && target.path !== '/' ? target.path : null

  // The Filters tab can own the feed instead; show it as busy rather than
  // fighting it for the camera.
  const running = feed.running && feed.consumer === 'applet'
  const otherFeed = feed.running && feed.consumer !== 'applet'
  const hits = running ? feed.hits : []
  useLensFeedViewer(running)

  const startLens = (kind: 'camera' | 'screen') => {
    if (!workspaceRef) return
    void feed.start(kind, 'applet', { workspaceRef, contextPath: boundPath })
  }

  // The binding follows navigation (and the standalone host's URL), so a
  // running feed has to be re-scoped rather than left on the path it started on.
  const { setContextPath } = feed
  useEffect(() => {
    if (running) setContextPath(boundPath)
  }, [running, boundPath, setContextPath])

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
        <select
          className={selectClass}
          value={rateMs}
          onChange={(e) => setRateMs(Number(e.target.value))}
          title="Frame rate. High rates (10–30 fps) are experimental — the loop never overlaps requests, so the effective rate is capped by search latency."
        >
          {LENS_RATES.map((r) => (
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
        {running ? (
          <button
            type="button"
            onClick={feed.stop}
            className="flex h-8 items-center gap-1 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <CircleStop className="h-3.5 w-3.5" /> Stop
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => startLens('camera')}
              disabled={otherFeed}
              className="flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" /> Camera
            </button>
            <button
              type="button"
              onClick={() => startLens('screen')}
              disabled={otherFeed}
              className="flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </button>
          </>
        )}
      </div>

      <div className="relative shrink-0 overflow-hidden rounded-xl border border-border bg-black/80 aspect-video max-h-64">
        {/* Only when this applet owns the feed — otherwise the Filters tab's
            stream would show through the "camera off" state. */}
        {running && <LensFeedVideo className="h-full w-full object-cover" />}
        {!running && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            <Focus className="mr-2 h-4 w-4" /> camera off
          </div>
        )}
      </div>

      <div className="shrink-0 text-xs text-muted-foreground">
        {feedError ? (
          <span className="text-destructive">{feedError}</span>
        ) : running ? (
          <>live · {latencyMs != null ? `${latencyMs} ms/frame` : 'searching…'} · {hits.length} match{hits.length === 1 ? '' : 'es'}{boundPath ? ` · scoped to ${boundPath}` : ''}</>
        ) : otherFeed ? (
          'The Lens filter is using the camera — stop it there first.'
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
            <LensHit key={h.doc.id} workspaceRef={workspaceRef} doc={h.doc} distance={h.distance} onOpen={(doc) => documentModal.open(doc, workspaceRef)} />
          ))}
        </div>
      )}
    </div>
  )
}

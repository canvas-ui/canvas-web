import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Images, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import { useDocumentBlobUrl } from '@/components/renderers/useDocumentBlobUrl'
import { useDocumentThumbnail } from '@/components/renderers/useDocumentThumbnail'
import { getLocationFilename } from '@/lib/document-display'
import type { Document } from '@/types/workspace'

const FILE_SCHEMA = 'data/abstraction/file'

function isImageDoc(doc: Document): boolean {
  return doc.schema === FILE_SCHEMA && String(doc.metadata?.contentType || '').startsWith('image/')
}

// One gallery cell — blob-fetched via the share-aware hook (works on both the
// authed app and public canvases). Swaps to server thumbnails when available.
function GalleryCell({ workspaceId, doc, onClick }: { workspaceId: string; doc: Document; onClick: () => void }) {
  const { blobUrl, error, loading } = useDocumentThumbnail(workspaceId, doc.id, 256)
  const title = getLocationFilename(doc) || `image-${doc.id}`
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="canvas-no-drag group relative block aspect-square w-full overflow-hidden rounded-md border bg-muted/40"
    >
      {loading && <div className="absolute inset-0 animate-pulse bg-muted/60" />}
      {error && <div className="absolute inset-0 flex items-center justify-center p-1 text-[10px] text-destructive">{error}</div>}
      {blobUrl && (
        <img
          src={blobUrl}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
      )}
    </button>
  )
}

function Lightbox({ workspaceId, docs, index, onClose, onNavigate }: {
  workspaceId: string
  docs: Document[]
  index: number
  onClose: () => void
  onNavigate: (next: number) => void
}) {
  const doc = docs[index]
  const { blobUrl, error, loading } = useDocumentBlobUrl(workspaceId, doc.id)
  const title = getLocationFilename(doc) || `image-${doc.id}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
      if (e.key === 'ArrowRight' && index < docs.length - 1) onNavigate(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, docs.length, onClose, onNavigate])

  // Portal to body — react-grid-layout applies transforms to grid items, which
  // breaks `position: fixed` and traps the overlay inside the widget cell.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <button type="button" onClick={onClose} className="canvas-no-drag absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" title="Close">
        <X className="h-5 w-5" />
      </button>
      {index > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1) }}
          className="canvas-no-drag absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          title="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {index < docs.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1) }}
          className="canvas-no-drag absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          title="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      <figure className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
        {loading && <div className="text-sm text-white/70">Loading…</div>}
        {error && <div className="text-sm text-red-400">{error}</div>}
        {blobUrl && <img src={blobUrl} alt={title} className="max-h-[85vh] max-w-[90vw] rounded object-contain" />}
        <figcaption className="mt-2 text-center text-xs text-white/70">{title} · {index + 1}/{docs.length}</figcaption>
      </figure>
    </div>,
    document.body,
  )
}

// Flickr-like image gallery over the canvas' current context: shows every
// image document the canvas query returns, with a keyboard-navigable lightbox.
function GalleryWidget({ config, canvas }: WidgetProps) {
  const limit = typeof config.limit === 'number' ? config.limit : 200
  const [images, setImages] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await canvas.fetchDocuments({ limit })
        if (cancelled) return
        setImages((res.payload || []).filter(isImageDoc))
      } catch {
        if (!cancelled) setImages([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [canvas, limit])

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading images…</div>
  if (images.length === 0) return <div className="p-4 text-sm text-muted-foreground">No images in this canvas' context.</div>

  return (
    <div className="h-full overflow-y-auto p-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
        {images.map((doc, i) => (
          <GalleryCell key={doc.id} workspaceId={canvas.workspaceId} doc={doc} onClick={() => setLightbox(i)} />
        ))}
      </div>
      {lightbox != null && images[lightbox] && (
        <Lightbox
          workspaceId={canvas.workspaceId}
          docs={images}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
        />
      )}
    </div>
  )
}

registerWidget({
  type: 'gallery',
  name: 'Gallery',
  icon: Images,
  defaultSize: { w: 8, h: 6, minW: 3, minH: 3 },
  defaultConfig: { limit: 200 },
  component: GalleryWidget,
})

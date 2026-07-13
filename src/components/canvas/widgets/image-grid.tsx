import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { Loader } from '@/components/ui/loader'
import { useDocumentBlobUrl } from '@/components/renderers/useDocumentBlobUrl'
import { useDocumentThumbnail } from '@/components/renderers/useDocumentThumbnail'
import { getLocationFilename } from '@/lib/document-display'
import type { Document } from '@/types/workspace'
import { TimelineSortControl } from './sort-control'
import type { CanvasImages } from './useCanvasImages'

// One image cell — blob-fetched via the share-aware thumbnail hook (works on
// both the authed app and public canvases). `className` lets callers control
// the aspect/spanning (uniform square in Gallery, varied in Mosaic).
export function ImageThumb({ workspaceId, doc, onClick, className = 'aspect-square' }: {
  workspaceId: string
  doc: Document
  onClick: () => void
  className?: string
}) {
  const { blobUrl, error, loading } = useDocumentThumbnail(workspaceId, doc.id, 512)
  const title = getLocationFilename(doc) || `image-${doc.id}`
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`canvas-no-drag group relative block w-full overflow-hidden rounded-lg border bg-muted/40 shadow-sm transition-shadow hover:shadow-md hover:ring-2 hover:ring-primary/30 ${className}`}
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

export function ImageLightbox({ workspaceId, docs, index, onClose, onNavigate }: {
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

// Shared header for image widgets: search box, timeline sort, and a pager.
// Reads its state from the useCanvasimages() bundle so Gallery and Mosaic share
// identical controls.
export function ImageGridToolbar({ workspaceId, state }: {
  workspaceId: string
  state: CanvasImages
}) {
  const { input, setInput, submit, clearSearch, activeQuery, sort, setSort, page, setPage, totalPages, totalCount, isLoading } = state

  return (
    <div className="canvas-no-drag flex flex-wrap items-center gap-2 border-b px-1 pb-2">
      <div className="relative flex-1 min-w-[10rem]">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Search images (Enter)…"
          className="h-7 w-full rounded-md border bg-background pl-7 pr-7 text-xs"
        />
        {activeQuery && (
          <button
            type="button"
            onClick={clearSearch}
            title="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <TimelineSortControl workspaceId={workspaceId} value={sort} onChange={setSort} />

      <div className="flex items-center gap-1">
        {isLoading && <Loader className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="tabular-nums text-xs text-muted-foreground">
          {totalCount.toLocaleString()} item{totalCount === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          title="Previous page"
          className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="tabular-nums text-xs text-muted-foreground">{page}/{totalPages}</span>
        <button
          type="button"
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          title="Next page"
          className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

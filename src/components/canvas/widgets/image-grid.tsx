import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, MessageSquareText, Search, X } from 'lucide-react'
import { ZoomableImage } from '@/components/common/zoomable-image'
import { Loader } from '@/components/ui/loader'
import { useDocumentBlobUrl } from '@/components/renderers/useDocumentBlobUrl'
import { useDocumentThumbnail } from '@/components/renderers/useDocumentThumbnail'
import { getDocumentComment, getLocationFilename } from '@/lib/document-display'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import type { Document } from '@/types/workspace'
import { TimelineSortControl } from './sort-control'
import type { CanvasImages } from './useCanvasImages'

/**
 * How a tile shows its comment.
 *
 * 'caption' — printed under the picture, always there (Gallery: a uniform grid
 *   reads as a contact sheet, and a caption line is part of the cell).
 * 'reveal'  — laid OVER the picture, on hover for a mouse / always for a
 *   finger (Mosaic: the point of a photo wall is the pictures, and a permanent
 *   band on every varied tile would fight the mosaic itself).
 * 'off'     — nothing on the tile; the comment still shows in the lightbox.
 */
export type CommentDisplay = 'caption' | 'reveal' | 'off'

// One image cell — blob-fetched via the share-aware thumbnail hook (works on
// both the authed app and public canvases). `className` lets callers control
// the aspect/spanning (uniform square in Gallery, varied in Mosaic).
export function ImageThumb({ workspaceId, doc, onClick, className = 'aspect-square', comments = 'off' }: {
  workspaceId: string
  doc: Document
  onClick: () => void
  className?: string
  comments?: CommentDisplay
}) {
  const { blobUrl, error, loading } = useDocumentThumbnail(workspaceId, doc.id, 512)
  const title = getLocationFilename(doc) || `image-${doc.id}`
  const comment = getDocumentComment(doc)
  const showComment = comment !== '' && comments !== 'off'

  return (
    <button
      type="button"
      onClick={onClick}
      // The comment is the useful hover text once there is one — the filename
      // is already the alt text and the lightbox caption.
      title={comment || title}
      className={`canvas-no-drag group relative block w-full overflow-hidden rounded-lg border bg-muted/40 shadow-elevation-1 transition-shadow hover:shadow-elevation-2 hover:ring-2 hover:ring-primary/30 ${className}`}
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
      {showComment && (
        <span
          className={`pointer-events-none absolute inset-x-0 bottom-0 px-1.5 pb-1 pt-4 text-left text-[11px] leading-snug text-white ${
            // The scrim is a gradient, not a panel: over a photo an opaque bar
            // crops the picture, while a fade only costs the part it covers.
            'bg-gradient-to-t from-black/75 via-black/45 to-transparent'
          } ${comments === 'reveal' ? 'caption-reveal' : ''}`}
        >
          <span className="line-clamp-2">{comment}</span>
        </span>
      )}
      {/* A marker that this picture HAS something to read, for exactly the
          cases where the text itself is not on the tile: comments switched off,
          or 'reveal' on a mouse before the hover. It is deliberately absent
          when the caption is already showing (a touch screen in 'reveal' mode)
          — a badge next to the words it stands for is just noise. */}
      {comment !== '' && comments !== 'caption' && (
        <span
          className={`pointer-events-none absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white transition-opacity ${
            comments === 'reveal'
              ? 'hidden [@media(hover:hover)]:block [@media(hover:hover)]:group-hover:opacity-0'
              : ''
          }`}
          title="Has a comment"
        >
          <MessageSquareText className="h-3 w-3" />
        </span>
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
  const comment = getDocumentComment(doc)
  // While the picture is zoomed the whole surface belongs to the gesture: the
  // arrows would sit on top of what the finger is panning, and a stray tap on
  // one would throw away the zoom the user just dialled in.
  const [zoomed, setZoomed] = useState(false)

  // Esc via the shared overlay stack (topmost-only close); arrows stay local.
  useEscapeClose(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
      if (e.key === 'ArrowRight' && index < docs.length - 1) onNavigate(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, docs.length, onNavigate])

  // Portal to body — react-grid-layout applies transforms to grid items, which
  // breaks `position: fixed` and traps the overlay inside the widget cell.
  return createPortal(
    // A lightbox is always a dark room, whatever the app theme — the image is
    // the subject and the chrome must recede. Scoping the scheme instead of
    // hardcoding white keeps the controls on the active theme's palette.
    <div
      data-scheme="dark"
      // p-4 on desktop, edge-to-edge on a phone: a 16:9 shot fitted into a
      // 360px screen is already only ~200px tall, and 32px of gutter is a
      // sixth of the picture.
      className="fixed inset-0 z-fullscreen flex flex-col bg-scrim p-0 sm:p-4"
      onClick={onClose}
    >
      <button type="button" onClick={onClose} className="canvas-no-drag absolute right-2 top-2 z-10 rounded-full bg-foreground/10 p-2 text-foreground hover:bg-foreground/20 touch-target sm:right-4 sm:top-4" title="Close">
        <X className="h-5 w-5" />
      </button>
      {index > 0 && !zoomed && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1) }}
          className="canvas-no-drag absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-foreground/10 p-2 text-foreground hover:bg-foreground/20"
          title="Previous"
        >
          <ChevronLeft className="h-6 w-6 touch-target" />
        </button>
      )}
      {index < docs.length - 1 && !zoomed && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1) }}
          className="canvas-no-drag absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-foreground/10 p-2 text-foreground hover:bg-foreground/20"
          title="Next"
        >
          <ChevronRight className="h-6 w-6 touch-target" />
        </button>
      )}
      {/* The picture takes the whole surface and the caption sits under it, so
          the zoom viewport is the screen rather than whatever a shrink-wrapped
          <figure> happened to measure. */}
      <figure className="flex min-h-0 flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {loading && <div className="text-sm text-foreground/70">Loading…</div>}
          {error && <div className="text-sm text-destructive">{error}</div>}
          {blobUrl && (
            <ZoomableImage
              src={blobUrl}
              alt={title}
              onZoomChange={setZoomed}
              className="max-h-full max-w-full rounded object-contain"
            />
          )}
        </div>
        <figcaption className="shrink-0 px-4 py-2 text-center text-xs text-foreground/70">
          {/* The full comment lives HERE, whatever the tiles are set to: a tile
              caption is clamped to two lines over a thumbnail, and this is the
              one place the whole note can be read. It leads, because it is the
              thing a person wrote; the filename follows as provenance. */}
          {comment && (
            <span className="mx-auto mb-1 block max-w-2xl whitespace-pre-wrap text-sm text-foreground">
              {comment}
            </span>
          )}
          {title} · {index + 1}/{docs.length}
          {/* Stated, not discovered: nobody double-taps an image on the off
              chance that it zooms. Hidden once they have. */}
          {!zoomed && <span className="ml-2 opacity-70">· double-tap to zoom</span>}
        </figcaption>
      </figure>
    </div>,
    document.body,
  )
}

// Shared header for image widgets: search box, timeline sort, and a pager.
// Reads its state from the useCanvasimages() bundle so Gallery and Mosaic share
// identical controls.
export function ImageGridToolbar({ workspaceId, state, comments, onToggleComments }: {
  workspaceId: string
  state: CanvasImages
  /** Current tile-comment setting, for the toggle's pressed state. */
  comments?: CommentDisplay
  /** Absent = no toggle (the widget doesn't offer one). */
  onToggleComments?: () => void
}) {
  const { input, setInput, submit, clearSearch, removeQuery, activeQueries, sort, setSort, page, setPage, totalPages, totalCount, isLoading } = state
  const hasSearch = activeQueries.length > 0

  return (
    // Two rows at phone width (search, then sort + pager), one row as soon as
    // the widget is wide enough. It used to wrap into THREE stacked rows of
    // 44px touch targets — on a 240px-tall stacked widget that left a sliver of
    // one cropped thumbnail below the controls.
    <div className="canvas-no-drag flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-1 pb-1.5">
      <div className="relative min-w-[9rem] flex-1 basis-full sm:basis-auto">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={hasSearch ? 'Refine: add another query (Enter)…' : 'Search images (Enter)…'}
          className="h-7 w-full rounded-md border bg-background pl-7 pr-7 text-xs"
        />
        {hasSearch && (
          <button
            type="button"
            onClick={clearSearch}
            title="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground touch-target"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {hasSearch && (
        <div className="flex w-full flex-wrap items-center gap-1 order-last">
          {activeQueries.map((term, i) => (
            <span key={`${term}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-[10px] uppercase text-muted-foreground">then</span>}
              <span className="inline-flex items-center gap-1 rounded-full border bg-accent/50 px-2 py-0.5 text-xs">
              <span className="max-w-[10rem] truncate">{term}</span>
              <button
                type="button"
                onClick={() => removeQuery(i)}
                title={`Remove "${term}"`}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground touch-target"
              >
                <X className="h-3 w-3" />
              </button>
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Sort and pager share the second row on a phone — they are both small
          and neither wants a row to itself. */}
      <div className="flex flex-1 basis-full items-center justify-between gap-2 sm:basis-auto sm:justify-end">
      {onToggleComments && (
        <button
          type="button"
          onClick={onToggleComments}
          aria-pressed={comments !== 'off'}
          title={comments === 'off' ? 'Show comments on tiles' : 'Hide comments on tiles'}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border touch-target ${
            comments === 'off'
              ? 'text-muted-foreground hover:bg-accent'
              : 'border-primary/30 bg-primary/15 text-primary hover:bg-primary/25'
          }`}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
        </button>
      )}
      <TimelineSortControl workspaceId={workspaceId} value={sort} onChange={setSort} />

      <div className="flex min-w-0 items-center gap-1">
        {isLoading && <Loader className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {/* The word "items" is the first thing to go when the row is a phone
            wide — the pager arrows next to it are not optional, and losing
            either of them to an overflow is how the control read as broken. */}
        <span className="shrink-0 whitespace-nowrap tabular-nums text-xs text-muted-foreground">
          {totalCount.toLocaleString()}<span className="hidden sm:inline"> item{totalCount === 1 ? '' : 's'}</span>
        </span>
        <button
          type="button"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          title="Previous page"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent disabled:opacity-40 touch-target"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{page}/{totalPages}</span>
        <button
          type="button"
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          title="Next page"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent disabled:opacity-40 touch-target"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      </div>
    </div>
  )
}

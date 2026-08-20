import { useState } from 'react'
import { Images } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import { useCanvasImages } from './useCanvasImages'
import { ImageGridToolbar, ImageLightbox, ImageThumb, type CommentDisplay } from './image-grid'

// Flickr-like image gallery over the canvas' current context: a uniform grid
// with search, timeline sort, server pagination, and a keyboard-navigable
// lightbox. (For a varied 500px-style layout, use the Mosaic widget.)
export function GalleryWidget({ config, setConfig, canvas }: WidgetProps) {
  const pageSize = typeof config.pageSize === 'number' ? config.pageSize : 60
  const state = useCanvasImages(canvas, pageSize)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const { images, isLoading, error, activeQueries } = state
  // Captions are ON by default here: a uniform grid is a contact sheet, and a
  // note someone took the trouble to write is the difference between "13
  // screenshots" and knowing which one is which. The setting rides in the
  // widget config, so it is saved with the canvas and holds on public shares
  // (which render no toolbar to toggle it with).
  const comments: CommentDisplay = config.showComments === false ? 'off' : 'caption'
  const toggleComments = () => setConfig({ ...config, showComments: comments === 'off' })

  return (
    <div className="flex h-full flex-col">
      {/* Read-only public shares are a preloaded snapshot: search/sort/paging
          are inert there, and the timelines fetch behind the sort control hits
          an authed endpoint (401 → login bounce). Hide the toolbar. */}
      {!canvas.readOnly && (
        <ImageGridToolbar
          workspaceId={canvas.workspaceId}
          state={state}
          comments={comments}
          onToggleComments={toggleComments}
        />
      )}

      <div className="flex-1 overflow-y-auto p-1">
        {error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : images.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {isLoading ? 'Loading images…' : activeQueries.length ? 'No images match your search.' : "No images in this canvas' context."}
          </div>
        ) : (
          // 120px floor rather than 200px: on a 360px phone a 200px floor
          // resolves to a SINGLE column, so the gallery stopped reading as a
          // gallery — one giant thumbnail per screenful, everything else below
          // the fold. 130px gives two columns on a phone and the same
          // ~200px cells as before once there is room for them.
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(120px,100%),1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] sm:gap-3">
            {images.map((doc, i) => (
              <ImageThumb key={doc.id} workspaceId={canvas.workspaceId} doc={doc} onClick={() => setLightbox(i)} comments={comments} />
            ))}
          </div>
        )}
      </div>

      {lightbox != null && images[lightbox] && (
        <ImageLightbox
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
  // A photo wall needs the screen; anything less shows one row of thumbs.
  mobileHeight: 0.9,
  defaultConfig: { pageSize: 60, showComments: true },
  component: GalleryWidget,
})

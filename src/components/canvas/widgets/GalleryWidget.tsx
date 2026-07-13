import { useState } from 'react'
import { Images } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import { useCanvasImages } from './useCanvasImages'
import { ImageGridToolbar, ImageLightbox, ImageThumb } from './image-grid'

// Flickr-like image gallery over the canvas' current context: a uniform grid
// with search, timeline sort, server pagination, and a keyboard-navigable
// lightbox. (For a varied 500px-style layout, use the Mosaic widget.)
function GalleryWidget({ config, canvas }: WidgetProps) {
  const pageSize = typeof config.pageSize === 'number' ? config.pageSize : 60
  const state = useCanvasImages(canvas, pageSize)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const { images, isLoading, error, activeQuery } = state

  return (
    <div className="flex h-full flex-col">
      <ImageGridToolbar workspaceId={canvas.workspaceId} state={state} />

      <div className="flex-1 overflow-y-auto p-1">
        {error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : images.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {isLoading ? 'Loading images…' : activeQuery ? 'No images match your search.' : "No images in this canvas' context."}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-3">
            {images.map((doc, i) => (
              <ImageThumb key={doc.id} workspaceId={canvas.workspaceId} doc={doc} onClick={() => setLightbox(i)} />
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
  defaultConfig: { pageSize: 60 },
  component: GalleryWidget,
})

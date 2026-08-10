import { useState } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import type { Document } from '@/types/workspace'
import { useCanvasImages } from './useCanvasImages'
import { ImageGridToolbar, ImageLightbox, ImageThumb } from './image-grid'

// Base grid unit (px). Column width ≈ this; a row is the same so a 1×1 tile is
// roughly square and larger tiles stay proportional.
const CELL = 150

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) && n > 0 ? (n as number) : 0
}

// Pull pixel dimensions from wherever the ingest/EXIF pipeline stashed them.
// Tolerant of naming because that extraction is a separate, in-progress effort.
function dimensions(doc: Document): { w: number; h: number } {
  const m = (doc.metadata ?? {}) as Record<string, unknown>
  const d = (doc.data ?? {}) as Record<string, unknown>
  const w = num(m.width) || num(m.imageWidth) || num(d.width) || num(d.imageWidth)
  const h = num(m.height) || num(m.imageHeight) || num(d.height) || num(d.imageHeight)
  return { w, h }
}

// 500px.com-style spanning: landscapes go wide, portraits go tall, and a
// steady rhythm of "hero" tiles gives prominence. When dimensions are unknown
// (EXIF not yet extracted) the index-based rhythm alone still varies the grid.
function tileSpan(doc: Document, index: number): { cols: number; rows: number } {
  const hero = index % 9 === 0
  if (hero) return { cols: 2, rows: 2 }

  const { w, h } = dimensions(doc)
  const ratio = w && h ? w / h : 0
  if (ratio >= 1.5) return { cols: 2, rows: 1 } // landscape
  if (ratio > 0 && ratio <= 0.66) return { cols: 1, rows: 2 } // portrait
  if (!ratio && index % 7 === 3) return { cols: 2, rows: 1 } // rhythm when ratio unknown
  return { cols: 1, rows: 1 }
}

// A justified, varied-cell photo wall over the canvas' context — the visually
// prominent counterpart to the uniform Gallery. Shares search / timeline sort /
// pagination / lightbox with it.
export function MosaicWidget({ config, canvas }: WidgetProps) {
  const pageSize = typeof config.pageSize === 'number' ? config.pageSize : 60
  const state = useCanvasImages(canvas, pageSize)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const { images, isLoading, error, activeQueries } = state

  return (
    <div className="flex h-full flex-col">
      {/* See GalleryWidget: hide the authed/inert toolbar on read-only shares. */}
      {!canvas.readOnly && <ImageGridToolbar workspaceId={canvas.workspaceId} state={state} />}

      <div className="flex-1 overflow-y-auto p-1">
        {error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : images.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {isLoading ? 'Loading images…' : activeQueries.length ? 'No images match your search.' : "No images in this canvas' context."}
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${CELL}px, 1fr))`,
              gridAutoRows: `${CELL}px`,
              gridAutoFlow: 'dense',
            }}
          >
            {images.map((doc, i) => {
              const { cols, rows } = tileSpan(doc, i)
              return (
                <div key={doc.id} style={{ gridColumn: `span ${cols}`, gridRow: `span ${rows}` }}>
                  <ImageThumb
                    workspaceId={canvas.workspaceId}
                    doc={doc}
                    onClick={() => setLightbox(i)}
                    className="h-full"
                  />
                </div>
              )
            })}
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
  type: 'mosaic',
  name: 'Mosaic',
  icon: LayoutDashboard,
  defaultSize: { w: 8, h: 7, minW: 4, minH: 4 },
  defaultConfig: { pageSize: 60 },
  component: MosaicWidget,
})

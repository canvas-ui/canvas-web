import { useState } from 'react'
import { BulkEditDialog } from '@/components/common/BulkEditDialog'
import { ContextMenuShell } from '@/components/common/context-menu-shell'
import { usePublicShareCode } from '@/components/renderers/public-share'
import { Button } from '@/components/ui/button'
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
  const state = useCanvasImages(canvas, pageSize, true)
  const canEdit = usePublicShareCode() == null && (canvas.interactive ?? !canvas.readOnly)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [bulkIds, setBulkIds] = useState<number[] | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; ids: number[] } | null>(null)
  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
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

      {canEdit && <div className="canvas-no-drag flex items-center gap-2 py-1">
        <Button size="sm" variant="ghost" onClick={() => { setSelecting(!selecting); setSelected(new Set()) }}>{selecting ? 'Done selecting' : 'Select'}</Button>
        {selecting && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(images.map(doc => doc.id)))}>Select page</Button>}
        {selected.size > 0 && <Button size="sm" variant="outline" onClick={() => setBulkIds([...selected])}>Bulk Edit… ({selected.size})</Button>}
      </div>}
      <div className="flex-1 overflow-y-auto p-1">
        {error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : images.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {isLoading ? 'Loading media…' : activeQueries.length ? 'No images or videos match your search.' : "No images or videos in this canvas' context."}
          </div>
        ) : (
          // 120px floor rather than 200px: on a 360px phone a 200px floor
          // resolves to a SINGLE column, so the gallery stopped reading as a
          // gallery — one giant thumbnail per screenful, everything else below
          // the fold. 130px gives two columns on a phone and the same
          // ~200px cells as before once there is room for them.
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(120px,100%),1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] sm:gap-3">
            {images.map((doc, i) => (
              <div key={doc.id} className="relative" onContextMenu={e => {
                if (!canEdit) return
                e.preventDefault()
                e.stopPropagation()
                setMenu({ x: e.clientX, y: e.clientY, ids: selected.has(doc.id) ? [...selected] : [doc.id] })
              }}>
                <ImageThumb workspaceId={canvas.workspaceId} doc={doc} onClick={() => selecting ? toggle(doc.id) : setLightbox(i)} comments={comments} />
                {selecting && <input type="checkbox" aria-label={`Select document ${doc.id}`} checked={selected.has(doc.id)} onChange={() => toggle(doc.id)} className="canvas-no-drag absolute left-2 top-2 h-4 w-4 accent-primary" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {menu && <ContextMenuShell x={menu.x} y={menu.y} onClose={() => setMenu(null)} className="rounded-lg border bg-popover p-1 shadow-elevation-3">
        <button className="px-3 py-2 text-sm hover:bg-muted" onClick={() => { setBulkIds(menu.ids); setMenu(null) }}>Bulk Edit… ({menu.ids.length})</button>
      </ContextMenuShell>}
      {bulkIds && <BulkEditDialog workspaceId={canvas.workspaceId} documentIds={bulkIds} onClose={() => setBulkIds(null)} />}
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

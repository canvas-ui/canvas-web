import { lazy, Suspense, useState } from 'react'
import { Brush, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useDocumentThumbnail } from '@/components/renderers/useDocumentThumbnail'
import { DRAWING_SCHEMA } from '@/components/renderers/types'
import type { Document } from '@/types/workspace'
import type { AppletProps } from './registry'
import { useAppletTarget } from './use-applet-target'
import { useAppletDocs, formatCreated, type AppletScope } from './use-applet-docs'

// Excalidraw lazy-loads fonts at runtime; without an asset path it reaches
// for the esm.sh CDN, which the CSP blocks. The fonts ship with the app
// (vite.config.ts excalidrawAssets → /excalidraw/fonts/). Set HERE, not in
// SketchEditor: import hoisting runs Excalidraw's font registration before
// any statement in the module that imports it.
declare global { interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] } }
window.EXCALIDRAW_ASSET_PATH = '/excalidraw/'

// The editor pulls the whole Excalidraw chunk — load it only when someone
// actually opens a sketch (the grid below costs nothing).
const SketchEditor = lazy(() => import('./SketchEditor'))

function SketchTile({ doc, scope, onOpen, onRemove }: {
  doc: Document
  scope: AppletScope
  onOpen: () => void
  onRemove: () => void
}) {
  // Checksum as cache version — an edited sketch must not show its old preview.
  const { blobUrl, loading } = useDocumentThumbnail(scope.workspaceName, doc.id, 256, {
    version: doc.checksumArray?.[0] ?? null,
  })
  const title = String(doc.data?.title ?? 'Sketch')
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card shadow-elevation-2 transition-shadow hover:shadow-elevation-3">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/30">
          {blobUrl
            ? <img src={blobUrl} alt={title} className="h-full w-full object-contain" />
            : <Brush className={`h-6 w-6 text-muted-foreground ${loading ? 'animate-pulse' : ''}`} />}
        </div>
        <div className="px-2 py-1.5">
          <div className="truncate text-xs font-medium">{title}</div>
          <div className="text-[10px] text-muted-foreground">{formatCreated(doc.updatedAt || doc.createdAt)}</div>
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete ${title}`}
        className="absolute right-1.5 top-1.5 rounded-md bg-background/80 p-1 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// Sketch launcher: a thumbnail grid of the drawings in the current binding,
// plus the full-viewport Excalidraw editor (lazy) for new/existing sketches.
export function SketchApplet({ autoAdd }: AppletProps) {
  const target = useAppletTarget()
  const { docs, loading, error, scope, reload, removeDoc } = useAppletDocs(target, DRAWING_SCHEMA)
  // 'new' opens a blank editor; a Document re-opens its scene.
  const [editing, setEditing] = useState<Document | 'new' | null>(autoAdd ? 'new' : null)
  const { showErrorToast } = useToastHelpers()

  if (!target) {
    return <p className="p-4 text-sm text-muted-foreground">Select a context or workspace path first.</p>
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <Button size="sm" variant="outline" className="self-start" onClick={() => setEditing('new')}>
        <Plus className="mr-1.5 h-4 w-4" />
        New sketch
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && !docs.length && <p className="text-sm text-muted-foreground">Loading sketches…</p>}
      {!loading && !docs.length && !error && (
        <p className="text-sm text-muted-foreground">No sketches here yet.</p>
      )}

      {scope && docs.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {docs.map((doc) => (
            <SketchTile
              key={`${doc.id}:${doc.checksumArray?.[0] ?? ''}`}
              doc={doc}
              scope={scope}
              onOpen={() => setEditing(doc)}
              onRemove={() => {
                if (!confirm(`Delete "${String(doc.data?.title ?? 'Sketch')}"?`)) return
                removeDoc(doc.id).catch((err) =>
                  showErrorToast(err instanceof Error ? err.message : 'Failed to delete sketch'))
              }}
            />
          ))}
        </div>
      )}

      {editing && scope && (
        <Suspense fallback={
          <div className="fixed inset-0 z-fullscreen flex items-center justify-center bg-background">
            <p className="text-sm text-muted-foreground">Loading sketch editor…</p>
          </div>
        }>
          <SketchEditor
            doc={editing === 'new' ? null : editing}
            scope={scope}
            target={target}
            onSaved={() => { setEditing(null); void reload() }}
            onClose={() => setEditing(null)}
          />
        </Suspense>
      )}
      {editing && !scope && (
        // Binding still resolving (context → workspace lookup) — rare, brief.
        <div className="fixed inset-0 z-fullscreen flex items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Resolving destination…</p>
        </div>
      )}
    </div>
  )
}

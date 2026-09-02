import { useCallback, useMemo, useRef, useState } from 'react'
import { Excalidraw, exportToBlob, serializeAsJSON } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types'
import { ArrowLeft, Save } from 'lucide-react'
import '@excalidraw/excalidraw/index.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { sha256Text } from '@/lib/sha256'
import { uploadWorkspaceBlob } from '@/services/blobs'
import { updateWorkspaceDocument } from '@/services/workspace'
import { submitDocuments, type AddTarget } from '../add/useAddTarget'
import { buildDrawingDocument, DRAWING_SCHEMA_VERSION } from './sketch-doc'
import { DRAWING_SCHEMA } from '@/components/renderers/types'
import type { Document } from '@/types/workspace'
import type { AppletScope } from './use-applet-docs'

interface SketchEditorProps {
  // null → new sketch; a Drawing document → edit its scene in place.
  doc: Document | null
  scope: AppletScope
  target: AddTarget
  onSaved: () => void
  onClose: () => void
}

// Excalidraw scene parsing: `data.scene` is stored as the canonical
// serializeAsJSON string (object form tolerated for forward compat).
function parseScene(doc: Document | null): ExcalidrawInitialDataState | null {
  const raw = doc?.data?.scene
  if (!raw) return null
  try {
    const scene = typeof raw === 'string' ? JSON.parse(raw) : raw
    // collaborators is runtime state; a stale serialized copy breaks mount.
    if (scene?.appState && typeof scene.appState === 'object') delete scene.appState.collaborators
    return scene as ExcalidrawInitialDataState
  } catch {
    return null
  }
}

// Full-viewport sketch surface (Excalidraw needs real estate — the applet's
// inline column is a launcher, not a canvas). Lazy-loaded: this file pulls
// the whole Excalidraw chunk, so nothing imports it statically except via
// React.lazy (see SketchApplet).
export default function SketchEditor({ doc, scope, target, onSaved, onClose }: SketchEditorProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [title, setTitle] = useState(String(doc?.data?.title ?? ''))
  const [saving, setSaving] = useState(false)
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const initialData = useMemo(() => parseScene(doc), [doc])

  // Follow the app theme (data-theme on <html>; absent = system preference).
  const dark = useMemo(() => {
    const t = document.documentElement.getAttribute('data-theme')
    if (t === 'dark') return true
    if (t === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }, [])

  const handleSave = useCallback(async () => {
    const api = apiRef.current
    if (!api) return
    setSaving(true)
    try {
      const elements = api.getSceneElements()
      if (!elements.length) { showErrorToast('Nothing to save yet — draw something first'); return }
      const appState = api.getAppState()
      const files = api.getFiles()

      const sceneJson = serializeAsJSON(elements, appState, files, 'database')
      const checksum = await sha256Text(sceneJson)
      const png = await exportToBlob({
        elements,
        appState: { ...appState, exportBackground: true },
        files,
        mimeType: 'image/png',
      })
      const preview = await uploadWorkspaceBlob(scope.workspaceName, png)

      if (doc) {
        const body = buildDrawingDocument(sceneJson, checksum, preview, { title })
        await updateWorkspaceDocument(scope.workspaceName, {
          id: doc.id,
          schema: DRAWING_SCHEMA,
          schemaVersion: DRAWING_SCHEMA_VERSION,
          data: body.data as Record<string, unknown>,
          metadata: body.metadata as Record<string, unknown>,
          checksumArray: body.checksumArray as string[],
          locations: body.locations as Array<{ url: string; metadata?: Record<string, unknown> }>,
        })
      } else {
        await submitDocuments(target, [buildDrawingDocument(sceneJson, checksum, preview, { title })])
      }
      showSuccessToast(doc ? 'Sketch updated' : 'Sketch saved')
      onSaved()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to save sketch')
    } finally {
      setSaving(false)
    }
  }, [doc, scope.workspaceName, target, title, onSaved, showSuccessToast, showErrorToast])

  return (
    <div className="fixed inset-0 z-fullscreen flex flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sketch title (optional)"
          className="h-8 max-w-xs"
        />
        <div className="flex-1" />
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(api) => { apiRef.current = api }}
          initialData={initialData ?? undefined}
          theme={dark ? 'dark' : 'light'}
        />
      </div>
    </div>
  )
}

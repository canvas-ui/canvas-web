import { useCallback, useMemo, useRef, useState } from 'react'
import { Excalidraw, exportToBlob, serializeAsJSON } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types'
import { Save, Sun, Moon } from 'lucide-react'
import '@excalidraw/excalidraw/index.css'
import { Button } from '@/components/ui/button'
import { EditorOverlay } from '@/components/editors/EditorOverlay'
import { Input } from '@/components/ui/input'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { sha256Text } from '@/lib/sha256'
import { uploadWorkspaceBlob } from '@/services/blobs'
import { updateWorkspaceDocument } from '@/services/workspace'
import { submitDocuments, type AddTarget } from '../add/useAddTarget'
import { buildDrawingDocument, DRAWING_SCHEMA_VERSION } from './sketch-doc'
import { DRAWING_SCHEMA } from '@/components/renderers/types'
import { appScheme, readSketchTheme, writeSketchTheme } from './sketch-theme'
import type { Document } from '@/types/workspace'

interface SketchEditorProps {
  // null → new sketch; a Drawing document → edit its scene in place.
  doc: Document | null
  // Where the preview blob uploads (and, for updates, where the doc lives).
  workspaceName: string
  // Insert destination — required only when creating (doc == null).
  target?: AddTarget
  onSaved: () => void
  onClose: () => void
  /** Leave the canvas for the document's metadata form. */
  onDetails?: () => void
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
export default function SketchEditor({ doc, workspaceName, target, onSaved, onClose, onDetails }: SketchEditorProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [title, setTitle] = useState(String(doc?.data?.title ?? ''))
  const [saving, setSaving] = useState(false)
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const initialData = useMemo(() => parseScene(doc), [doc])

  // Canvas theme, with an override the user keeps. The app scheme is only the
  // DEFAULT: a light canvas on a dark app is a deliberate choice — paper reads
  // like paper — so the toggle is remembered across sketches and sessions.
  const [canvasTheme, setCanvasTheme] = useState<'light' | 'dark'>(() => readSketchTheme() ?? appScheme())

  const toggleCanvasTheme = useCallback(() => {
    setCanvasTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      writeSketchTheme(next)
      return next
    })
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
      const preview = await uploadWorkspaceBlob(workspaceName, png)

      if (doc) {
        const body = buildDrawingDocument(sceneJson, checksum, preview, { title })
        await updateWorkspaceDocument(workspaceName, {
          id: doc.id,
          schema: DRAWING_SCHEMA,
          schemaVersion: DRAWING_SCHEMA_VERSION,
          data: body.data as Record<string, unknown>,
          metadata: body.metadata as Record<string, unknown>,
          checksumArray: body.checksumArray as string[],
          locations: body.locations as Array<{ url: string; metadata?: Record<string, unknown> }>,
        })
      } else {
        if (!target) throw new Error('No destination to save the sketch to')
        await submitDocuments(target, [buildDrawingDocument(sceneJson, checksum, preview, { title })])
      }
      showSuccessToast(doc ? 'Sketch updated' : 'Sketch saved')
      onSaved()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to save sketch')
    } finally {
      setSaving(false)
    }
  }, [doc, workspaceName, target, title, onSaved, showSuccessToast, showErrorToast])

  return (
    <EditorOverlay
      onClose={onClose}
      onDetails={onDetails}
      title={
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sketch title (optional)"
          className="h-8 max-w-xs"
        />
      }
      actions={
        <>
          <Button
            variant="ghost" size="sm"
            onClick={toggleCanvasTheme}
            title={canvasTheme === 'dark' ? 'Light canvas' : 'Dark canvas'}
            aria-label={canvasTheme === 'dark' ? 'Switch to a light canvas' : 'Switch to a dark canvas'}
          >
            {canvasTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api }}
        initialData={initialData ?? undefined}
        theme={canvasTheme}
      />
    </EditorOverlay>
  )
}

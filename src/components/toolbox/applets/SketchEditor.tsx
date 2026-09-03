import { useCallback, useMemo, useRef, useState } from 'react'
import { Excalidraw, exportToBlob, serializeAsJSON } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types'
import { Save } from 'lucide-react'
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

  // Follow the app theme. The palette id lives in data-theme ('frost', …) and
  // the resolved light/dark in data-scheme — reading data-theme here meant the
  // canvas ignored the app's scheme and always fell back to the OS preference.
  const dark = useMemo(() => {
    const scheme = document.documentElement.getAttribute('data-scheme')
    if (scheme === 'dark') return true
    if (scheme === 'light') return false
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
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api }}
        initialData={initialData ?? undefined}
        theme={dark ? 'dark' : 'light'}
      />
    </EditorOverlay>
  )
}

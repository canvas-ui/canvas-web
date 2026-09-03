import { useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditorOverlay } from '@/components/editors/EditorOverlay'
import { DocumentBodyEditor } from '@/components/common/DocumentBodyEditor'
import { useDocumentBlobUrl } from '@/components/renderers/useDocumentBlobUrl'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { getLocationFilename } from '@/lib/document-display'
import { documentBodyKind, isTextBackedFile, textFileTooLarge, MAX_EDITABLE_TEXT_BYTES } from '@/lib/text-document'
import { saveTextFileContent } from '@/services/text-documents'
import { updateWorkspaceDocument } from '@/services/workspace'
import { NOTE_SCHEMA } from '@/components/renderers/types'
import type { Document } from '@/types/workspace'

/**
 * Full-surface editor for a note, a markdown file or a text file — the same
 * "open it in the editor" gesture sketches get, rather than a body field
 * squeezed into the metadata form. Lazy-loaded (it pulls the tiptap chunk).
 */
export default function TextDocumentEditor({
  doc, workspaceName, onSaved, onClose, onDetails,
}: {
  doc: Document
  workspaceName: string
  onSaved: () => void
  onClose: () => void
  onDetails?: () => void
}) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const isNote = doc.schema === NOTE_SCHEMA
  const isFile = isTextBackedFile(doc)
  const tooLarge = isFile && textFileTooLarge(doc)
  const kind = documentBodyKind(doc) ?? 'markdown'

  const body = useDocumentBlobUrl(workspaceName, doc.id, {
    mode: 'text',
    enabled: isFile && !tooLarge,
    maxTextLength: MAX_EDITABLE_TEXT_BYTES,
    version: doc.checksumArray?.[0] ?? null,
  })
  const [content, setContent] = useState<string>(isNote ? String(doc.data?.content ?? '') : '')
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const seedKey = `${doc.id}:${doc.checksumArray?.[0] ?? ''}`
  if (isFile && body.text != null && seededFor !== seedKey) {
    setSeededFor(seedKey)
    setContent(body.text)
  }
  const [saving, setSaving] = useState(false)
  const ready = isNote || (body.text != null && !body.loading)

  const handleSave = async () => {
    setSaving(true)
    try {
      if (isNote) {
        await updateWorkspaceDocument(workspaceName, {
          id: doc.id, schema: doc.schema, schemaVersion: doc.schemaVersion,
          data: { ...doc.data, content },
        })
      } else {
        await saveTextFileContent(workspaceName, doc, content)
      }
      showSuccessToast('Document saved')
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      onSaved()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to save document')
    } finally {
      setSaving(false)
    }
  }

  const name = isNote ? String(doc.data?.title ?? 'Note') : getLocationFilename(doc) || `document-${doc.id}`

  return (
    <EditorOverlay
      onClose={onClose}
      onDetails={onDetails}
      title={<span className="truncate text-sm font-medium">{name}</span>}
      actions={
        <Button size="sm" onClick={handleSave} disabled={saving || !ready || tooLarge}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col px-4 py-4 md:px-8">
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          {tooLarge ? (
            <p className="text-sm text-muted-foreground">
              This file is too large to edit here ({'>'}{Math.round(MAX_EDITABLE_TEXT_BYTES / 1000)} kB) — download it instead.
            </p>
          ) : body.error ? (
            <p className="text-sm text-destructive">{body.error}</p>
          ) : !ready ? (
            <p className="text-sm text-muted-foreground">Loading content…</p>
          ) : (
            <DocumentBodyEditor
              kind={isNote ? 'markdown' : kind}
              value={content}
              onChange={setContent}
              placeholder={isNote ? 'Write your note…' : undefined}
              fill
            />
          )}
        </div>
      </div>
    </EditorOverlay>
  )
}

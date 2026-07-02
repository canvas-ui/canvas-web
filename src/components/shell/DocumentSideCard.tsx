import { StickyNote, Link as LinkIcon, File as FileIcon, FileQuestion } from 'lucide-react'
import { B5Card, type B5SaveTarget } from '@/components/home/B5Card'
import { EditNoteFormBody } from '@/components/toolbox/add/EditNoteForm'
import { EditLinkFormBody } from '@/components/toolbox/add/EditLinkForm'
import { FilePreview, isPreviewable } from '@/components/common/file-preview'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { pasteDocumentsToWorkspacePath } from '@/services/workspace'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useSideView } from './side-view-context'
import type { Document } from '@/types/workspace'

const NOTE_SCHEMA = 'data/abstraction/note'
const TAB_SCHEMA = 'data/abstraction/tab'

function iconFor(document: Document) {
  if (document.schema === NOTE_SCHEMA) return StickyNote
  if (document.schema === TAB_SCHEMA) return LinkIcon
  if (isPreviewable(document)) return FileIcon
  return FileQuestion
}

// "Open to the side" peek at an existing document, reusing B5Card as the
// chrome (fillParent — matches ContentArea's height, not the fixed
// quick-add-card sizing). Note/link schemas are editable in place, reusing
// the exact same Edit*FormBody used by AddPanel's edit flow (no autosave —
// same explicit Save/Cancel UX, just staying open after a save instead of
// closing an AddPanel). Save/"Link To" in the header additionally links
// this document into another location.
export function DocumentSideCard() {
  const { entry, close } = useSideView()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  if (!entry) return null
  const { document, workspaceId } = entry

  const onSave = async (target: B5SaveTarget) => {
    await pasteDocumentsToWorkspacePath(workspaceId, target.path, [document.id], target.treeName, target.treeType)
    return [document.id]
  }

  return (
    <B5Card
      title={getDocumentDisplayInfo(document).title}
      icon={iconFor(document)}
      onClose={close}
      onSave={onSave}
      canSave
      successMessage="Linked"
      lockedWorkspaceName={workspaceId}
      fillParent
    >
      {document.schema === NOTE_SCHEMA && (
        <EditNoteFormBody
          doc={document}
          workspaceId={workspaceId}
          onCancel={close}
          onSaved={() => {}}
          showSuccessToast={showSuccessToast}
          showErrorToast={showErrorToast}
        />
      )}

      {document.schema === TAB_SCHEMA && (
        <EditLinkFormBody
          doc={document}
          workspaceId={workspaceId}
          onCancel={close}
          onSaved={() => {}}
          showSuccessToast={showSuccessToast}
          showErrorToast={showErrorToast}
        />
      )}

      {isPreviewable(document) && (
        <div className="p-4">
          <FilePreview workspaceId={workspaceId} document={document} />
        </div>
      )}

      {![NOTE_SCHEMA, TAB_SCHEMA].includes(document.schema) && !isPreviewable(document) && (
        <pre className="overflow-auto p-4 text-xs">{JSON.stringify(document.data, null, 2)}</pre>
      )}
    </B5Card>
  )
}

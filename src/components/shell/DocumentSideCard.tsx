import { StickyNote, Link as LinkIcon, File as FileIcon, Mail, FileQuestion } from 'lucide-react'
import { B5Card, type B5SaveTarget } from '@/components/home/B5Card'
import { ObjectPropertiesCard } from '@/components/object-card/ObjectPropertiesCard'
import { NOTE_SCHEMA, TAB_SCHEMA, FILE_SCHEMA, EMAIL_SCHEMA } from '@/components/renderers/types'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { pasteDocumentsToWorkspacePath } from '@/services/workspace'
import { useSideView } from './side-view-context-data'
import type { Document } from '@/types/workspace'

function iconFor(document: Document) {
  if (document.schema === NOTE_SCHEMA) return StickyNote
  if (document.schema === TAB_SCHEMA) return LinkIcon
  if (document.schema === FILE_SCHEMA) return FileIcon
  if (document.schema === EMAIL_SCHEMA) return Mail
  return FileQuestion
}

// "Open to the side" host for the unified object properties card, reusing
// B5Card as the chrome (fillParent — matches ContentArea's height). Save /
// "Link To" in the header links this document into another location.
export function DocumentSideCard() {
  const { entry, close } = useSideView()
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
      <ObjectPropertiesCard document={document} workspaceId={workspaceId} compact />
    </B5Card>
  )
}

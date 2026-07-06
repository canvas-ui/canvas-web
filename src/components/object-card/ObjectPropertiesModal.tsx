import { ObjectPropertiesCard, type ObjectCardTab } from './ObjectPropertiesCard'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import type { Document } from '@/types/workspace'

interface ObjectPropertiesModalProps {
  document: Document | null
  isOpen: boolean
  onClose: () => void
  // Optional to match legacy row props; tabs need it for fetches — resolved to ''.
  workspaceId?: string
  initialTab?: ObjectCardTab
  initialEdit?: boolean
}

// Centered-modal host for the object properties card (list "view details" /
// "edit" actions). The side-view host is DocumentSideCard.
export function ObjectPropertiesModal({ document, isOpen, onClose, workspaceId, initialTab, initialEdit }: ObjectPropertiesModalProps) {
  if (!isOpen || !document) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 max-md:p-2" onClick={onClose}>
      <div
        className="flex h-[85dvh] w-full max-w-3xl flex-col rounded-lg border bg-background max-md:h-full max-md:max-w-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between p-4 pb-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{getDocumentDisplayInfo(document).title}</h2>
            <p className="text-xs text-muted-foreground">ID: {document.id} · {document.schema}</p>
          </div>
          <button onClick={onClose} className="rounded-sm p-2 hover:bg-muted" title="Close">✕</button>
        </div>
        <div className="min-h-0 flex-1">
          <ObjectPropertiesCard
            document={document}
            workspaceId={workspaceId ?? ''}
            initialTab={initialTab}
            initialEdit={initialEdit}
          />
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2 } from 'lucide-react'
import { ObjectPropertiesCard, type ObjectCardTab } from './ObjectPropertiesCard'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { useToolboxOptional } from '@/components/toolbox/toolbox-context'
import { cn } from '@/lib/utils'
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
  const [fullscreen, setFullscreen] = useState(false)
  const toolbox = useToolboxOptional()

  if (!isOpen || !document) return null

  // In fullscreen, leave the open toolbox column (ContentArea renders it as a
  // ~420px right-hand panel on desktop) uncovered AND clickable — reading an
  // email fullscreen while pasting bits of it into an agent chat is the whole
  // point. The overlay simply stops before the panel, so the toolbox stays
  // interactive above/beside the modal.
  const toolboxOpen = Boolean(toolbox?.state.t1Open || toolbox?.state.t2Open)
  const shrinkForToolbox = fullscreen && toolboxOpen

  // Portal to <body>: hosts can sit inside transformed ancestors (grid-layout
  // widgets, animated drawers) where `fixed` resolves against the transform —
  // the classic off-center-modal-on-mobile bug.
  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/50',
        fullscreen ? 'p-0' : 'p-4 max-md:p-2',
        shrinkForToolbox && 'md:right-[min(436px,90vw)]',
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'flex w-full flex-col border bg-background max-md:h-full max-md:max-w-none',
          fullscreen
            ? 'h-full max-w-none rounded-none md:rounded-lg md:m-2 md:h-[calc(100dvh-1rem)]'
            : 'h-[85dvh] max-w-3xl rounded-lg',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between p-4 pb-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{getDocumentDisplayInfo(document).title}</h2>
            <p className="text-xs text-muted-foreground">ID: {document.id} · {document.schema}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setFullscreen(!fullscreen)}
              className="hidden rounded-sm p-2 hover:bg-muted md:block"
              title={fullscreen ? 'Restore' : 'Fullscreen'}
              aria-label={fullscreen ? 'Restore' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="rounded-sm p-2 hover:bg-muted" title="Close">✕</button>
          </div>
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
    </div>,
    window.document.body,
  )
}

import { StickyNote, Link as LinkIcon, File as FileIcon, Mail, FileQuestion, X } from 'lucide-react'
import { resolveRenderer } from '@/components/renderers/resolve-renderer'
import { ImageRenderer } from '@/components/renderers/media'
import { B5Card, type B5SaveTarget } from '@/components/home/B5Card'
import { ObjectPropertiesCard } from '@/components/object-card/ObjectPropertiesCard'
import { NOTE_SCHEMA, TAB_SCHEMA, FILE_SCHEMA, EMAIL_SCHEMA } from '@/components/renderers/types'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { pasteDocumentsToWorkspacePath } from '@/services/workspace'
import { useSideView, type SideViewEntry } from './use-side-view'
import { useLiveDocument } from '@/hooks/useLiveDocument'
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
// Props override the context: the strip layout mounts one card per document
// canvas and owns the entries itself (components/shell/strip).
export function DocumentSideCard({ entry: entryProp, onClose, frame }: { entry?: SideViewEntry; onClose?: () => void; frame?: { expanded: boolean; onToggleExpanded: () => void } } = {}) {
  const sideView = useSideView()
  const entry = entryProp ?? sideView.entry
  const close = onClose ?? sideView.close
  // Same staleness as the modal host: `entry.document` is the opening list's
  // snapshot, so re-read it after an inline edit instead of rendering pre-edit
  // values (header title included) until the card is re-opened.
  const { document, refresh } = useLiveDocument(entry?.workspaceId, entry?.document ?? null)
  if (!entry || !document) return !entryProp && (sideView.loading || sideView.error) ? (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-(--card-radius) border bg-card">
      <div className="flex h-[calc(3rem-1px)] shrink-0 items-center justify-between border-b-[3px] bg-muted pl-4 pr-2">
        <span className="text-sm">Document</span><button type="button" onClick={close} className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="p-4 text-sm" role={sideView.error ? 'alert' : 'status'}>
        {sideView.error || 'Loading document…'}
        {sideView.error && <button type="button" className="ml-2 underline" onClick={sideView.retry}>Retry</button>}
      </div>
    </div>
  ) : null
  const { workspaceId } = entry
  const onChanged = (saved?: Document) => {
    refresh(saved)
    if (saved && saved.id !== entry.document.id && !entryProp) sideView.replace?.(saved, workspaceId)
  }

  const onSave = async (target: B5SaveTarget) => {
    await pasteDocumentsToWorkspacePath(workspaceId, target.path, [document.id], target.treeName, target.treeType)
    return [document.id]
  }

  return (
    <B5Card
      title={getDocumentDisplayInfo(document).title}
      icon={iconFor(document)}
      onClose={sideView.alwaysOn ? undefined : close}
      onSave={onSave}
      canSave
      successMessage="Linked"
      lockedWorkspaceName={workspaceId}
      // The document already exists here, so the picker gets its relations
      // tab too — "where does this belong" and "what does this point at" are
      // the same gesture, and the result lands in the Synapses tab below.
      relationSubjectId={document.id}
      frame={frame}
      fillParent
      fullWidthContent={resolveRenderer(document) === ImageRenderer}
      maximized={entryProp ? undefined : sideView.location?.maximized}
      onMaximizedChange={entryProp ? undefined : maximized => sideView.update?.({ maximized })}
    >
      {actions => <div className="document-side-content h-full min-h-0 min-w-0 w-full">
        <ObjectPropertiesCard key={`${workspaceId}:${document.id}`} document={document} workspaceId={workspaceId} onChanged={onChanged} compact tabActions={actions}
          initialTab={entryProp ? undefined : sideView.location?.section}
          onTabChange={entryProp ? undefined : section => sideView.update?.({ section })} />
      </div>}
    </B5Card>
  )
}

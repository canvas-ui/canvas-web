import { PlaintextFileForm } from './add/PlaintextFileForm'
import { FileText } from 'lucide-react'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { sketchEditor } from '@/components/editors/registry'
import { useAddTarget, useBackendAddTarget } from './add/useAddTarget'
import { useCallback, useRef, useState } from 'react'
import { ArrowLeft, X, Maximize2, Minimize2, MessageSquarePlus, StickyNote, Link as LinkIcon, Upload, Camera, Brush, Plus, Pencil, FileSearch, FolderPlus, ListTodo, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsTooNarrowToDock } from '@/hooks/use-mobile'
import { MessageComposer } from '@/components/common/MessageComposer'
import { InsertMenu } from '@/components/common/insert-menu'
import { useToolbox } from './use-toolbox'
import { type AddKind } from './toolbox-context'
import { NoteForm } from './add/NoteForm'
import { LinkForm } from './add/LinkForm'
import { TodoForm } from './add/TodoForm'
import { useCreateDestinations } from './add/useCreateDestinations'
import { IdentityForm } from './add/IdentityForm'
import { FileForm } from './add/FileForm'
import { FolderForm } from './add/FolderForm'
import { ExistingDocsForm } from './add/ExistingDocsForm'
import { EditNoteForm } from './add/EditNoteForm'
import { EditLinkForm } from './add/EditLinkForm'

const DEFAULT_WIDTH = 380
const MIN_WIDTH = 300
const MAX_WIDTH = 560

const TITLES: Record<AddKind, { label: string; icon: typeof StickyNote }> = {
  message: { label: 'New Message', icon: MessageSquarePlus },
  note: { label: 'New Note', icon: StickyNote },
  link: { label: 'New Link', icon: LinkIcon },
  todo: { label: 'New Todo', icon: ListTodo },
  identity: { label: 'New Identity', icon: User },
  sketch: { label: 'New Sketch', icon: Brush },
  plaintext: { label: 'New Plaintext File', icon: FileText },
  file: { label: 'Add Files', icon: Upload },
  photo: { label: 'Photo/Video', icon: Camera },
  existing: { label: 'Add Existing', icon: FileSearch },
  folder: { label: 'New Folder', icon: FolderPlus },
}

export function AddPanel() {
  const { state, openAdd, openAddPicker, closeAdd, setAddModal } = useToolbox()
  useEscapeClose(closeAdd, state.addOpen)
  const { addOpen, addKind, editDocument, addModal } = state
  const target = useAddTarget()
  const backend = useBackendAddTarget(target)
  // A connected service that takes new tasks (a GitHub repository, a CalDAV
  // task list) makes Todo available inside the backends tree as well.
  const taskDestinations = useCreateDestinations(backend.isBackend ? state.activeWorkspaceName : null, 'task')
  const backendTodo = backend.isBackend && taskDestinations.length > 0
  const allowedBackendKinds = [...(backend.destination ? ['file', 'photo', 'folder', 'plaintext'] : []), 'message', ...(backendTodo ? ['todo'] : [])]
  const backendBlockedKind = backend.isBackend && !!addKind && !allowedBackendKinds.includes(addKind)
  const messageWorkspace = state.activeWorkspaceName
  const omitMessage = !messageWorkspace || !!state.addRelateTo
  const blockedKind = backendBlockedKind || (addKind === 'message' && omitMessage)
  const omittedKinds: AddKind[] = backend.isBackend
    ? ['note', 'link', 'identity', 'sketch', 'existing', ...(backendTodo ? [] : ['todo' as const]), ...(backend.destination ? [] : ['file' as const, 'photo' as const, 'folder' as const, 'plaintext' as const])]
    : ['plaintext']
  if (omitMessage) omittedKinds.push('message')
  const formKey = target?.mode === 'workspace' ? `${target.workspaceName}:${target.treeName}:${target.path}` : target?.contextId
  const navigate = useNavigate()

  // Sketching needs the full viewport, not a side panel: picking Sketch
  // hands off to the standalone editor surface bound to the current target
  // (see components/editors/registry.ts).
  useEffect(() => {
    if (!addOpen || addKind !== 'sketch' || backend.isBackend) return
    closeAdd()
    navigate(sketchEditor.createUrl(target))
  }, [addOpen, addKind, target, closeAdd, navigate, backend.isBackend])
  // Drawer vs docked card: what matters is whether the content column
  // survives docking, not whether this is a phone-shaped viewport.
  const asDrawer = useIsTooNarrowToDock()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Drag handle lives on the left edge; dragging left widens the panel.
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: width }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - ev.clientX
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta))
      setWidth(next)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

  if (!addOpen) return null

  const isEditMode = Boolean(editDocument)
  const isPicker = !isEditMode && (!addKind || blockedKind)

  let headerLabel: string
  let HeaderIcon: typeof StickyNote

  if (isEditMode) {
    headerLabel = editDocument!.schema === 'data/schema/note' ? 'Edit Note' : 'Edit Link'
    HeaderIcon = editDocument!.schema === 'data/schema/note' ? StickyNote : LinkIcon
  } else if (addKind && !blockedKind) {
    headerLabel = TITLES[addKind].label
    HeaderIcon = TITLES[addKind].icon
  } else {
    headerLabel = 'Add'
    HeaderIcon = Plus
  }

  const content = (
    <>
      {/* Mobile scrim — same treatment as the M1/M2 menu drawer */}
      {(asDrawer || addModal) && (
        <div className={cn('fixed inset-0 bg-scrim animate-fade-in', addModal ? 'z-dialog' : 'z-panel-scrim')} onClick={closeAdd} aria-hidden />
      )}
    <div
      role={addModal ? 'dialog' : undefined}
      aria-modal={addModal || undefined}
      aria-label={addModal ? headerLabel : undefined}
      style={asDrawer || addModal ? undefined : { width }}
      className={cn(
        'flex flex-col overflow-hidden rounded-[var(--panel-radius)] border bg-card surface-glass',
        // Full editor: a centered surface above the page. It is this same
        // element restyled, not a second host, so the open form keeps its
        // state when the user switches. Mobile: M1/M2-style drawer next to
        // the menubar, above everything (incl. the z-50 toolbox FAB, which
        // would otherwise cover the form's bottom controls). Desktop: a
        // resizable flex sibling that shrinks the main content.
        addModal ? 'fixed inset-0 z-dialog m-auto h-[86dvh] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-5xl bg-popover shadow-elevation-4' : asDrawer
          ? 'fixed bottom-2 left-2 right-2 top-2 z-panel shadow-elevation-5 animate-fade-in'
          : 'relative shrink-0 shadow-elevation-3',
      )}
    >
      {!asDrawer && !addModal && (
        <div
          onMouseDown={onDragStart}
          className="absolute left-0 top-0 bottom-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/20"
        />
      )}

      <div className="flex h-[calc(3rem-1px)] shrink-0 items-center gap-2 border-b-4 px-2"
        style={state.activeAccentColor ? { borderBottomColor: state.activeAccentColor } : undefined}>
        <button type="button" className="canvas-nav-button" aria-label="Back one level" onClick={() => isPicker || isEditMode ? closeAdd() : openAddPicker()}><ArrowLeft className="h-5 w-5" /></button>
        <span className="flex flex-1 items-center gap-2 text-sm font-medium">
          {isEditMode ? <Pencil className="h-4 w-4" /> : <HeaderIcon className="h-4 w-4" />}
          {headerLabel}
        </span>
        {!isPicker && (
          <button
            type="button"
            onClick={() => setAddModal(!addModal)}
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={addModal ? 'Back to side panel' : 'Open full editor'}
            title={addModal ? 'Back to side panel' : 'Open full editor'}
            aria-pressed={addModal}
          >
            {addModal ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={closeAdd}
          className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isEditMode && editDocument!.schema === 'data/schema/note' && <EditNoteForm />}
        {isEditMode && editDocument!.schema === 'data/schema/link' && <EditLinkForm />}
        {/* Shared insertion menu — same entries/order as the home quick-add */}
        {!isEditMode && isPicker && state.addRelateTo && (
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">
            The new document will be related to {state.addRelateTo.documents.length} selected document{state.addRelateTo.documents.length === 1 ? '' : 's'}.
          </p>
        )}
        {!isEditMode && backend.isBackend && addKind !== 'message' && (
          <p className="border-b px-4 py-3 text-xs text-muted-foreground">
            {backend.loading ? 'Checking storage destination…'
              : backend.destination ? 'Files are saved directly to this backend folder. Notes and other database documents belong in context or directory trees.'
                : backendTodo ? 'Todos added here are created on the connected service. Notes and other database documents belong in context or directory trees.'
                  : backend.error}
          </p>
        )}
        {!isEditMode && isPicker && (!backend.isBackend || backend.destination || backendTodo) && <InsertMenu onSelect={openAdd} omit={omittedKinds} />}
        {!isEditMode && addKind === 'message' && !omitMessage && messageWorkspace && <MessageComposer key={messageWorkspace} workspaceId={messageWorkspace} onClose={closeAdd} embedded wide={addModal} />}
        {!isEditMode && !backend.isBackend && addKind === 'note' && <NoteForm key={formKey} />}
        {!isEditMode && !backend.isBackend && addKind === 'link' && <LinkForm />}
        {!isEditMode && (!backend.isBackend || backendTodo) && addKind === 'todo' && <TodoForm />}
        {!isEditMode && !backend.isBackend && addKind === 'identity' && <IdentityForm />}
        {!isEditMode && backend.destination && addKind === 'plaintext' && <PlaintextFileForm key={formKey} />}
        {!isEditMode && (!backend.isBackend || backend.destination) && addKind === 'file' && <FileForm key={formKey} />}
        {!isEditMode && (!backend.isBackend || backend.destination) && addKind === 'photo' && <FileForm key={formKey} capture />}
        {!isEditMode && !backend.isBackend && addKind === 'existing' && <ExistingDocsForm />}
        {!isEditMode && (!backend.isBackend || backend.destination) && addKind === 'folder' && <FolderForm key={formKey} />}
      </div>
    </div>
    </>
  )
  return content
}

import { useEscapeClose } from '@/hooks/useEscapeClose'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { sketchEditor } from '@/components/editors/registry'
import { useAddTarget } from './add/useAddTarget'
import { useCallback, useRef, useState } from 'react'
import { X, StickyNote, Link as LinkIcon, Upload, Camera, Brush, Plus, Pencil, FileSearch, FolderPlus, ListTodo, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsTooNarrowToDock } from '@/hooks/use-mobile'
import { InsertMenu } from '@/components/common/insert-menu'
import { useToolbox } from './use-toolbox'
import { type AddKind } from './toolbox-context'
import { NoteForm } from './add/NoteForm'
import { LinkForm } from './add/LinkForm'
import { TodoForm } from './add/TodoForm'
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
  note: { label: 'New Note', icon: StickyNote },
  link: { label: 'New Link', icon: LinkIcon },
  todo: { label: 'New Todo', icon: ListTodo },
  identity: { label: 'New Identity', icon: User },
  sketch: { label: 'New Sketch', icon: Brush },
  file: { label: 'Add Files', icon: Upload },
  photo: { label: 'Photo/Video', icon: Camera },
  existing: { label: 'Add Existing', icon: FileSearch },
  folder: { label: 'New Folder', icon: FolderPlus },
}

export function AddPanel() {
  const { state, openAdd, closeAdd } = useToolbox()
  useEscapeClose(closeAdd, state.addOpen)
  const { addOpen, addKind, editDocument } = state
  const target = useAddTarget()
  const navigate = useNavigate()

  // Sketching needs the full viewport, not a side panel: picking Sketch
  // hands off to the standalone editor surface bound to the current target
  // (see components/editors/registry.ts).
  useEffect(() => {
    if (!addOpen || addKind !== 'sketch') return
    closeAdd()
    navigate(sketchEditor.createUrl(target))
  }, [addOpen, addKind, target, closeAdd, navigate])
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
  const isPicker = !isEditMode && !addKind

  let headerLabel: string
  let HeaderIcon: typeof StickyNote

  if (isEditMode) {
    headerLabel = editDocument!.schema === 'data/schema/note' ? 'Edit Note' : 'Edit Link'
    HeaderIcon = editDocument!.schema === 'data/schema/note' ? StickyNote : LinkIcon
  } else if (addKind) {
    headerLabel = TITLES[addKind].label
    HeaderIcon = TITLES[addKind].icon
  } else {
    headerLabel = 'Add'
    HeaderIcon = Plus
  }

  return (
    <>
      {/* Mobile scrim — same treatment as the M1/M2 menu drawer */}
      {asDrawer && (
        <div className="fixed inset-0 z-panel-scrim bg-scrim animate-fade-in" onClick={closeAdd} aria-hidden />
      )}
    <div
      style={asDrawer ? undefined : { width }}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-card surface-glass',
        // Mobile: M1/M2-style drawer next to the menubar, above everything
        // (incl. the z-50 toolbox FAB, which would otherwise cover the form's
        // bottom controls). Desktop: a resizable flex sibling that shrinks
        // the main content.
        asDrawer
          ? 'fixed bottom-2 left-2 right-2 top-2 z-panel shadow-elevation-5 animate-fade-in'
          : 'relative shrink-0 shadow-elevation-3',
      )}
    >
      {!asDrawer && (
        <div
          onMouseDown={onDragStart}
          className="absolute left-0 top-0 bottom-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/20"
        />
      )}

      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          {isEditMode ? <Pencil className="h-4 w-4" /> : <HeaderIcon className="h-4 w-4" />}
          {headerLabel}
        </span>
        <button
          type="button"
          onClick={closeAdd}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEditMode && editDocument!.schema === 'data/schema/note' && <EditNoteForm />}
        {isEditMode && editDocument!.schema === 'data/schema/link' && <EditLinkForm />}
        {/* Shared insertion menu — same entries/order as the home quick-add */}
        {!isEditMode && isPicker && <InsertMenu onSelect={openAdd} />}
        {!isEditMode && addKind === 'note' && <NoteForm />}
        {!isEditMode && addKind === 'link' && <LinkForm />}
        {!isEditMode && addKind === 'todo' && <TodoForm />}
        {!isEditMode && addKind === 'identity' && <IdentityForm />}
        {!isEditMode && addKind === 'file' && <FileForm />}
        {!isEditMode && addKind === 'photo' && <FileForm capture />}
        {!isEditMode && addKind === 'existing' && <ExistingDocsForm />}
        {!isEditMode && addKind === 'folder' && <FolderForm />}
      </div>
    </div>
    </>
  )
}

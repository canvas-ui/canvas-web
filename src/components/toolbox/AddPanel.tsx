import { useCallback, useRef, useState } from 'react'
import { X, StickyNote, Link as LinkIcon, Upload, Plus, Pencil, FileSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useToolbox, type AddKind } from './toolbox-context'
import { NoteForm } from './add/NoteForm'
import { LinkForm } from './add/LinkForm'
import { FileForm } from './add/FileForm'
import { ExistingDocsForm } from './add/ExistingDocsForm'
import { EditNoteForm } from './add/EditNoteForm'
import { EditLinkForm } from './add/EditLinkForm'

const DEFAULT_WIDTH = 380
const MIN_WIDTH = 300
const MAX_WIDTH = 560

const TITLES: Record<AddKind, { label: string; icon: typeof StickyNote }> = {
  note: { label: 'New Note', icon: StickyNote },
  link: { label: 'New Link', icon: LinkIcon },
  file: { label: 'Add Files', icon: Upload },
  existing: { label: 'Add Existing', icon: FileSearch },
}

// Abstraction list shown in the panel's picker mode. Single source of truth —
// adding one of the ~10 eventual abstractions is one entry here (+ its form).
const ABSTRACTIONS: { kind: AddKind; label: string; icon: typeof StickyNote }[] = [
  { kind: 'note', label: 'Note', icon: StickyNote },
  { kind: 'link', label: 'Link', icon: LinkIcon },
  { kind: 'file', label: 'File', icon: Upload },
  { kind: 'existing', label: 'Existing document', icon: FileSearch },
]

export function AddPanel() {
  const { state, openAdd, closeAdd } = useToolbox()
  const { addOpen, addKind, editDocument } = state
  const isMobile = useIsMobile()
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
    headerLabel = editDocument!.schema === 'data/abstraction/note' ? 'Edit Note' : 'Edit Link'
    HeaderIcon = editDocument!.schema === 'data/abstraction/note' ? StickyNote : LinkIcon
  } else if (addKind) {
    headerLabel = TITLES[addKind].label
    HeaderIcon = TITLES[addKind].icon
  } else {
    headerLabel = 'Add'
    HeaderIcon = Plus
  }

  return (
    <div
      style={isMobile ? undefined : { width }}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-card',
        // Mobile: fixed overlay above everything (incl. the z-50 toolbox FAB,
        // which would otherwise cover the form's bottom controls). Desktop:
        // a resizable flex sibling that shrinks the main content.
        isMobile
          ? 'fixed inset-2 z-[55] shadow-elevation-8 animate-fade-in'
          : 'relative shrink-0 shadow-elevation-3',
      )}
    >
      {!isMobile && (
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
        {isEditMode && editDocument!.schema === 'data/abstraction/note' && <EditNoteForm />}
        {isEditMode && editDocument!.schema === 'data/abstraction/link' && <EditLinkForm />}
        {!isEditMode && isPicker && (
          <div className="p-2">
            {ABSTRACTIONS.map(({ kind, label: l, icon: I }) => (
              <button
                key={kind}
                type="button"
                onClick={() => openAdd(kind)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <I className="h-4 w-4 text-muted-foreground" />
                {l}
              </button>
            ))}
          </div>
        )}
        {!isEditMode && addKind === 'note' && <NoteForm />}
        {!isEditMode && addKind === 'link' && <LinkForm />}
        {!isEditMode && addKind === 'file' && <FileForm />}
        {!isEditMode && addKind === 'existing' && <ExistingDocsForm />}
      </div>
    </div>
  )
}

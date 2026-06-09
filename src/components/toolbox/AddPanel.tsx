import { useCallback, useRef, useState } from 'react'
import { X, StickyNote, Link as LinkIcon, Upload } from 'lucide-react'
import { useToolbox, type AddKind } from './toolbox-context'
import { NoteForm } from './add/NoteForm'
import { LinkForm } from './add/LinkForm'
import { FileForm } from './add/FileForm'

const DEFAULT_WIDTH = 380
const MIN_WIDTH = 300
const MAX_WIDTH = 560

const TITLES: Record<AddKind, { label: string; icon: typeof StickyNote }> = {
  note: { label: 'New Note', icon: StickyNote },
  link: { label: 'New Link', icon: LinkIcon },
  file: { label: 'Add Files', icon: Upload },
}

export function AddPanel() {
  const { state, closeAdd } = useToolbox()
  const { addOpen, addKind } = state
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

  if (!addOpen || !addKind) return null

  const { label, icon: Icon } = TITLES[addKind]

  return (
    <div
      style={{ width }}
      className="relative flex shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-elevation-3"
    >
      <div
        onMouseDown={onDragStart}
        className="absolute left-0 top-0 bottom-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/20"
      />

      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4" />
          {label}
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
        {addKind === 'note' && <NoteForm />}
        {addKind === 'link' && <LinkForm />}
        {addKind === 'file' && <FileForm />}
      </div>
    </div>
  )
}

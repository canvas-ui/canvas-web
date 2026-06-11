import { useEffect, useRef, useState } from 'react'
import { Plus, StickyNote, Link as LinkIcon, Upload } from 'lucide-react'
import { useToolbox, type AddKind } from '@/components/toolbox/toolbox-context'
import { cn } from '@/lib/utils'

// Material-design-v2-ish speed-dial FAB. A single round `+` anchored bottom-right
// of the content sheet; clicking fans out the create actions, picking one slides
// the AddPanel in beside the content (via toolbox `openAdd`).
const ACTIONS: { kind: AddKind; label: string; icon: typeof StickyNote }[] = [
  { kind: 'note', label: 'Note', icon: StickyNote },
  { kind: 'link', label: 'Link', icon: LinkIcon },
  { kind: 'file', label: 'File', icon: Upload },
]

export function CreateFab() {
  const { openAdd } = useToolbox()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Dismiss the fan on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (kind: AddKind) => {
    openAdd(kind)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="absolute bottom-6 right-6 z-30 flex flex-col items-end gap-3">
      {/* Fanned actions — stack above the main button, labelled mini-FABs */}
      <div
        className={cn(
          'flex flex-col items-end gap-3 transition-all duration-150',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
        )}
      >
        {ACTIONS.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => pick(kind)}
            className="group flex items-center gap-3"
            tabIndex={open ? 0 : -1}
          >
            <span className="rounded-md bg-zinc-900/90 px-2 py-1 text-xs font-medium text-zinc-100 shadow-elevation-2">
              {label}
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full border bg-card text-foreground shadow-elevation-3 transition-colors group-hover:bg-muted">
              <Icon className="h-5 w-5" />
            </span>
          </button>
        ))}
      </div>

      {/* Primary FAB */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close create menu' : 'Create'}
        aria-expanded={open}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevation-3 transition-transform hover:brightness-110"
      >
        <Plus className={cn('h-6 w-6 transition-transform duration-200', open && 'rotate-45')} />
      </button>
    </div>
  )
}

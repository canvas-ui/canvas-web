import { useEffect, useRef, useState } from 'react'
import { Plus, StickyNote, Link as LinkIcon, Upload } from 'lucide-react'
import { useToolbox, type AddKind } from '@/components/toolbox/toolbox-context'
import { cn } from '@/lib/utils'

// Top-right "+" anchored to the content sheet. Clicking opens a box listing the
// data abstractions you can add; picking one slides the AddPanel in beside the
// content (via toolbox `openAdd`). ACTIONS is the single source of truth — adding
// one of the ~10 eventual abstractions is just another entry here (+ its form).
const ACTIONS: { kind: AddKind; label: string; icon: typeof StickyNote }[] = [
  { kind: 'note', label: 'Note', icon: StickyNote },
  { kind: 'link', label: 'Link', icon: LinkIcon },
  { kind: 'file', label: 'File', icon: Upload },
]

export function CreateFab() {
  const { openAdd } = useToolbox()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Dismiss the box on outside click / Escape.
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
    <div ref={rootRef} className="absolute top-4 right-4 z-30 flex flex-col items-end gap-2">
      {/* Primary "+" */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close create menu' : 'Create'}
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevation-3 transition-transform hover:brightness-110"
      >
        <Plus className={cn('h-5 w-5 transition-transform duration-200', open && 'rotate-45')} />
      </button>

      {/* Abstraction picker — a bordered box of labelled rows, opens under the "+" */}
      <div
        className={cn(
          'w-44 overflow-hidden rounded-xl border bg-card p-1 shadow-elevation-3 transition-all duration-150',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none -translate-y-1 opacity-0',
        )}
      >
        {ACTIONS.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => pick(kind)}
            tabIndex={open ? 0 : -1}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

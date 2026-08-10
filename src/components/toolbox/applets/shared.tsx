import { useCallback, useEffect, useRef, useState } from 'react'
import { Link2, Trash2 } from 'lucide-react'
import { LinkToCard, type LinkToTarget } from '@/components/menu/shared/LinkToCard'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { pasteDocumentsToWorkspacePath } from '@/services/workspace'

export const APPLET_AUTOSAVE_MS = 1200

// Auto-growing borderless textarea - the notepad body.
export function GrowingTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  innerRef,
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  innerRef?: (el: HTMLTextAreaElement | null) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
  useEffect(() => { resize() }, [value, resize])
  return (
    <textarea
      ref={(el) => { ref.current = el; innerRef?.(el) }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={1}
      spellCheck={false}
      className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
    />
  )
}

// Per-item Link To / Delete controls for the meta row. Quiet by default on
// pointer devices (reveal-on-hover pairs with `group` on the item row).
export function ItemActions({ onLinkTo, onDelete }: { onLinkTo: () => void; onDelete: () => void }) {
  return (
    <span className="reveal-on-hover flex items-center gap-0.5">
      <button
        type="button"
        onClick={onLinkTo}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Link to…"
        title="Link to…"
      >
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
        aria-label="Delete"
        title="Delete (moves to trash)"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

// Right-edge LinkToCard overlay - the same picker the document list uses,
// unfixed workspace so the item can be linked anywhere.
export function LinkDocOverlay({ documentId, onClose }: { documentId: number; onClose: () => void }) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const [saving, setSaving] = useState(false)

  const confirm = async (paths: string[], t: LinkToTarget) => {
    if (!paths.length) return
    setSaving(true)
    try {
      for (const p of paths) {
        await pasteDocumentsToWorkspacePath(t.workspaceName, p, [documentId], t.treeName, t.treeType)
      }
      showSuccessToast(`Linked to ${paths.length} path${paths.length > 1 ? 's' : ''}`)
      onClose()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to link document')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-panel flex items-stretch justify-end bg-scrim animate-fade-in" onClick={onClose}>
      <div className="h-full p-2" onClick={(e) => e.stopPropagation()}>
        <LinkToCard onClose={onClose} onConfirm={confirm} documentCount={1} saving={saving} sizeClassName="h-full w-[380px] max-w-[90vw]" />
      </div>
    </div>
  )
}

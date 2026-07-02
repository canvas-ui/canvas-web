import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RotateCw, Maximize2, Minimize2, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { LinkToCard, type LinkToTarget } from '@/components/menu/shared/LinkToCard'
import { pasteDocumentsToWorkspacePath } from '@/services/workspace'

export type B5SaveTarget = LinkToTarget & { path: string }

interface B5CardProps {
  title: string
  icon: LucideIcon
  onClose: () => void
  // Omit entirely to render a view-only card with no Save/"Link To" button
  // (e.g. DocumentSideCard's read-only peek at an existing document).
  // Must return the created/linked document id(s) — when the picker's tree
  // is multi-selected, B5Card links those same ids into every additional
  // path itself (see handleSelect) rather than re-creating per path.
  onSave?: (target: B5SaveTarget) => Promise<number[]>
  canSave?: boolean
  saving?: boolean
  successMessage?: string
  lockedWorkspaceName?: string
  // Fills the parent's height instead of the fixed B5 aspect-ratio sizing —
  // e.g. DocumentSideCard, which should match ContentArea's full height
  // rather than look like a floating quick-add card. Orientation toggle
  // (aspect-ratio only makes sense for the fixed-size card) is hidden.
  fillParent?: boolean
  children: ReactNode
}

// Material-v2 "paper" — single-purpose B5-aspect card. Lives inline in the
// page flow (a flex item alongside sibling cards, so several can sit side by
// side) rather than a modal — it only portals to a fullscreen overlay while
// explicitly maximized.
export function B5Card({
  title, icon: Icon, onClose, onSave, canSave = false, saving = false, successMessage = 'Saved', lockedWorkspaceName, fillParent = false, children,
}: B5CardProps) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [maximized, setMaximized] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const handleSelect = async (paths: string[], ctx: LinkToTarget) => {
    if (!onSave) return
    try {
      const ids = await onSave({ ...ctx, path: paths[0] })
      const extraPaths = paths.slice(1)
      if (ids.length && extraPaths.length) {
        await Promise.all(extraPaths.map((p) => pasteDocumentsToWorkspacePath(ctx.workspaceName, p, ids, ctx.treeName, ctx.treeType)))
      }
      showSuccessToast(successMessage)
      onClose()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const cardStyle = maximized
    ? (pickerOpen ? { flex: '1 1 auto', minWidth: 0, height: '100%' } : { width: '100%', height: '100%' })
    : fillParent
      ? { height: '100%', width: 'min(480px, 90vw)', flexShrink: 0 }
      : orientation === 'portrait'
        ? { aspectRatio: '0.707 / 1', height: '85vh', width: 'auto', maxWidth: '90vw', flexShrink: 0 }
        : { aspectRatio: '1 / 0.707', width: 'min(90vw, 900px)', height: 'auto', maxHeight: '85vh', flexShrink: 0 }

  const card = (
    <div
      style={cardStyle}
      className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-4 transition-[width,height]"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <span className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{title}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {!fillParent && (
            <button
              type="button"
              onClick={() => setOrientation((o) => (o === 'portrait' ? 'landscape' : 'portrait'))}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Toggle orientation"
              title="Toggle orientation"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          )}
          {onSave && (
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save / Link to…'}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setMaximized((m) => !m)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={maximized ? 'Restore' : 'Maximize'}
            title={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={cn('flex-1 overflow-y-auto', maximized && 'mx-auto w-full max-w-3xl')}>{children}</div>
    </div>
  )

  const picker = onSave && pickerOpen && (
    <LinkToCard
      onClose={() => setPickerOpen(false)}
      onConfirm={handleSelect}
      fixedWorkspaceName={lockedWorkspaceName}
      saving={saving}
    />
  )

  if (maximized) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center gap-4 bg-black/40 p-4">
        {card}
        {picker}
      </div>,
      document.body,
    )
  }

  return (
    <>
      {card}
      {picker}
    </>
  )
}

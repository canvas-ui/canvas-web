import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RotateCw, Maximize2, Minimize2, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { TreePicker, type TreePickerTarget } from '@/components/menu/shared/TreePicker'

interface B5CardProps {
  title: string
  icon: LucideIcon
  onClose: () => void
  onSave: (target: TreePickerTarget) => Promise<unknown>
  canSave: boolean
  saving: boolean
  successMessage?: string
  lockedWorkspaceName?: string
  children: ReactNode
}

// Material-v2 "paper" — single-purpose B5-aspect card. Lives inline in the
// page flow (a flex item alongside sibling cards, so several can sit side by
// side) rather than a modal — it only portals to a fullscreen overlay while
// explicitly maximized.
export function B5Card({
  title, icon: Icon, onClose, onSave, canSave, saving, successMessage = 'Saved', lockedWorkspaceName, children,
}: B5CardProps) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [maximized, setMaximized] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { showSuccessToast, showErrorToast } = useToastHelpers()

  const handleSelect = async (target: TreePickerTarget) => {
    try {
      await onSave(target)
      showSuccessToast(successMessage)
      onClose()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const cardStyle = maximized
    ? (pickerOpen ? { flex: '1 1 auto', minWidth: 0, height: '100%' } : { width: '100%', height: '100%' })
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
          <button
            type="button"
            onClick={() => setOrientation((o) => (o === 'portrait' ? 'landscape' : 'portrait'))}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Toggle orientation"
            title="Toggle orientation"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save / Link to…'}
          </Button>
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
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={cn('flex-1 overflow-y-auto', maximized && 'mx-auto w-full max-w-3xl')}>{children}</div>
    </div>
  )

  const picker = pickerOpen && (
    <TreePicker
      onClose={() => setPickerOpen(false)}
      onSelect={handleSelect}
      lockedWorkspaceName={lockedWorkspaceName}
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

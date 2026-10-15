import { useEscapeClose } from '@/hooks/useEscapeClose'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/** Shared centered surface for document actions opened from the content area. */
export function DocumentActionDialog({ label, onClose, children }: {
  label: string; onClose: () => void; children: ReactNode
}) {
  useEscapeClose(onClose)
  return createPortal(
    <div className="fixed inset-0 z-dialog flex items-center justify-center bg-scrim p-4" onClick={onClose}>
      <section data-dialog-surface role="dialog" aria-modal="true" aria-label={label}
        className="h-[86dvh] max-h-full min-h-0 w-full max-w-3xl overflow-y-auto rounded-(--panel-radius) border bg-popover text-popover-foreground shadow-elevation-4"
        onClick={event => event.stopPropagation()}>
        {children}
      </section>
    </div>, window.document.body,
  )
}

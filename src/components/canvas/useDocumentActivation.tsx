import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useDocumentModal } from '@/components/shell/document-modal-context-data'
import type { Document } from '@/types/workspace'

const LONG_PRESS_MS = 450
// A touch that moves more than this between down and up is a scroll, not a press.
const MOVE_TOLERANCE_PX = 10

// Makes a widget item (a todo row, a recent-doc line, …) a shortcut into the
// shared document modal — the full-fledged view/edit controls (priority, status,
// tags, …). Mouse: click or right-click. Touch: tap or long-press. Works on any
// authenticated canvas, including a read-only home tile; on the public share
// (no DocumentModalProvider) useDocumentModal is a no-op, so it just does nothing.
//
// Spread the returned props on the row container. Inner controls that have their
// own action (e.g. a todo checkbox) must stop propagation so they don't also
// open the modal — pass `stopRowActivation` to their onClick.
export function useDocumentActivation(document: Document | null, workspaceId: string) {
  const { open } = useDocumentModal()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  // A completed long-press fires the modal on its own; swallow the click that
  // the browser then synthesizes so it doesn't reopen/close it.
  const suppressClick = useRef(false)

  const activate = () => { if (document) open(document, workspaceId) }
  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }

  return {
    activationProps: {
      role: 'button' as const,
      tabIndex: 0,
      onClick: () => {
        if (suppressClick.current) { suppressClick.current = false; return }
        activate()
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
      },
      onContextMenu: (e: { preventDefault: () => void }) => { e.preventDefault(); activate() },
      onPointerDown: (e: PointerEvent) => {
        if (e.pointerType !== 'touch') return
        start.current = { x: e.clientX, y: e.clientY }
        suppressClick.current = false
        clearTimer()
        timer.current = setTimeout(() => { suppressClick.current = true; activate() }, LONG_PRESS_MS)
      },
      onPointerMove: (e: PointerEvent) => {
        if (!start.current) return
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE_PX) clearTimer()
      },
      onPointerUp: clearTimer,
      onPointerCancel: clearTimer,
      onPointerLeave: clearTimer,
    },
    // Inner interactive controls call this in their own onClick.
    stopRowActivation: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  }
}

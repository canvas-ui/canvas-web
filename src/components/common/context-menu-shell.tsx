import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useEscapeClose } from '@/hooks/useEscapeClose'

// Portal shell for coordinate-positioned context menus: a full-screen
// dismiss overlay plus the menu itself, clamped into the viewport after
// render — menu size varies with item count, so a fixed estimate can't keep
// tall menus on-screen. Measure, then nudge.
export function ContextMenuShell({ x, y, onClose, className, children }: {
  x: number
  y: number
  onClose: () => void
  // Menu box styling (background, border, padding…) — positioning, z-index
  // and overflow are owned by the shell.
  className?: string
  children: ReactNode
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useEscapeClose(onClose)

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    setPos({
      x: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    })
  }, [x, y])

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-menu-scrim"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose() }}
      />
      <div
        ref={menuRef}
        style={{ left: pos.x, top: pos.y }}
        className={cn('fixed z-menu max-h-viewport-modal overflow-y-auto', className)}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}

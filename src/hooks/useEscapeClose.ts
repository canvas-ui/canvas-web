import { useEffect, useRef } from 'react'

/**
 * Close an overlay on Escape. All open overlays share one module-level stack,
 * so with nested overlays (a picker over a modal over a page) each Esc press
 * closes only the TOPMOST one — matching native dialog behavior.
 *
 * Usage: `useEscapeClose(onClose, isOpen)` — registration follows `active`,
 * so components that render `null` when closed can pass `true`, and hosts
 * that stay mounted pass their open flag.
 */

const stack: Array<() => void> = []

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  top()
}

export function useEscapeClose(onClose: (() => void) | undefined, active = true) {
  // The stack entry must be identity-stable for the lifetime of the overlay —
  // re-registering on every render would hoist a re-rendered BACKGROUND
  // overlay above the actual topmost one.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  const enabled = active && !!onClose
  useEffect(() => {
    if (!enabled) return
    const entry = () => closeRef.current?.()
    stack.push(entry)
    if (stack.length === 1) window.addEventListener('keydown', onKeyDown)
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      if (stack.length === 0) window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled])
}

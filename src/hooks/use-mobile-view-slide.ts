import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { useIsMobile } from './use-mobile'

/** Animate the incoming view without remounting its tree, scroll or form state. */
export function useMobileViewSlide(ref: RefObject<HTMLElement | null>, active: boolean, viewKey: string, enabled = true) {
  const mobile = useIsMobile()
  const location = useLocation()
  const previous = useRef<{ active: boolean; viewKey: string; index: number; backwards: boolean } | null>(null)

  useLayoutEffect(() => {
    const index = window.history.state?.idx ?? 0
    const last = previous.current
    const backwards = location.state?.canvasMenuBack || !!last && (index < last.index || index === last.index && last.backwards)
    previous.current = { active, viewKey, index, backwards }
    if (!enabled || !mobile || !active || !last || (last.active && last.viewKey === viewKey)) return
    const element = ref.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const value = Number.parseFloat(getComputedStyle(element).getPropertyValue('--motion-scale'))
    const scale = Number.isFinite(value) ? Math.max(0, value) : 1
    const animation = element.animate([
      { transform: `translateX(${backwards ? '-100%' : '100%'})` },
      { transform: 'translateX(0)' },
    ], { duration: 70 * scale, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    return () => animation.cancel()
  }, [enabled, mobile, active, viewKey, location.key, location.state, ref])
}

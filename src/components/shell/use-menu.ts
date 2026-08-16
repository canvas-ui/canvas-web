import { createContext, useContext, useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile'

// ─── Types ───────────────────────────────────────────────────────────────────

export type MenuSection = 'contexts' | 'workspaces' | 'agents' | 'roles' | 'admin' | 'settings' | null
// 'detail' is the entity's own M2 surface (tree, sessions, URL editor);
// 'settings' is the settings section list. Creation has no M2 view — it
// happens in the content area.
export type M2View = 'detail' | 'settings' | null

export interface MenuState {
  activeSection: MenuSection
  // Mobile only: the M0 icon rail is hidden by default on small screens and
  // floats over the content while open. Ignored on desktop, where the rail
  // is always part of the layout flow.
  m0Open: boolean
  m1Open: boolean
  m2Open: boolean
  m2View: M2View
  selectedEntityId: string | null
  user: { id: string; email: string; userType: string } | null
}

export type MenuAction =
  | { type: 'SET_SECTION'; section: MenuSection }
  | { type: 'TOGGLE_SECTION'; section: MenuSection }
  | { type: 'TOGGLE_M0' }
  | { type: 'CLOSE_M0' }
  | { type: 'CLOSE_M1' }
  | { type: 'OPEN_M2'; view: M2View; entityId?: string | null }
  | { type: 'OPEN_M2_DRAWER'; section: MenuSection; view: M2View; entityId: string | null }
  | { type: 'OPEN_M1_DRAWER'; section: MenuSection }
  | { type: 'CLOSE_M2' }
  | { type: 'SELECT_ENTITY'; entityId: string | null }
  | { type: 'SYNC_FROM_URL'; section: MenuSection; entityId: string | null; m2View: M2View; mobile?: boolean }
  | { type: 'SET_USER'; user: MenuState['user'] }

export interface MenuContextValue {
  state: MenuState
  dispatch: React.Dispatch<MenuAction>
  setSection: (section: MenuSection) => void
  toggleSection: (section: MenuSection) => void
  toggleM0: () => void
  closeM0: () => void
  closeM1: () => void
  openM2: (view: M2View, entityId?: string | null) => void
  openM2Drawer: (section: MenuSection, view: M2View, entityId: string | null) => void
  openM1Drawer: (section: MenuSection) => void
  closeM2: () => void
  selectEntity: (entityId: string | null) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

export const MenuContext = createContext<MenuContextValue | null>(null)

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('useMenu must be used within a MenuProvider')
  return ctx
}

// ─── URL Sync ────────────────────────────────────────────────────────────────

export function sectionFromPath(pathname: string): { section: MenuSection; entityId: string | null; m2View: M2View } {
  const segments = pathname.split('/').filter(Boolean)
  const first = segments[0] || ''
  const second = segments[1] || null
  const third = segments[2] || null

  if (first === 'contexts') {
    // Settings put the section list in M2 and one section in the content area.
    return { section: 'contexts', entityId: second, m2View: third === 'settings' ? 'settings' : second ? 'detail' : null }
  }
  if (first === 'workspaces') {
    // Settings put the section list in M2 and one section in the content area.
    return { section: 'workspaces', entityId: second, m2View: third === 'settings' ? 'settings' : second ? 'detail' : null }
  }
  if (first === 'agents') {
    return { section: 'agents', entityId: second, m2View: third === 'settings' ? 'settings' : second ? 'detail' : null }
  }
  if (first === 'admin') return { section: 'admin', entityId: null, m2View: null }
  if (first === 'api-tokens') return { section: 'settings', entityId: null, m2View: null }
  return { section: null, entityId: null, m2View: null }
}

export function useMenuUrlSync(_state: MenuState, dispatch: React.Dispatch<MenuAction>) {
  const location = useLocation()
  const navigate = useNavigate()
  const isInternalNav = useRef(false)

  // URL → State: when the URL changes externally (browser back/forward, direct nav)
  useEffect(() => {
    if (isInternalNav.current) {
      isInternalNav.current = false
      return
    }
    const { section, entityId, m2View } = sectionFromPath(location.pathname)
    // Read the breakpoint at dispatch time rather than from a hook: this runs
    // inside an effect that must produce one dispatch per navigation, so it
    // needs the value imperatively, not as reactive state. (useIsMobile is now
    // correct on first render, but subscribing here would re-dispatch on every
    // resize across the breakpoint, which is not what SYNC_FROM_URL means.)
    const mobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
    dispatch({ type: 'SYNC_FROM_URL', section, entityId, m2View, mobile })
  }, [location.pathname, dispatch])

  // State → URL: navigate when entity selection changes from menu interaction
  const navigateToEntity = useCallback((path: string) => {
    isInternalNav.current = true
    navigate(path)
  }, [navigate])

  return { navigateToEntity }
}

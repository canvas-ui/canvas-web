import { createContext, useCallback, useContext, useEffect, useRef, type Dispatch } from 'react'
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
  | { type: 'CLOSE_M2' }
  | { type: 'SELECT_ENTITY'; entityId: string | null }
  | { type: 'SYNC_FROM_URL'; section: MenuSection; entityId: string | null; m2View: M2View; mobile?: boolean }
  | { type: 'SET_USER'; user: MenuState['user'] }

export interface MenuContextValue {
  state: MenuState
  dispatch: Dispatch<MenuAction>
  setSection: (section: MenuSection) => void
  toggleSection: (section: MenuSection) => void
  toggleM0: () => void
  closeM0: () => void
  closeM1: () => void
  openM2: (view: M2View, entityId?: string | null) => void
  openM2Drawer: (section: MenuSection, view: M2View, entityId: string | null) => void
  closeM2: () => void
  selectEntity: (entityId: string | null) => void
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export const initialState: MenuState = {
  activeSection: null,
  m0Open: false,
  m1Open: false,
  m2Open: false,
  m2View: null,
  selectedEntityId: null,
  user: null,
}

export function menuReducer(state: MenuState, action: MenuAction): MenuState {
  switch (action.type) {
    case 'SET_SECTION':
      return {
        ...state,
        activeSection: action.section,
        m1Open: action.section !== null,
        m2Open: false,
        m2View: null,
        selectedEntityId: null,
      }

    case 'TOGGLE_SECTION':
      // Same section only toggles closed while the panel is visibly open — on
      // mobile the URL sync closes the drawer while keeping activeSection, so
      // the next tap must re-open rather than no-op.
      if (state.activeSection === action.section && state.m1Open) {
        return { ...state, activeSection: null, m1Open: false, m2Open: false, m2View: null }
      }
      return {
        ...state,
        activeSection: action.section,
        m1Open: true,
        m2Open: false,
        m2View: null,
        selectedEntityId: null,
      }

    case 'TOGGLE_M0':
      // Closing the rail also drops any drawer that was opened from it —
      // otherwise the M1 drawer would float with no rail beside it.
      if (state.m0Open) {
        return { ...state, m0Open: false, activeSection: null, m1Open: false, m2Open: false, m2View: null }
      }
      return { ...state, m0Open: true }

    case 'CLOSE_M0':
      return { ...state, m0Open: false }

    case 'CLOSE_M1':
      return { ...state, activeSection: null, m1Open: false, m2Open: false, m2View: null }

    case 'OPEN_M2':
      return {
        ...state,
        m2Open: true,
        m2View: action.view,
        selectedEntityId: action.entityId !== undefined ? action.entityId : state.selectedEntityId,
      }

    case 'OPEN_M2_DRAWER':
      // Programmatic full open (rail + M1 + M2 in one shot) — used by mobile
      // in-page shortcuts like tapping a context URL to browse its tree,
      // where none of the layers are open yet. m0Open is a no-op on desktop.
      return {
        ...state,
        m0Open: true,
        activeSection: action.section,
        m1Open: true,
        m2Open: true,
        m2View: action.view,
        selectedEntityId: action.entityId,
      }

    case 'CLOSE_M2':
      return { ...state, m2Open: false, m2View: null }

    case 'SELECT_ENTITY':
      return { ...state, selectedEntityId: action.entityId }

    case 'SYNC_FROM_URL': {
      const unchanged =
        action.section === state.activeSection
        && action.entityId === state.selectedEntityId
        && action.m2View === state.m2View
      // On mobile the rail and menu are overlays, so any navigation (this
      // action only fires on pathname changes) closes them — even when it
      // lands on the same section, e.g. Settings → API tokens.
      if (unchanged && !(action.mobile && (state.m1Open || state.m0Open))) return state
      return {
        ...state,
        activeSection: action.section,
        m0Open: action.mobile ? false : state.m0Open,
        m1Open: action.mobile ? false : action.section !== null,
        selectedEntityId: action.entityId,
        m2Open: action.m2View !== null,
        m2View: action.m2View,
      }
    }

    case 'SET_USER':
      return { ...state, user: action.user }

    default:
      return state
  }
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

export function useMenuUrlSync(_state: MenuState, dispatch: Dispatch<MenuAction>) {
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


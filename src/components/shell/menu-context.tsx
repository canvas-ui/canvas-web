import { useReducer, useCallback, useEffect, type ReactNode } from 'react'
import { getCurrentUserFromToken } from '@/services/auth'
import {
  MenuContext,
  useMenuUrlSync,
  type MenuAction,
  type MenuContextValue,
  type MenuSection,
  type MenuState,
  type M2View,
} from './use-menu'

// ─── Reducer ─────────────────────────────────────────────────────────────────

const initialState: MenuState = {
  activeSection: null,
  m0Open: false,
  m1Open: false,
  m2Open: false,
  m2View: null,
  selectedEntityId: null,
  user: null,
}

function menuReducer(state: MenuState, action: MenuAction): MenuState {
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

// ─── Provider ────────────────────────────────────────────────────────────────

export function MenuProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(menuReducer, initialState)
  useMenuUrlSync(state, dispatch)

  // Load user on mount
  useEffect(() => {
    const user = getCurrentUserFromToken()
    if (user) dispatch({ type: 'SET_USER', user })
  }, [])

  const setSection = useCallback((section: MenuSection) => {
    dispatch({ type: 'SET_SECTION', section })
  }, [])

  const toggleSection = useCallback((section: MenuSection) => {
    dispatch({ type: 'TOGGLE_SECTION', section })
  }, [])

  const toggleM0 = useCallback(() => {
    dispatch({ type: 'TOGGLE_M0' })
  }, [])

  const closeM0 = useCallback(() => {
    dispatch({ type: 'CLOSE_M0' })
  }, [])

  const closeM1 = useCallback(() => {
    dispatch({ type: 'CLOSE_M1' })
  }, [])

  const openM2 = useCallback((view: M2View, entityId?: string | null) => {
    dispatch({ type: 'OPEN_M2', view, entityId })
  }, [])

  const openM2Drawer = useCallback((section: MenuSection, view: M2View, entityId: string | null) => {
    dispatch({ type: 'OPEN_M2_DRAWER', section, view, entityId })
  }, [])

  const closeM2 = useCallback(() => {
    dispatch({ type: 'CLOSE_M2' })
  }, [])

  const selectEntity = useCallback((entityId: string | null) => {
    dispatch({ type: 'SELECT_ENTITY', entityId })
  }, [])

  const value: MenuContextValue = {
    state,
    dispatch,
    setSection,
    toggleSection,
    toggleM0,
    closeM0,
    closeM1,
    openM2,
    openM2Drawer,
    closeM2,
    selectEntity,
  }

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}

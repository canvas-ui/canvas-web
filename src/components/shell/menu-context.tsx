import { createContext, useContext, useReducer, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getCurrentUserFromToken } from '@/services/auth'

// ─── Types ───────────────────────────────────────────────────────────────────

export type MenuSection = 'contexts' | 'workspaces' | 'agents' | 'roles' | 'admin' | 'settings' | null
export type M2View = 'detail' | 'form' | 'chat' | 'settings' | null

export interface MenuState {
  activeSection: MenuSection
  m1Open: boolean
  m2Open: boolean
  m2View: M2View
  selectedEntityId: string | null
  user: { id: string; email: string; userType: string } | null
}

type MenuAction =
  | { type: 'SET_SECTION'; section: MenuSection }
  | { type: 'TOGGLE_SECTION'; section: MenuSection }
  | { type: 'CLOSE_M1' }
  | { type: 'OPEN_M2'; view: M2View; entityId?: string | null }
  | { type: 'CLOSE_M2' }
  | { type: 'SELECT_ENTITY'; entityId: string | null }
  | { type: 'SYNC_FROM_URL'; section: MenuSection; entityId: string | null; m2View: M2View }
  | { type: 'SET_USER'; user: MenuState['user'] }

interface MenuContextValue {
  state: MenuState
  dispatch: React.Dispatch<MenuAction>
  setSection: (section: MenuSection) => void
  toggleSection: (section: MenuSection) => void
  closeM1: () => void
  openM2: (view: M2View, entityId?: string | null) => void
  closeM2: () => void
  selectEntity: (entityId: string | null) => void
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

const initialState: MenuState = {
  activeSection: null,
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
      if (state.activeSection === action.section) {
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

    case 'CLOSE_M1':
      return { ...state, activeSection: null, m1Open: false, m2Open: false, m2View: null }

    case 'OPEN_M2':
      return {
        ...state,
        m2Open: true,
        m2View: action.view,
        selectedEntityId: action.entityId !== undefined ? action.entityId : state.selectedEntityId,
      }

    case 'CLOSE_M2':
      return { ...state, m2Open: false, m2View: null }

    case 'SELECT_ENTITY':
      return { ...state, selectedEntityId: action.entityId }

    case 'SYNC_FROM_URL': {
      if (
        action.section === state.activeSection
        && action.entityId === state.selectedEntityId
        && action.m2View === state.m2View
      ) {
        return state
      }
      return {
        ...state,
        activeSection: action.section,
        m1Open: action.section !== null,
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

const MenuContext = createContext<MenuContextValue | null>(null)

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('useMenu must be used within a MenuProvider')
  return ctx
}

// ─── URL Sync ────────────────────────────────────────────────────────────────

function sectionFromPath(pathname: string): { section: MenuSection; entityId: string | null; m2View: M2View } {
  const segments = pathname.split('/').filter(Boolean)
  const first = segments[0] || ''
  const second = segments[1] || null
  const third = segments[2] || null

  if (first === 'contexts') {
    return { section: 'contexts', entityId: second, m2View: third === 'settings' ? 'form' : second ? 'detail' : null }
  }
  if (first === 'workspaces') {
    return { section: 'workspaces', entityId: second, m2View: third === 'settings' ? null : second ? 'detail' : null }
  }
  if (first === 'agents') {
    return { section: 'agents', entityId: second, m2View: third === 'settings' ? 'settings' : second ? 'detail' : null }
  }
  if (first === 'admin') return { section: 'admin', entityId: null, m2View: null }
  if (first === 'api-tokens') return { section: 'settings', entityId: null, m2View: null }
  return { section: null, entityId: null, m2View: null }
}

function useMenuUrlSync(_state: MenuState, dispatch: React.Dispatch<MenuAction>) {
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
    dispatch({ type: 'SYNC_FROM_URL', section, entityId, m2View })
  }, [location.pathname, dispatch])

  // State → URL: navigate when entity selection changes from menu interaction
  const navigateToEntity = useCallback((path: string) => {
    isInternalNav.current = true
    navigate(path)
  }, [navigate])

  return { navigateToEntity }
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

  const closeM1 = useCallback(() => {
    dispatch({ type: 'CLOSE_M1' })
  }, [])

  const openM2 = useCallback((view: M2View, entityId?: string | null) => {
    dispatch({ type: 'OPEN_M2', view, entityId })
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
    closeM1,
    openM2,
    closeM2,
    selectEntity,
  }

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}

export { useMenuUrlSync, sectionFromPath }

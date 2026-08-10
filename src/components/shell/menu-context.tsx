import { useCallback, useEffect, useReducer, type ReactNode } from 'react'
import { getCurrentUserFromToken } from '@/services/auth'
import { MenuContext, initialState, menuReducer, useMenuUrlSync, type MenuContextValue, type MenuSection, type M2View } from './menu-context-data'

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

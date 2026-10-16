import { useReducer, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate, type To } from 'react-router-dom'
import { getCurrentUser, getCurrentUserFromToken } from '@/services/auth'
import {
  MenuContext,
  useMenuUrlSync,
  isMobileNavigation,
  sectionFromPath,
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
    case 'RESTORE_MENU':
      return { ...state, ...action.menu, user: state.user }
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

    case 'OPEN_M1_DRAWER':
      // Programmatic rail + M1 open with no M2 — the mobile "back to the menu
      // I came from" step for sections whose M1 list has no entity (settings).
      return {
        ...state,
        m0Open: true,
        activeSection: action.section,
        m1Open: true,
        m2Open: false,
        m2View: null,
        selectedEntityId: null,
      }

    case 'CLOSE_M2':
      return { ...state, m2Open: false, m2View: null }

    case 'SELECT_ENTITY':
      return { ...state, selectedEntityId: action.entityId }

    case 'SYNC_FROM_URL': {
      // Moving between items in the current content area changes the URL, but
      // must not undo an explicit close of its tree. A new section/entity or
      // an explicit OPEN_M2 still opens the appropriate M2 view.
      const keepM2Closed = !action.mobile
        && !state.m2Open
        && state.m2View === null
        && action.section === state.activeSection
        && action.entityId === state.selectedEntityId
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
        m2Open: !keepM2Closed && action.m2View !== null,
        m2View: keepM2Closed ? null : action.m2View,
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
  const location = useLocation()
  const navigate = useNavigate()
  const stateRef = useRef(state)
  useLayoutEffect(() => { stateRef.current = state }, [state])
  useMenuUrlSync(state, dispatch)

  const changeMenu = useCallback((action: MenuAction, replace = false, backwards = false) => {
    const next = menuReducer(stateRef.current, action)
    stateRef.current = next
    dispatch(action)
    if (!isMobileNavigation()) return
    const { activeSection, m0Open, m1Open, m2Open, m2View, selectedEntityId } = next
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
      replace,
      state: {
        ...location.state,
        canvasMenu: { activeSection, m0Open, m1Open, m2Open, m2View, selectedEntityId },
        canvasMenuBack: backwards,
      },
    })
  }, [location, navigate])

  const navigateFromMenu = useCallback((to: To) => {
    // The tree is the previous view of this very path. Updating its history
    // entry before opening the content also restores the selected tree/path
    // after refresh, Back, or Forward, without putting menu UI in the URL.
    if (isMobileNavigation() && stateRef.current.m1Open) {
      const { activeSection, m0Open, m1Open, m2Open, m2View, selectedEntityId } = stateRef.current
      navigate(to, { replace: true, state: { ...location.state,
        canvasMenu: { activeSection, m0Open, m1Open, m2Open, m2View, selectedEntityId }, canvasMenuBack: false,
      } })
    }
    navigate(to)
  }, [location.state, navigate])

  const goBack = useCallback(() => {
    // React Router starts an app history at index 0. Never send a fresh deep
    // link out of Canvas; give it the same menu ancestors as a normal visit.
    if (window.history.state?.idx > 0) { navigate(-1); return }
    const current = stateRef.current
    if (current.m1Open && current.m2Open) changeMenu({ type: 'CLOSE_M2' }, true, true)
    else if (current.m1Open) changeMenu({ type: 'CLOSE_M1' }, true, true)
    else if (current.m0Open) changeMenu({ type: 'CLOSE_M0' }, true, true)
    else {
      const { section, entityId, m2View } = sectionFromPath(location.pathname)
      if (!isMobileNavigation()) { navigate(section ? `/${section}` : '/'); return }
      if (section && entityId) changeMenu({ type: 'OPEN_M2_DRAWER', section, view: m2View, entityId }, true, true)
      else changeMenu({ type: 'TOGGLE_M0' }, true, true)
    }
  }, [changeMenu, location.pathname, navigate])

  // Load user on mount
  useEffect(() => {
    const user = getCurrentUserFromToken()
    if (user) {
      dispatch({ type: 'SET_USER', user })
      return
    }
    // API tokens have no embedded identity. Resolve it without blocking the
    // shell; an offline failure must not prevent access to cached content.
    let cancelled = false
    void getCurrentUser().then(profile => {
      if (!cancelled && profile) dispatch({ type: 'SET_USER', user: profile })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const setSection = useCallback((section: MenuSection) => {
    changeMenu({ type: 'SET_SECTION', section })
  }, [changeMenu])

  const toggleSection = useCallback((section: MenuSection) => {
    changeMenu({ type: 'TOGGLE_SECTION', section })
  }, [changeMenu])

  const toggleM0 = useCallback(() => {
    changeMenu({ type: 'TOGGLE_M0' }, stateRef.current.m0Open)
  }, [changeMenu])

  const closeM0 = useCallback(() => {
    changeMenu({ type: 'CLOSE_M0' }, true)
  }, [changeMenu])

  const closeM1 = useCallback(() => {
    changeMenu({ type: 'CLOSE_M1' }, true)
  }, [changeMenu])

  const openM2 = useCallback((view: M2View, entityId?: string | null) => {
    changeMenu({ type: 'OPEN_M2', view, entityId })
  }, [changeMenu])

  const openM2Drawer = useCallback((section: MenuSection, view: M2View, entityId: string | null) => {
    changeMenu({ type: 'OPEN_M2_DRAWER', section, view, entityId })
  }, [changeMenu])

  const openM1Drawer = useCallback((section: MenuSection) => {
    changeMenu({ type: 'OPEN_M1_DRAWER', section })
  }, [changeMenu])

  const closeM2 = useCallback(() => {
    if (isMobileNavigation() && stateRef.current.m1Open && stateRef.current.m2Open) goBack()
    else dispatch({ type: 'CLOSE_M2' })
  }, [goBack])

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
    openM1Drawer,
    closeM2,
    selectEntity,
    goBack,
    navigateFromMenu,
  }

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}

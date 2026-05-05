import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { ToolboxFilters, ToolboxTimelineFilters } from '@/types/workspace'
import { DEFAULT_TOOLBOX_FILTERS } from '@/types/workspace'
import { listWorkspaceBitmaps, deleteWorkspaceBitmap, getWorkspaceTreeByName } from '@/services/workspace'
import type { TreeNode } from '@/types/workspace'
import { getCanvas, updateCanvas } from '@/services/canvas'
import { getContext, patchContext } from '@/services/context'
import { parseWorkspacePathFromUrl } from '@/utils/url-params'

// ─── Public types ─────────────────────────────────────────────────────────────

export type T1View = 'home' | 'tools' | 'agents' | null
export type ToolsTab = 'timeline' | 'features'
export type ActiveContextType = 'canvas' | 'context' | null

export interface ToolboxState {
  t1Open: boolean
  t1View: T1View
  toolsTab: ToolsTab
  // T2 — agent chat overlay
  t2Open: boolean
  t2AgentId: string | null
  // Navigation-derived
  activeContextPath: string | null
  activeContextType: ActiveContextType
  activeWorkspaceName: string | null
  activeCanvasId: string | null
  activeContextId: string | null
  // Filters
  filters: ToolboxFilters
  savedFilters: ToolboxFilters | null
  isDirty: boolean
  isSaving: boolean
  // Bitmaps
  availableBitmaps: string[]
  bitmapsLoading: boolean
}

// ─── Actions ──────────────────────────────────────────────────────────────────

type ToolboxAction =
  | { type: 'SET_VIEW'; view: T1View }
  | { type: 'TOGGLE_VIEW'; view: T1View }
  | { type: 'CLOSE_T1' }
  | { type: 'OPEN_T2_AGENT'; agentId: string }
  | { type: 'CLOSE_T2' }
  | { type: 'SET_TOOLS_TAB'; tab: ToolsTab }
  | {
      type: 'SET_NAVIGATION'
      workspaceName: string | null
      canvasId: string | null
      contextId: string | null
      contextType: ActiveContextType
      contextPath: string | null
    }
  | { type: 'SET_FILTERS'; filters: ToolboxFilters }
  | { type: 'SET_SAVED_FILTERS'; savedFilters: ToolboxFilters | null }
  | { type: 'SET_SAVING'; isSaving: boolean }
  | { type: 'SET_BITMAPS'; keys: string[] }
  | { type: 'SET_BITMAPS_LOADING'; loading: boolean }

// ─── Reducer ──────────────────────────────────────────────────────────────────

function isDirtyCheck(filters: ToolboxFilters, savedFilters: ToolboxFilters | null): boolean {
  return JSON.stringify(filters) !== JSON.stringify(savedFilters ?? DEFAULT_TOOLBOX_FILTERS)
}

const initialState: ToolboxState = {
  t1Open: false,
  t1View: null,
  toolsTab: 'timeline',
  t2Open: false,
  t2AgentId: null,
  activeContextPath: null,
  activeContextType: null,
  activeWorkspaceName: null,
  activeCanvasId: null,
  activeContextId: null,
  filters: DEFAULT_TOOLBOX_FILTERS,
  savedFilters: null,
  isDirty: false,
  isSaving: false,
  availableBitmaps: [],
  bitmapsLoading: false,
}

function toolboxReducer(state: ToolboxState, action: ToolboxAction): ToolboxState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, t1Open: action.view !== null, t1View: action.view }
    case 'TOGGLE_VIEW':
      if (state.t1View === action.view) return { ...state, t1Open: false, t1View: null }
      return { ...state, t1Open: true, t1View: action.view }
    case 'CLOSE_T1':
      return { ...state, t1Open: false, t1View: null, t2Open: false, t2AgentId: null }
    case 'OPEN_T2_AGENT':
      return { ...state, t2Open: true, t2AgentId: action.agentId }
    case 'CLOSE_T2':
      return { ...state, t2Open: false, t2AgentId: null }
    case 'SET_TOOLS_TAB':
      return { ...state, toolsTab: action.tab }
    case 'SET_NAVIGATION':
      return {
        ...state,
        activeWorkspaceName: action.workspaceName,
        activeCanvasId: action.canvasId,
        activeContextId: action.contextId,
        activeContextType: action.contextType,
        activeContextPath: action.contextPath,
      }
    case 'SET_FILTERS':
      return {
        ...state,
        filters: action.filters,
        isDirty: state.activeContextType !== null
          ? isDirtyCheck(action.filters, state.savedFilters)
          : false,
      }
    case 'SET_SAVED_FILTERS':
      return {
        ...state,
        savedFilters: action.savedFilters,
        filters: action.savedFilters ?? DEFAULT_TOOLBOX_FILTERS,
        isDirty: false,
      }
    case 'SET_SAVING':
      return { ...state, isSaving: action.isSaving }
    case 'SET_BITMAPS':
      return { ...state, availableBitmaps: action.keys, bitmapsLoading: false }
    case 'SET_BITMAPS_LOADING':
      return { ...state, bitmapsLoading: action.loading }
    default:
      return state
  }
}

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = 'toolbox:session:filters'

function loadSessionFilters(): ToolboxFilters | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as ToolboxFilters) : null
  } catch {
    return null
  }
}

function saveSessionFilters(filters: ToolboxFilters) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(filters))
  } catch {
    // ignore
  }
}

// ─── Extract toolbox filters from opaque metadata blob ────────────────────────

function extractToolboxFilters(metadata: Record<string, unknown> | undefined): ToolboxFilters | null {
  if (!metadata?.toolbox) return null
  try {
    const t = metadata.toolbox as Partial<ToolboxFilters>
    return {
      features: {
        allOf: (t.features as ToolboxFilters['features'])?.allOf ?? [],
        anyOf: (t.features as ToolboxFilters['features'])?.anyOf ?? [],
        noneOf: (t.features as ToolboxFilters['features'])?.noneOf ?? [],
      },
      timeline: {
        quickFilter: (t.timeline as ToolboxTimelineFilters)?.quickFilter ?? null,
        indexCreated: (t.timeline as ToolboxTimelineFilters)?.indexCreated ?? true,
        indexUpdated: (t.timeline as ToolboxTimelineFilters)?.indexUpdated ?? true,
        indexDeleted: (t.timeline as ToolboxTimelineFilters)?.indexDeleted ?? false,
        searchContent: (t.timeline as ToolboxTimelineFilters)?.searchContent ?? false,
      },
    }
  } catch {
    return null
  }
}

// ─── Context value ────────────────────────────────────────────────────────────

interface ToolboxContextValue {
  state: ToolboxState
  setView: (view: T1View) => void
  toggleView: (view: T1View) => void
  closeT1: () => void
  openAgentT2: (agentId: string) => void
  closeT2: () => void
  setToolsTab: (tab: ToolsTab) => void
  setFilters: (filters: ToolboxFilters) => void
  setFeatureToggle: (key: string, on: boolean) => void
  setTimelineFilter: (update: Partial<ToolboxTimelineFilters>) => void
  saveFilters: () => Promise<void>
  deleteBitmap: (key: string) => Promise<void>
}

const ToolboxCtx = createContext<ToolboxContextValue | null>(null)

export function useToolbox(): ToolboxContextValue {
  const ctx = useContext(ToolboxCtx)
  if (!ctx) throw new Error('useToolbox must be used within a ToolboxProvider')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToolboxProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toolboxReducer, initialState)
  const location = useLocation()
  const stateRef = useRef(state)
  stateRef.current = state

  // ── URL → navigation state ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    const pathParts = location.pathname.split('/').filter(Boolean)

    const newWorkspaceName = pathParts[0] === 'workspaces' ? (pathParts[1] || null) : null
    const newContextId = pathParts[0] === 'contexts' ? (pathParts[1] || null) : null
    const { path: wsPath, treeName: wsTreeName } = newWorkspaceName
      ? parseWorkspacePathFromUrl(location.pathname)
      : { path: '/', treeName: '' }

    const dispatchNav = (canvasId: string | null) => {
      if (cancelled) return
      const contextType: ActiveContextType = canvasId ? 'canvas' : newContextId ? 'context' : null
      const prev = stateRef.current
      const leavingCanvasContext = prev.activeContextType !== null && contextType === null
      if (leavingCanvasContext) saveSessionFilters(prev.filters)

      dispatch({
        type: 'SET_NAVIGATION',
        workspaceName: newWorkspaceName,
        canvasId,
        contextId: newContextId,
        contextType,
        contextPath: newWorkspaceName ? wsPath : null,
      })
    }

    // Walk the loaded tree to find the leaf node; tree already carries layer
    // type, no extra GET needed. Path is the URL truth; canvas hint is derived.
    if (newWorkspaceName && wsPath !== '/') {
      getWorkspaceTreeByName(newWorkspaceName, wsTreeName)
        .then(res => {
          if (cancelled) return
          const segments = wsPath.split('/').filter(Boolean)
          let node: TreeNode | null = res.payload
          for (const seg of segments) {
            node = node?.children?.find(c => c.name === seg) ?? null
            if (!node) break
          }
          dispatchNav(node?.type === 'canvas' ? node.id : null)
        })
        .catch(() => dispatchNav(null))
      return () => { cancelled = true }
    }
    dispatchNav(null)
    return () => { cancelled = true }
  }, [location.pathname])

  // ── Load bitmaps when workspace changes ───────────────────────────────────

  useEffect(() => {
    const wn = state.activeWorkspaceName
    if (!wn) return
    dispatch({ type: 'SET_BITMAPS_LOADING', loading: true })
    listWorkspaceBitmaps(wn).then(keys => {
      dispatch({ type: 'SET_BITMAPS', keys })
    })
  }, [state.activeWorkspaceName])

  // ── Load filters when canvas/context/session changes ──────────────────────

  useEffect(() => {
    const { activeContextType, activeCanvasId, activeContextId, activeWorkspaceName } = state

    if (activeContextType === 'canvas' && activeCanvasId && activeWorkspaceName) {
      getCanvas(activeWorkspaceName, activeCanvasId).then(canvas => {
        const saved = extractToolboxFilters(canvas.metadata)
        dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: saved })
      }).catch(() => {
        dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: null })
      })
    } else if (activeContextType === 'context' && activeContextId) {
      getContext(activeContextId).then(ctx => {
        const metadata = (ctx as Context & { metadata?: Record<string, unknown> }).metadata
        const saved = extractToolboxFilters(metadata)
        dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: saved })
      }).catch(() => {
        dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: null })
      })
    } else {
      // Regular layer — restore session filters
      const session = loadSessionFilters()
      dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: session })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeCanvasId, state.activeContextId, state.activeContextType])

  // ── Auto-save session filters when not in canvas/context mode ────────────

  useEffect(() => {
    if (state.activeContextType === null) {
      saveSessionFilters(state.filters)
    }
  }, [state.filters, state.activeContextType])

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const setView = useCallback((view: T1View) => dispatch({ type: 'SET_VIEW', view }), [])
  const toggleView = useCallback((view: T1View) => dispatch({ type: 'TOGGLE_VIEW', view }), [])
  const closeT1 = useCallback(() => dispatch({ type: 'CLOSE_T1' }), [])
  const openAgentT2 = useCallback((agentId: string) => dispatch({ type: 'OPEN_T2_AGENT', agentId }), [])
  const closeT2 = useCallback(() => dispatch({ type: 'CLOSE_T2' }), [])
  const setToolsTab = useCallback((tab: ToolsTab) => dispatch({ type: 'SET_TOOLS_TAB', tab }), [])

  const setFilters = useCallback((filters: ToolboxFilters) => {
    dispatch({ type: 'SET_FILTERS', filters })
  }, [])

  const setFeatureToggle = useCallback((key: string, on: boolean) => {
    const { filters } = stateRef.current
    const allOf = on
      ? [...new Set([...filters.features.allOf, key])]
      : filters.features.allOf.filter(k => k !== key)
    const anyOf = filters.features.anyOf.filter(k => k !== key)
    const noneOf = filters.features.noneOf.filter(k => k !== key)
    dispatch({
      type: 'SET_FILTERS',
      filters: { ...filters, features: { allOf, anyOf, noneOf } },
    })
  }, [])

  const setTimelineFilter = useCallback((update: Partial<ToolboxTimelineFilters>) => {
    const { filters } = stateRef.current
    dispatch({
      type: 'SET_FILTERS',
      filters: { ...filters, timeline: { ...filters.timeline, ...update } },
    })
  }, [])

  const saveFilters = useCallback(async () => {
    const { activeContextType, activeCanvasId, activeContextId, activeWorkspaceName, filters, isSaving } = stateRef.current
    if (isSaving) return
    dispatch({ type: 'SET_SAVING', isSaving: true })
    try {
      if (activeContextType === 'canvas' && activeCanvasId && activeWorkspaceName) {
        const canvas = await getCanvas(activeWorkspaceName, activeCanvasId)
        await updateCanvas(activeWorkspaceName, activeCanvasId, {
          metadata: { ...canvas.metadata, toolbox: filters },
        })
      } else if (activeContextType === 'context' && activeContextId) {
        const ctx = await getContext(activeContextId)
        const existingMeta = (ctx as Context & { metadata?: Record<string, unknown> }).metadata || {}
        await patchContext(activeContextId, {
          metadata: { ...existingMeta, toolbox: filters },
        })
      }
      dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: filters })
    } finally {
      dispatch({ type: 'SET_SAVING', isSaving: false })
    }
  }, [])

  const deleteBitmap = useCallback(async (key: string) => {
    const wn = stateRef.current.activeWorkspaceName
    if (!wn) throw new Error('No active workspace')
    await deleteWorkspaceBitmap(wn, key)
    const remaining = stateRef.current.availableBitmaps.filter(k => k !== key)
    dispatch({ type: 'SET_BITMAPS', keys: remaining })
    // Strip from active filters if present
    const f = stateRef.current.filters
    const stripped: ToolboxFilters = {
      ...f,
      features: {
        allOf: f.features.allOf.filter(k => k !== key),
        anyOf: f.features.anyOf.filter(k => k !== key),
        noneOf: f.features.noneOf.filter(k => k !== key),
      },
    }
    if (JSON.stringify(stripped.features) !== JSON.stringify(f.features)) {
      dispatch({ type: 'SET_FILTERS', filters: stripped })
    }
  }, [])

  return (
    <ToolboxCtx.Provider
      value={{ state, setView, toggleView, closeT1, openAgentT2, closeT2, setToolsTab, setFilters, setFeatureToggle, setTimelineFilter, saveFilters, deleteBitmap }}
    >
      {children}
    </ToolboxCtx.Provider>
  )
}

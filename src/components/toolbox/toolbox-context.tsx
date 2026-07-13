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
import type { ToolboxFilters, ToolboxTimelineFilters, ToolboxSort, Document as WorkspaceDocument } from '@/types/workspace'
import { DEFAULT_TOOLBOX_FILTERS, DEFAULT_TOOLBOX_SORT, buildDatetimeFilters } from '@/types/workspace'
import {
  DEFAULT_WORKSPACE_TREE_NAME,
  listWorkspaceBitmaps,
  deleteWorkspaceBitmap,
  listWorkspaceTimelines,
  createWorkspaceTimeline,
  deleteWorkspaceTimeline,
  getCachedWorkspaceTreeByName,
  invalidateWorkspaceTreeCache,
  updateWorkspacePath,
} from '@/services/workspace'
import type { TreeNode } from '@/types/workspace'
import { getContext, patchContext } from '@/services/context'
import { parseWorkspacePathFromUrl } from '@/utils/url-params'

// ─── Public types ─────────────────────────────────────────────────────────────

export type T1View = 'home' | 'tools' | 'agents' | null
export type ToolsTab = 'timeline' | 'features'
// Maps directly to synapsd feature sigil algebra: anyOf (OR), allOf (+ gate), noneOf (! exclude).
export type FeatureMode = 'off' | 'anyOf' | 'allOf' | 'noneOf'
export type ActiveContextType = 'canvas' | 'context' | null
export type AddKind = 'note' | 'link' | 'todo' | 'file' | 'photo' | 'existing' | 'folder'
export type { WorkspaceDocument }

export interface ToolboxState {
  t1Open: boolean
  t1View: T1View
  toolsTab: ToolsTab
  // T2 — agent chat overlay
  t2Open: boolean
  t2AgentId: string | null
  // Add panel — slim creation section next to main content
  addOpen: boolean
  addKind: AddKind | null
  // Edit mode — document being edited in the add panel
  editDocument: WorkspaceDocument | null
  editWorkspaceId: string | null
  // Navigation-derived
  activeContextPath: string | null
  activeContextType: ActiveContextType
  activeWorkspaceName: string | null
  activeTreeName: string | null
  activeCanvasId: string | null
  activeContextId: string | null
  // Filters
  filters: ToolboxFilters
  savedFilters: ToolboxFilters | null
  savedSearchQuery: string | null
  isDirty: boolean
  isSaving: boolean
  // Bitmaps
  availableBitmaps: string[]
  bitmapsLoading: boolean
  // Timelines
  availableTimelines: string[]
  timelinesLoading: boolean
}

// ─── Actions ──────────────────────────────────────────────────────────────────

type ToolboxAction =
  | { type: 'SET_VIEW'; view: T1View }
  | { type: 'TOGGLE_VIEW'; view: T1View }
  | { type: 'CLOSE_T1' }
  | { type: 'OPEN_T2_AGENT'; agentId: string }
  | { type: 'CLOSE_T2' }
  | { type: 'OPEN_ADD'; kind: AddKind | null }
  | { type: 'CLOSE_ADD' }
  | { type: 'OPEN_EDIT'; document: WorkspaceDocument; workspaceId: string }
  | { type: 'SET_TOOLS_TAB'; tab: ToolsTab }
  | {
      type: 'SET_NAVIGATION'
      workspaceName: string | null
      treeName: string | null
      canvasId: string | null
      contextId: string | null
      contextType: ActiveContextType
      contextPath: string | null
    }
  | { type: 'SET_FILTERS'; filters: ToolboxFilters }
  | { type: 'SET_SAVED_FILTERS'; savedFilters: ToolboxFilters | null; savedSearchQuery?: string | null }
  | { type: 'SET_SAVING'; isSaving: boolean }
  | { type: 'SET_BITMAPS'; keys: string[] }
  | { type: 'SET_BITMAPS_LOADING'; loading: boolean }
  | { type: 'SET_TIMELINES'; names: string[] }
  | { type: 'SET_TIMELINES_LOADING'; loading: boolean }

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
  addOpen: false,
  addKind: null,
  editDocument: null,
  editWorkspaceId: null,
  activeContextPath: null,
  activeContextType: null,
  activeWorkspaceName: null,
  activeTreeName: null,
  activeCanvasId: null,
  activeContextId: null,
  filters: DEFAULT_TOOLBOX_FILTERS,
  savedFilters: null,
  savedSearchQuery: null,
  isDirty: false,
  isSaving: false,
  availableBitmaps: [],
  bitmapsLoading: false,
  availableTimelines: [],
  timelinesLoading: false,
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
    case 'OPEN_ADD':
      return { ...state, addOpen: true, addKind: action.kind, editDocument: null, editWorkspaceId: null }
    case 'CLOSE_ADD':
      return { ...state, addOpen: false, addKind: null, editDocument: null, editWorkspaceId: null }
    case 'OPEN_EDIT':
      return { ...state, addOpen: true, addKind: null, editDocument: action.document, editWorkspaceId: action.workspaceId }
    case 'SET_TOOLS_TAB':
      return { ...state, toolsTab: action.tab }
    case 'SET_NAVIGATION':
      return {
        ...state,
        activeWorkspaceName: action.workspaceName,
        activeTreeName: action.treeName,
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
        savedSearchQuery: action.savedSearchQuery ?? null,
        filters: action.savedFilters ?? DEFAULT_TOOLBOX_FILTERS,
        isDirty: false,
      }
    case 'SET_SAVING':
      return { ...state, isSaving: action.isSaving }
    case 'SET_BITMAPS':
      return { ...state, availableBitmaps: action.keys, bitmapsLoading: false }
    case 'SET_BITMAPS_LOADING':
      return { ...state, bitmapsLoading: action.loading }
    case 'SET_TIMELINES':
      return { ...state, availableTimelines: action.names, timelinesLoading: false }
    case 'SET_TIMELINES_LOADING':
      return { ...state, timelinesLoading: action.loading }
    default:
      return state
  }
}

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = 'toolbox:session:filters'

function loadSessionFilters(): ToolboxFilters | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    // Merge over the defaults so a blob persisted before a field existed (e.g.
    // `sort`, added later) can't leave `filters.sort` undefined and crash
    // consumers that read `filters.sort.sortBy`.
    const parsed = JSON.parse(raw) as Partial<ToolboxFilters>
    return {
      ...DEFAULT_TOOLBOX_FILTERS,
      ...parsed,
      features: { ...DEFAULT_TOOLBOX_FILTERS.features, ...(parsed.features ?? {}) },
      timeline: { ...DEFAULT_TOOLBOX_FILTERS.timeline, ...(parsed.timeline ?? {}) },
      sort: { ...DEFAULT_TOOLBOX_SORT, ...(parsed.sort ?? {}) },
    }
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
        customRange: (t.timeline as ToolboxTimelineFilters)?.customRange ?? null,
        indexCreated: (t.timeline as ToolboxTimelineFilters)?.indexCreated ?? true,
        indexUpdated: (t.timeline as ToolboxTimelineFilters)?.indexUpdated ?? true,
        indexDeleted: (t.timeline as ToolboxTimelineFilters)?.indexDeleted ?? false,
        contentEvents: (t.timeline as ToolboxTimelineFilters)?.contentEvents ?? false,
        selectedTimelines: (t.timeline as ToolboxTimelineFilters)?.selectedTimelines ?? [],
      },
      sort: {
        sortBy: (t.sort as ToolboxSort)?.sortBy ?? DEFAULT_TOOLBOX_SORT.sortBy,
        order: (t.sort as ToolboxSort)?.order === 'asc' ? 'asc' : 'desc',
      },
    }
  } catch {
    return null
  }
}

function findTreeNode(root: TreeNode, path: string): TreeNode | null {
  let node: TreeNode | null = root
  for (const segment of path.split('/').filter(Boolean)) {
    node = node?.children?.find(child => child.name === segment) ?? null
    if (!node) break
  }
  return node
}

// ─── Context value ────────────────────────────────────────────────────────────

interface ToolboxContextValue {
  state: ToolboxState
  setView: (view: T1View) => void
  toggleView: (view: T1View) => void
  closeT1: () => void
  openAgentT2: (agentId: string) => void
  closeT2: () => void
  openAdd: (kind: AddKind) => void
  openAddPicker: () => void
  closeAdd: () => void
  openEdit: (document: WorkspaceDocument, workspaceId: string) => void
  setToolsTab: (tab: ToolsTab) => void
  setFilters: (filters: ToolboxFilters) => void
  setFeatureToggle: (key: string, on: boolean) => void
  setFeatureMode: (key: string, mode: FeatureMode) => void
  clearFilters: () => void
  hasActiveFilters: boolean
  setTimelineFilter: (update: Partial<ToolboxTimelineFilters>) => void
  setSort: (sort: ToolboxSort) => void
  saveFilters: () => Promise<void>
  deleteBitmap: (key: string) => Promise<void>
  createTimeline: (name: string) => Promise<void>
  deleteTimeline: (name: string) => Promise<void>
  refreshTimelines: () => void
}

const ToolboxCtx = createContext<ToolboxContextValue | null>(null)

export function useToolbox(): ToolboxContextValue {
  const ctx = useContext(ToolboxCtx)
  if (!ctx) throw new Error('useToolbox must be used within a ToolboxProvider')
  return ctx
}

// For components that also render outside the app shell (public shares):
// null instead of throwing when no provider is mounted.
export function useToolboxOptional(): ToolboxContextValue | null {
  return useContext(ToolboxCtx)
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
        treeName: newWorkspaceName ? wsTreeName : null,
        canvasId,
        contextId: newContextId,
        contextType,
        contextPath: newWorkspaceName ? wsPath : null,
      })
    }

    // Walk the loaded tree to find the leaf node; tree already carries layer
    // type, no extra GET needed. Path is the URL truth; canvas hint is derived.
    if (newWorkspaceName && wsPath !== '/') {
      getCachedWorkspaceTreeByName(newWorkspaceName, wsTreeName)
        .then(res => {
          if (cancelled) return
          const node = findTreeNode(res.payload, wsPath)
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

  // ── Load timelines when workspace changes ─────────────────────────────────

  useEffect(() => {
    const wn = state.activeWorkspaceName
    if (!wn) return
    dispatch({ type: 'SET_TIMELINES_LOADING', loading: true })
    listWorkspaceTimelines(wn).then(names => {
      dispatch({ type: 'SET_TIMELINES', names })
    })
  }, [state.activeWorkspaceName])

  // ── Load filters when canvas/context/session changes ──────────────────────

  useEffect(() => {
    const { activeContextType, activeCanvasId, activeContextId, activeWorkspaceName, activeTreeName, activeContextPath } = state

    if (activeContextType === 'canvas' && activeCanvasId && activeWorkspaceName && activeContextPath) {
      getCachedWorkspaceTreeByName(activeWorkspaceName, activeTreeName || DEFAULT_WORKSPACE_TREE_NAME).then(res => {
        const node = findTreeNode(res.payload, activeContextPath)
        const saved = extractToolboxFilters(node?.metadata)
        dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: saved, savedSearchQuery: node?.querySpec?.query ?? null })
      }).catch(() => {
        dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: null, savedSearchQuery: null })
      })
    } else if (activeContextType === 'context' && activeContextId) {
      getContext(activeContextId).then(ctx => {
        const metadata = (ctx as Context & { metadata?: Record<string, unknown> }).metadata
        const saved = extractToolboxFilters(metadata)
        dispatch({
          type: 'SET_SAVED_FILTERS',
          savedFilters: saved,
          savedSearchQuery: typeof metadata?.toolboxSearchQuery === 'string' ? metadata.toolboxSearchQuery : null,
        })
      }).catch(() => {
        dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: null, savedSearchQuery: null })
      })
    } else {
      // Regular layer — restore session filters
      const session = loadSessionFilters()
      dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: session, savedSearchQuery: null })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeCanvasId, state.activeContextId, state.activeContextPath, state.activeContextType, state.activeTreeName, state.activeWorkspaceName])

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
  const openAdd = useCallback((kind: AddKind) => dispatch({ type: 'OPEN_ADD', kind }), [])
  const openAddPicker = useCallback(() => dispatch({ type: 'OPEN_ADD', kind: null }), [])
  const closeAdd = useCallback(() => dispatch({ type: 'CLOSE_ADD' }), [])
  const openEdit = useCallback((document: WorkspaceDocument, workspaceId: string) => dispatch({ type: 'OPEN_EDIT', document, workspaceId }), [])
  const setToolsTab = useCallback((tab: ToolsTab) => dispatch({ type: 'SET_TOOLS_TAB', tab }), [])

  const setFilters = useCallback((filters: ToolboxFilters) => {
    dispatch({ type: 'SET_FILTERS', filters })
  }, [])

  const setFeatureToggle = useCallback((key: string, on: boolean) => {
    const { filters } = stateRef.current
    const isAbstraction = key.startsWith('data/abstraction/')
    const allOf = isAbstraction
      ? filters.features.allOf.filter(k => k !== key)
      : on
        ? [...new Set([...filters.features.allOf, key])]
        : filters.features.allOf.filter(k => k !== key)
    const anyOf = isAbstraction
      ? on
        ? [...new Set([...filters.features.anyOf, key])]
        : filters.features.anyOf.filter(k => k !== key)
      : filters.features.anyOf.filter(k => k !== key)
    const noneOf = filters.features.noneOf.filter(k => k !== key)
    dispatch({
      type: 'SET_FILTERS',
      filters: { ...filters, features: { allOf, anyOf, noneOf } },
    })
  }, [])

  // Explicit tri-state per feature bitmap, mirroring synapsd sigil algebra.
  const setFeatureMode = useCallback((key: string, mode: FeatureMode) => {
    const { filters } = stateRef.current
    const allOf = filters.features.allOf.filter(k => k !== key)
    const anyOf = filters.features.anyOf.filter(k => k !== key)
    const noneOf = filters.features.noneOf.filter(k => k !== key)
    if (mode === 'allOf') allOf.push(key)
    else if (mode === 'anyOf') anyOf.push(key)
    else if (mode === 'noneOf') noneOf.push(key)
    dispatch({ type: 'SET_FILTERS', filters: { ...filters, features: { allOf, anyOf, noneOf } } })
  }, [])

  const clearFilters = useCallback(() => {
    const { filters } = stateRef.current
    dispatch({ type: 'SET_FILTERS', filters: { ...DEFAULT_TOOLBOX_FILTERS, timeline: { ...filters.timeline, quickFilter: null, customRange: null, selectedTimelines: [] } } })
  }, [])

  const setSort = useCallback((sort: ToolboxSort) => {
    const { filters } = stateRef.current
    dispatch({ type: 'SET_FILTERS', filters: { ...filters, sort } })
  }, [])

  const setTimelineFilter = useCallback((update: Partial<ToolboxTimelineFilters>) => {
    const { filters } = stateRef.current
    dispatch({
      type: 'SET_FILTERS',
      filters: { ...filters, timeline: { ...filters.timeline, ...update } },
    })
  }, [])

  const saveFilters = useCallback(async () => {
    const { activeContextType, activeContextId, activeWorkspaceName, activeTreeName, activeContextPath, filters, isSaving } = stateRef.current
    if (isSaving) return
    dispatch({ type: 'SET_SAVING', isSaving: true })
    try {
      if (activeContextType === 'canvas' && activeWorkspaceName && activeContextPath) {
        const treeName = activeTreeName || DEFAULT_WORKSPACE_TREE_NAME
        const tree = await getCachedWorkspaceTreeByName(activeWorkspaceName, treeName)
        const node = findTreeNode(tree.payload, activeContextPath)
        const searchQuery = new URLSearchParams(location.search).get('q') || new URLSearchParams(location.search).get('search') || ''
        await updateWorkspacePath(activeWorkspaceName, activeContextPath, {
          metadata: { ...(node?.metadata || {}), toolbox: filters },
          querySpec: {
            features: filters.features,
            // Persist the timeline scope into the server-enforced querySpec (same
            // tokens the folder view lists with) so it scopes the WHOLE canvas —
            // widgets and public shares inherit it, not just this folder view.
            // metadata.toolbox above only round-trips the UI state.
            filters: buildDatetimeFilters(filters.timeline),
            query: searchQuery.trim() || undefined,
            // Saved view order → server-enforced, so public shares/widgets sort
            // the same way. Empty sortBy = DB default; store null then.
            sort: filters.sort?.sortBy ? filters.sort : null,
          },
        }, treeName)
        invalidateWorkspaceTreeCache(activeWorkspaceName, treeName)
      } else if (activeContextType === 'context' && activeContextId) {
        const ctx = await getContext(activeContextId)
        const existingMeta = (ctx as Context & { metadata?: Record<string, unknown> }).metadata || {}
        const searchQuery = new URLSearchParams(location.search).get('q') || new URLSearchParams(location.search).get('search') || ''
        await patchContext(activeContextId, {
          metadata: { ...existingMeta, toolbox: filters, toolboxSearchQuery: searchQuery.trim() || undefined },
        })
      }
      const searchQuery = new URLSearchParams(location.search).get('q') || new URLSearchParams(location.search).get('search') || ''
      dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: filters, savedSearchQuery: searchQuery.trim() || null })
    } finally {
      dispatch({ type: 'SET_SAVING', isSaving: false })
    }
  }, [location.search])

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

  const refreshTimelines = useCallback(() => {
    const wn = stateRef.current.activeWorkspaceName
    if (!wn) return
    dispatch({ type: 'SET_TIMELINES_LOADING', loading: true })
    listWorkspaceTimelines(wn).then(names => {
      dispatch({ type: 'SET_TIMELINES', names })
    })
  }, [])

  const createTimeline = useCallback(async (name: string) => {
    const wn = stateRef.current.activeWorkspaceName
    if (!wn) throw new Error('No active workspace')
    await createWorkspaceTimeline(wn, name)
    refreshTimelines()
  }, [refreshTimelines])

  const deleteTimeline = useCallback(async (name: string) => {
    const wn = stateRef.current.activeWorkspaceName
    if (!wn) throw new Error('No active workspace')
    await deleteWorkspaceTimeline(wn, name)
    const remaining = stateRef.current.availableTimelines.filter(n => n !== name)
    dispatch({ type: 'SET_TIMELINES', names: remaining })
    // Strip from selected if present
    const f = stateRef.current.filters
    const selectedTimelines = f.timeline.selectedTimelines.filter(n => n !== name)
    if (selectedTimelines.length !== f.timeline.selectedTimelines.length) {
      dispatch({ type: 'SET_FILTERS', filters: { ...f, timeline: { ...f.timeline, selectedTimelines } } })
    }
  }, [])

  const { features: f, timeline: tl } = state.filters
  const hasActiveFilters =
    f.allOf.length > 0 || f.anyOf.length > 0 || f.noneOf.length > 0 ||
    tl.quickFilter !== null || (tl.selectedTimelines?.length ?? 0) > 0

  return (
    <ToolboxCtx.Provider
      value={{ state, setView, toggleView, closeT1, openAgentT2, closeT2, openAdd, openAddPicker, closeAdd, openEdit, setToolsTab, setFilters, setFeatureToggle, setFeatureMode, clearFilters, hasActiveFilters, setTimelineFilter, setSort, saveFilters, deleteBitmap, createTimeline, deleteTimeline, refreshTimelines }}
    >
      {children}
    </ToolboxCtx.Provider>
  )
}

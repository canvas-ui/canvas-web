import {
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { ToolboxCtx } from './use-toolbox'
import type { ToolboxFilters, ToolboxTimelineFilters, ToolboxGeoFilters, ToolboxLensFilters, GeoBBox, GeoSelection, ToolboxSort, Document as WorkspaceDocument } from '@/types/workspace'
import { DEFAULT_TOOLBOX_FILTERS, DEFAULT_TOOLBOX_SORT, buildDatetimeFilters, buildGeoFilters } from '@/types/workspace'
import {
  DEFAULT_WORKSPACE_TREE_NAME,
  listWorkspaceBitmaps,
  deleteWorkspaceBitmap,
  deleteWorkspaceDataset,
  listWorkspaceTimelinesVerbose,
  createWorkspaceTimeline,
  deleteWorkspaceTimeline,
  getCachedWorkspaceTreeByName,
  invalidateWorkspaceTreeCache,
  updateWorkspacePath,
} from '@/services/workspace'
import type { TreeNode } from '@/types/workspace'
import { getContext, patchContext } from '@/services/context'
import { ABSTRACTION_PREFIX } from '@/lib/schema-meta'
import { parseWorkspacePathFromUrl } from '@/utils/url-params'

// ─── Public types ─────────────────────────────────────────────────────────────

export type T1View = 'home' | 'apps' | 'tools' | 'agents' | 'notifications' | null
export type ToolsTab = 'features' | 'timeline' | 'map' | 'lens'
// Maps directly to synapsd feature sigil algebra: anyOf (OR), allOf (+ gate), noneOf (! exclude).
export type FeatureMode = 'off' | 'anyOf' | 'allOf' | 'noneOf'
export type ActiveContextType = 'canvas' | 'context' | null
export type AddKind = 'note' | 'link' | 'todo' | 'identity' | 'file' | 'photo' | 'existing' | 'folder'
export type { WorkspaceDocument }

export interface ToolboxState {
  t1Open: boolean
  t1View: T1View
  toolsTab: ToolsTab
  // Applet open in the Apps tab, or null for its launcher grid. Toolbox-level
  // rather than AppsPanel-local so a closed toolbox can be re-opened straight
  // back into the running applet (the Lens widget does exactly that).
  appsAppletId: string | null
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
  // Accent color of the content being filtered (workspace/context color). Drives
  // the selected-tab underline so the toolbox visually ties to its content. Null
  // = no active content (e.g. a future global section) → falls back to black.
  activeAccentColor: string | null
  // Filters
  filters: ToolboxFilters
  // Map filter (ephemeral, client-side): the drawn area and the current result
  // set to plot on the map. The page publishes its fetched documents here; the
  // Map tab draws them as pins and refines them by `geoSelection` in the
  // browser — no re-fetch, not persisted. Cleared on navigation.
  geoSelection: GeoSelection | null
  mapDocuments: WorkspaceDocument[]
  // Workspace id/name the map documents belong to — needed to open a pin's
  // details (renderers fetch bytes per workspace).
  mapWorkspaceId: string | null
  savedFilters: ToolboxFilters | null
  savedSearchQuery: string | null
  isDirty: boolean
  isSaving: boolean
  // Bitmaps
  availableBitmaps: string[]
  bitmapsLoading: boolean
  // Timelines
  availableTimelines: string[]
  // Observed scale tiers per timeline (coarse→fine, informational — tiling is
  // adaptive: each entry/query tiles at its own notation-derived floor).
  timelineScales: Record<string, string[]>
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
  | { type: 'SET_APPS_APPLET'; appletId: string | null }
  | { type: 'SET_ACCENT_COLOR'; color: string | null }
  | { type: 'SET_GEO_SELECTION'; selection: GeoSelection | null }
  | { type: 'SET_MAP_DOCUMENTS'; documents: WorkspaceDocument[]; workspaceId: string | null }
  | {
      type: 'SET_NAVIGATION'
      workspaceName: string | null
      treeName: string | null
      canvasId: string | null
      contextId: string | null
      contextType: ActiveContextType
      contextPath: string | null
    }
  | { type: 'SET_CONTEXT_SCOPE'; workspaceName: string | null; contextPath: string | null; treeId: string | null }
  | { type: 'SET_FILTERS'; filters: ToolboxFilters }
  // `hydrating`: the saved view arrived from an async fetch. Edits made while
  // it was in flight are the user's latest intent — keep them, and only
  // re-baseline what "dirty" means. A save (not hydrating) replaces outright.
  | { type: 'SET_SAVED_FILTERS'; savedFilters: ToolboxFilters | null; savedSearchQuery?: string | null; hydrating?: boolean }
  | { type: 'SET_SAVING'; isSaving: boolean }
  | { type: 'SET_BITMAPS'; keys: string[] }
  | { type: 'SET_BITMAPS_LOADING'; loading: boolean }
  | { type: 'SET_TIMELINES'; names: string[]; scales?: Record<string, string[]> }
  | { type: 'SET_TIMELINES_LOADING'; loading: boolean }

// ─── Reducer ──────────────────────────────────────────────────────────────────

// Lens refine state is LIVE-FEED ephemera (device fix, camera kNN survivors) —
// it must never mark a view dirty nor be persisted into session storage or a
// canvas/context querySpec. Strip it before any compare/persist.
function stripEphemeral(filters: ToolboxFilters): ToolboxFilters {
  return { ...filters, lens: DEFAULT_TOOLBOX_FILTERS.lens }
}

function isDirtyCheck(filters: ToolboxFilters, savedFilters: ToolboxFilters | null): boolean {
  return JSON.stringify(stripEphemeral(filters)) !== JSON.stringify(stripEphemeral(savedFilters ?? DEFAULT_TOOLBOX_FILTERS))
}

const initialState: ToolboxState = {
  t1Open: false,
  t1View: null,
  toolsTab: 'features',
  appsAppletId: null,
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
  activeAccentColor: null,
  filters: DEFAULT_TOOLBOX_FILTERS,
  geoSelection: null,
  mapDocuments: [],
  mapWorkspaceId: null,
  savedFilters: null,
  savedSearchQuery: null,
  isDirty: false,
  isSaving: false,
  availableBitmaps: [],
  bitmapsLoading: false,
  availableTimelines: [],
  timelineScales: {},
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
    case 'SET_APPS_APPLET':
      return { ...state, appsAppletId: action.appletId }
    case 'SET_ACCENT_COLOR':
      return state.activeAccentColor === action.color ? state : { ...state, activeAccentColor: action.color }
    case 'SET_GEO_SELECTION':
      return { ...state, geoSelection: action.selection }
    case 'SET_MAP_DOCUMENTS':
      return (state.mapDocuments === action.documents && state.mapWorkspaceId === action.workspaceId)
        ? state
        : { ...state, mapDocuments: action.documents, mapWorkspaceId: action.workspaceId }
    case 'SET_NAVIGATION': {
      // A different canvas/context is a different saved view. Its filters
      // arrive from an async fetch (~2s on a slow front); until then the
      // toolbox must not keep showing — or fetching documents with, or
      // saving onto the new view — the PREVIOUS view's filters, and edits
      // made on the previous view do not carry over as "dirty" here.
      const sameView = state.activeContextType === action.contextType
        && state.activeContextId === action.contextId
        && state.activeCanvasId === action.canvasId
      return {
        ...state,
        activeWorkspaceName: action.workspaceName,
        activeTreeName: action.treeName,
        activeCanvasId: action.canvasId,
        activeContextId: action.contextId,
        activeContextType: action.contextType,
        activeContextPath: action.contextPath,
        // A drawn map area is view-specific — drop it when navigating away.
        geoSelection: null,
        ...(sameView ? {} : { filters: DEFAULT_TOOLBOX_FILTERS, savedFilters: null, savedSearchQuery: null, isDirty: false }),
      }
    }
    // A `/contexts/:id` route carries no workspace or tree path in its URL —
    // the context's own record carries both. Without this the workspace-scoped
    // lists (feature bitmaps, timelines) never load and the Features/Timeline
    // tabs render empty, hiding filters that are in fact active on the context;
    // and the timeline rail's density scopes to the workspace root instead of
    // the context's path. `activeTreeName` holds the context's tree ID here —
    // every consumer passes it as the API's `treeNameOrTreeId`, which resolves
    // either form.
    case 'SET_CONTEXT_SCOPE':
      if (state.activeContextType !== 'context') return state
      if (state.activeWorkspaceName === action.workspaceName
        && state.activeContextPath === action.contextPath
        && state.activeTreeName === action.treeId) return state
      return {
        ...state,
        activeWorkspaceName: action.workspaceName,
        activeContextPath: action.contextPath,
        activeTreeName: action.treeId,
      }
    case 'SET_FILTERS':
      return {
        ...state,
        filters: action.filters,
        isDirty: state.activeContextType !== null
          ? isDirtyCheck(action.filters, state.savedFilters)
          : false,
      }
    case 'SET_SAVED_FILTERS': {
      // A hydrate that lands after the user already changed something must
      // not undo that change — the toggle they just made is the newer intent.
      // Reproduced with ~1.5s request latency: toggle a feature right after
      // navigating into a context, and the context's saved (empty) view
      // arrived a moment later and silently switched it back off.
      const keepEdits = action.hydrating === true && state.isDirty
      const filters = keepEdits ? state.filters : (action.savedFilters ?? DEFAULT_TOOLBOX_FILTERS)
      return {
        ...state,
        savedFilters: action.savedFilters,
        savedSearchQuery: action.savedSearchQuery ?? null,
        filters,
        isDirty: keepEdits ? isDirtyCheck(filters, action.savedFilters) : false,
      }
    }
    case 'SET_SAVING':
      return { ...state, isSaving: action.isSaving }
    case 'SET_BITMAPS':
      return { ...state, availableBitmaps: action.keys, bitmapsLoading: false }
    case 'SET_BITMAPS_LOADING':
      return { ...state, bitmapsLoading: action.loading }
    case 'SET_TIMELINES':
      return {
        ...state,
        availableTimelines: action.names,
        timelineScales: action.scales ?? state.timelineScales,
        timelinesLoading: false,
      }
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
      geo: { ...DEFAULT_TOOLBOX_FILTERS.geo, ...(parsed.geo ?? {}) },
      lens: DEFAULT_TOOLBOX_FILTERS.lens, // ephemeral — never restored
      sort: { ...DEFAULT_TOOLBOX_SORT, ...(parsed.sort ?? {}) },
    }
  } catch {
    return null
  }
}

function saveSessionFilters(filters: ToolboxFilters) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(stripEphemeral(filters)))
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
        // Multi-range canonical; old saved filters carry a single customRange.
        customRanges: (t.timeline as ToolboxTimelineFilters)?.customRanges
          ?? ((t.timeline as ToolboxTimelineFilters)?.customRange ? [(t.timeline as ToolboxTimelineFilters).customRange!] : []),
        indexCreated: (t.timeline as ToolboxTimelineFilters)?.indexCreated ?? true,
        indexUpdated: (t.timeline as ToolboxTimelineFilters)?.indexUpdated ?? true,
        indexDeleted: (t.timeline as ToolboxTimelineFilters)?.indexDeleted ?? false,
        contentEvents: (t.timeline as ToolboxTimelineFilters)?.contentEvents ?? false,
        selectedTimelines: (t.timeline as ToolboxTimelineFilters)?.selectedTimelines ?? [],
      },
      geo: { bbox: (t.geo as ToolboxGeoFilters)?.bbox ?? null },
      lens: DEFAULT_TOOLBOX_FILTERS.lens, // ephemeral — never persisted
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

export interface ToolboxContextValue {
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
  /** Open an applet in the Apps tab (null returns to the launcher). */
  openApplet: (appletId: string | null) => void
  setAccentColor: (color: string | null) => void
  setFilters: (filters: ToolboxFilters) => void
  setFeatureToggle: (key: string, on: boolean) => void
  setFeatureMode: (key: string, mode: FeatureMode) => void
  clearFilters: () => void
  hasActiveFilters: boolean
  setTimelineFilter: (update: Partial<ToolboxTimelineFilters>) => void
  setGeoBBox: (bbox: GeoBBox | null) => void
  // Lens refine (ephemeral, live feeds): GPS fix + camera/desktop kNN ids.
  setLensGps: (gps: ToolboxLensFilters['gps']) => void
  setLensIds: (ids: number[] | null) => void
  // Map filter (client-side): the drawn area, and the result set the page
  // publishes for the Map tab to plot.
  setGeoSelection: (selection: GeoSelection | null) => void
  setMapDocuments: (documents: WorkspaceDocument[], workspaceId?: string | null) => void
  setSort: (sort: ToolboxSort) => void
  saveFilters: () => Promise<void>
  deleteBitmap: (key: string) => Promise<void>
  deleteDataset: (key: string) => Promise<number>
  createTimeline: (name: string) => Promise<void>
  deleteTimeline: (name: string) => Promise<void>
  refreshTimelines: () => void
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToolboxProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toolboxReducer, initialState)
  const location = useLocation()
  const stateRef = useRef(state)
  // Ref synced in an effect (not during render). Declared before every other
  // effect so, with in-order effect execution, all of them — and every
  // post-commit callback — read the current render's state.
  useEffect(() => {
    stateRef.current = state
  })

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
          const node = findTreeNode(res, wsPath)
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
    listWorkspaceTimelinesVerbose(wn).then(infos => {
      dispatch({
        type: 'SET_TIMELINES',
        names: infos.map(t => t.name),
        scales: Object.fromEntries(infos.filter(t => t.scales?.length).map(t => [t.name, t.scales as string[]])),
      })
    })
  }, [state.activeWorkspaceName])

  // ── Load filters when canvas/context/session changes ──────────────────────

  // Canvas layer / regular layer. A `/contexts/:id` route is handled by the
  // effect below instead — its saved filters are keyed by context id alone, and
  // it must NOT fall through to the session-filter branch here (that would
  // overwrite the context's own saved view).
  useEffect(() => {
    const { activeContextType, activeCanvasId, activeWorkspaceName, activeTreeName, activeContextPath } = state
    if (activeContextType === 'context') return

    if (activeContextType === 'canvas' && activeCanvasId && activeWorkspaceName && activeContextPath) {
      getCachedWorkspaceTreeByName(activeWorkspaceName, activeTreeName || DEFAULT_WORKSPACE_TREE_NAME).then(res => {
        const node = findTreeNode(res, activeContextPath)
        const saved = extractToolboxFilters(node?.metadata)
        dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: saved, savedSearchQuery: node?.querySpec?.query ?? null, hydrating: true })
      }).catch(() => {
        dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: null, savedSearchQuery: null, hydrating: true })
      })
    } else {
      // Regular layer — restore session filters
      const session = loadSessionFilters()
      dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: session, savedSearchQuery: null })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeCanvasId, state.activeContextPath, state.activeContextType, state.activeTreeName, state.activeWorkspaceName])

  // Context route (`/contexts/:id`). Deliberately keyed by the context id only:
  // the fetched record is also what names the context's workspace, so depending
  // on `activeWorkspaceName` here would re-run this effect on its own dispatch
  // and re-clobber in-flight filter edits with the saved view.
  useEffect(() => {
    const { activeContextType, activeContextId } = state
    if (activeContextType !== 'context' || !activeContextId) return
    let cancelled = false

    getContext(activeContextId).then(ctx => {
      if (cancelled) return
      const metadata = (ctx as Context & { metadata?: Record<string, unknown> }).metadata
      const saved = extractToolboxFilters(metadata)
      // The URL carries neither workspace nor tree path — take both from the
      // context record so the workspace-scoped lists (feature bitmaps,
      // timelines) load, the Features/Timeline tabs show what is filtering the
      // view, and the timeline density is scoped to the context's own path.
      dispatch({
        type: 'SET_CONTEXT_SCOPE',
        workspaceName: ctx.workspaceName || ctx.workspaceId || null,
        contextPath: ctx.path || '/',
        treeId: ctx.treeId || null,
      })
      dispatch({
        type: 'SET_SAVED_FILTERS',
        savedFilters: saved,
        savedSearchQuery: typeof metadata?.toolboxSearchQuery === 'string' ? metadata.toolboxSearchQuery : null,
        hydrating: true,
      })
    }).catch(() => {
      if (cancelled) return
      dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: null, savedSearchQuery: null, hydrating: true })
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeContextId, state.activeContextType])

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
  const openApplet = useCallback((appletId: string | null) => dispatch({ type: 'SET_APPS_APPLET', appletId }), [])
  const setAccentColor = useCallback((color: string | null) => dispatch({ type: 'SET_ACCENT_COLOR', color }), [])

  const setFilters = useCallback((filters: ToolboxFilters) => {
    dispatch({ type: 'SET_FILTERS', filters })
  }, [])

  const setFeatureToggle = useCallback((key: string, on: boolean) => {
    const { filters } = stateRef.current
    const isAbstraction = key.startsWith(ABSTRACTION_PREFIX)
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
    dispatch({ type: 'SET_FILTERS', filters: { ...DEFAULT_TOOLBOX_FILTERS, timeline: { ...filters.timeline, quickFilter: null, customRanges: [], customRange: null, selectedTimelines: [] } } })
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

  // Set (or clear, with null) the map-selected spatial bounding box.
  const setGeoBBox = useCallback((bbox: GeoBBox | null) => {
    const { filters } = stateRef.current
    dispatch({
      type: 'SET_FILTERS',
      filters: { ...filters, geo: { ...filters.geo, bbox } },
    })
  }, [])

  // Lens refine (ephemeral): a throttled GPS fix (→ geo:near) and/or the
  // smoothed kNN survivors of a camera/desktop frame loop (→ ids constraint).
  const setLensGps = useCallback((gps: ToolboxLensFilters['gps']) => {
    const { filters } = stateRef.current
    dispatch({ type: 'SET_FILTERS', filters: { ...filters, lens: { ...filters.lens, gps } } })
  }, [])

  const setLensIds = useCallback((ids: number[] | null) => {
    const { filters } = stateRef.current
    dispatch({ type: 'SET_FILTERS', filters: { ...filters, lens: { ...filters.lens, ids } } })
  }, [])

  // Map filter (ephemeral, client-side): set/clear the drawn area, and publish
  // the current result set for the Map tab to plot as pins.
  const setGeoSelection = useCallback((selection: GeoSelection | null) => {
    dispatch({ type: 'SET_GEO_SELECTION', selection })
  }, [])
  const setMapDocuments = useCallback((documents: WorkspaceDocument[], workspaceId: string | null = null) => {
    dispatch({ type: 'SET_MAP_DOCUMENTS', documents, workspaceId })
  }, [])

  const saveFilters = useCallback(async () => {
    const { activeContextType, activeContextId, activeWorkspaceName, activeTreeName, activeContextPath, filters, isSaving } = stateRef.current
    if (isSaving) return
    dispatch({ type: 'SET_SAVING', isSaving: true })
    try {
      if (activeContextType === 'canvas' && activeWorkspaceName && activeContextPath) {
        const treeName = activeTreeName || DEFAULT_WORKSPACE_TREE_NAME
        const tree = await getCachedWorkspaceTreeByName(activeWorkspaceName, treeName)
        const node = findTreeNode(tree, activeContextPath)
        const searchQuery = new URLSearchParams(location.search).get('q') || new URLSearchParams(location.search).get('search') || ''
        await updateWorkspacePath(activeWorkspaceName, activeContextPath, {
          metadata: { ...(node?.metadata || {}), toolbox: stripEphemeral(filters) },
          querySpec: {
            features: filters.features,
            // Persist the timeline scope into the server-enforced querySpec (same
            // tokens the folder view lists with) so it scopes the WHOLE canvas —
            // widgets and public shares inherit it, not just this folder view.
            // metadata.toolbox above only round-trips the UI state.
            filters: [...buildDatetimeFilters(filters.timeline), ...buildGeoFilters(filters.geo)],
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
          // metadata.toolbox = UI state (reconstructs the toolbox + dirty check);
          // features/filters = the SERVER-ENFORCED binding bound clients inherit.
          metadata: { ...existingMeta, toolbox: stripEphemeral(filters), toolboxSearchQuery: searchQuery.trim() || undefined },
          features: filters.features,
          filters: [...buildDatetimeFilters(filters.timeline), ...buildGeoFilters(filters.geo)],
        })
      }
      const searchQuery = new URLSearchParams(location.search).get('q') || new URLSearchParams(location.search).get('search') || ''
      dispatch({ type: 'SET_SAVED_FILTERS', savedFilters: filters, savedSearchQuery: searchQuery.trim() || null })
    } finally {
      dispatch({ type: 'SET_SAVING', isSaving: false })
    }
  }, [location.search])

  // Drop a bitmap key from the available list and any active feature filters.
  const stripBitmapKey = useCallback((key: string) => {
    const remaining = stateRef.current.availableBitmaps.filter(k => k !== key)
    dispatch({ type: 'SET_BITMAPS', keys: remaining })
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

  const deleteBitmap = useCallback(async (key: string) => {
    const wn = stateRef.current.activeWorkspaceName
    if (!wn) throw new Error('No active workspace')
    await deleteWorkspaceBitmap(wn, key)
    stripBitmapKey(key)
  }, [stripBitmapKey])

  // Dataset lifecycle: drops the dataset AND its documents (trash-and-repipe).
  const deleteDataset = useCallback(async (key: string) => {
    const wn = stateRef.current.activeWorkspaceName
    if (!wn) throw new Error('No active workspace')
    const result = await deleteWorkspaceDataset(wn, key)
    stripBitmapKey(key)
    // Documents were deleted — nudge open document lists to reload.
    window.dispatchEvent(new CustomEvent('workspace:documents:refresh', { detail: { workspaceName: wn } }))
    return result.documentsDeleted
  }, [stripBitmapKey])

  const refreshTimelines = useCallback(() => {
    const wn = stateRef.current.activeWorkspaceName
    if (!wn) return
    dispatch({ type: 'SET_TIMELINES_LOADING', loading: true })
    listWorkspaceTimelinesVerbose(wn).then(infos => {
      dispatch({
        type: 'SET_TIMELINES',
        names: infos.map(t => t.name),
        scales: Object.fromEntries(infos.filter(t => t.scales?.length).map(t => [t.name, t.scales as string[]])),
      })
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

  const { features: f, timeline: tl, geo, lens } = state.filters
  // customRanges counts too: a drawn/typed date range narrows the view exactly
  // like a quick filter, so leaving it out hid both the "filters are active"
  // indicator and the Clear button while the range was still filtering.
  const hasActiveFilters =
    f.allOf.length > 0 || f.anyOf.length > 0 || f.noneOf.length > 0 ||
    tl.quickFilter !== null || (tl.customRanges?.length ?? 0) > 0 ||
    (tl.selectedTimelines?.length ?? 0) > 0 ||
    geo.bbox !== null || lens.gps !== null || lens.ids !== null

  return (
    <ToolboxCtx.Provider
      value={{ state, setView, toggleView, closeT1, openAgentT2, closeT2, openAdd, openAddPicker, closeAdd, openEdit, setToolsTab, openApplet, setAccentColor, setFilters, setFeatureToggle, setFeatureMode, clearFilters, hasActiveFilters, setTimelineFilter, setGeoBBox, setLensGps, setLensIds, setGeoSelection, setMapDocuments, setSort, saveFilters, deleteBitmap, deleteDataset, createTimeline, deleteTimeline, refreshTimelines }}
    >
      {children}
    </ToolboxCtx.Provider>
  )
}

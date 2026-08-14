import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Filter } from 'lucide-react';
import { Icon } from '@iconify/react';
import { DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style';
import { visibleAccentColor } from '@/utils/color';
import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';
import { useToast } from '@/components/ui/use-toast';
import { useMenu } from '@/components/shell/use-menu';
import { Button } from '@/components/ui/button';
import { FormPanel } from '@/components/common/form-panel';
import { CloseSectionButton, SectionBackButton } from '@/components/common/page-header';
import { useIsMobile } from '@/hooks/use-mobile';
import { DefaultCanvas } from '@/components/canvas/DefaultCanvas';
import type { CanvasInfo } from '@/components/canvas/DefaultCanvas';
import { ContentViewTabs } from '@/components/common/content-view-tabs';
import { viewsFromLayerMetadata, DEFAULT_VIEW, type ContentView } from '@/components/common/content-views';
import { SchemaColumnsBoard } from '@/components/common/schema-columns-board';
import { CanvasGrid } from '@/components/canvas/CanvasGrid';
import type { WidgetFetchOpts, WidgetDocumentsResult } from '@/components/canvas/widget-types';
import type { DocumentPasteOptions } from '@/components/common/document-list';
import {
  getWorkspaceDocuments,
  getWorkspaceLayerDocuments,
  getCanvasPathDocuments,
  updateWorkspacePath,
  getCachedWorkspaceTreeByName,
  invalidateWorkspaceTreeCache,
  createWorkspaceCanvas,
  createPublicCanvasShare,
  getPublicCanvasShare,
  deletePublicCanvasShare,
  removeWorkspacePath,
  pasteDocumentsToWorkspacePath,
  importDocumentsToWorkspacePath,
  removeWorkspaceDocuments,
  deleteWorkspaceDocuments,
  destroyWorkspaceDocuments,
  purgeWorkspaceDocuments,
  startWorkspace,
  DEFAULT_WORKSPACE_TREE_NAME,
  treeTypeForName,
  listBackendDocuments,
  listBackends,
  backendAddressFromTreePath,
  type Backend,
} from '@/services/workspace';
import { Document, TreeNode, buildDatetimeFilters, buildGeoFilters, buildLensFilters, DEFAULT_TOOLBOX_SORT } from '@/types/workspace';
import { sanitizeUrlPath, buildWorkspaceUrl, parseWorkspacePathFromUrl } from '@/utils/url-params';
import { docInGeoSelection } from '@/utils/geo';
import { useToolbox } from '@/components/toolbox/use-toolbox';
import { useCanvasPins } from '@/components/home/use-canvas-pins';
import { useQuerySession } from '@/hooks/useQuerySession';
import type { SessionSpec } from '@/services/session';
import { useQueryDebug, type QueryDebugData } from '@/lib/query-debug';
import { QueryDebugPanel } from '@/components/common/query-debug-panel';
import { cn } from '@/lib/utils';
import socketService from '@/lib/socket';

type WorkspaceSidePane = {
  treeName: string;
  path: string;
};

type FocusedPane = 'left' | 'right';
type WorkspaceClipboard = {
  documentIds: number[];
  operation: 'copy' | 'cut';
  sourcePath?: string;
  sourceTreeName?: string;
};

const documentCache = new Map<string, { documents: Document[]; totalCount: number }>();

function paneKey(workspaceName: string, treeName: string, path: string) {
  return `${workspaceName}\0${treeName}\0${path}`;
}

function documentKey(workspaceName: string, treeName: string, path: string, page: number, pageSize: number, search: string, filtersKey = '', layerId = '', scope = 'path') {
  return `${paneKey(workspaceName, treeName, path)}\0${page}\0${pageSize}\0${search}\0${filtersKey}\0${layerId}\0${scope}`;
}

function invalidateDocumentCache(workspaceName: string, treeName: string, path: string) {
  const prefix = paneKey(workspaceName, treeName, path);
  for (const key of documentCache.keys()) {
    if (key.startsWith(prefix)) documentCache.delete(key);
  }
}

// Drop every cached path/tree for a workspace. Socket document events don't
// carry the affected path, so a doc inserted into a non-viewed path would stay
// stale on later navigation if we only cleared the current pane — clear the
// whole workspace instead.
function invalidateWorkspaceDocumentCache(workspaceName: string) {
  const prefix = `${workspaceName}\0`;
  for (const key of documentCache.keys()) {
    if (key.startsWith(prefix)) documentCache.delete(key);
  }
}

// Invalidate the refresh event's target so a later navigation there doesn't
// serve stale data — even when no mounted pane currently shows that target.
// treeName without path drops the whole tree's cached paths.
function invalidateRefreshTarget(fallbackWorkspaceName: string, detail?: { workspaceName?: string; path?: string; treeName?: string }) {
  if (!detail?.treeName) return;
  const ws = detail.workspaceName ?? fallbackWorkspaceName;
  const prefix = detail.path ? paneKey(ws, detail.treeName, detail.path) : `${ws}\0${detail.treeName}\0`;
  for (const key of documentCache.keys()) {
    if (key.startsWith(prefix)) documentCache.delete(key);
  }
}

export default function WorkspaceDetailPage() {
  const { workspaceName, treeName } = useParams<{ workspaceName: string; treeName?: string; '*'?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const searchParams = new URLSearchParams(location.search);
  // Stacked text queries (?q=car&q=red) refine each other (AND-narrow); a single
  // ?q / ?search is the ordinary one-shot search.
  const urlSearchQueries = (() => {
    const qs = searchParams.getAll('q').map((s) => s.trim()).filter(Boolean);
    if (qs.length > 0) return qs;
    const s = (searchParams.get('search') || '').trim();
    return s ? [s] : [];
  })();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [documentsTotalCount, setDocumentsTotalCount] = useState(0);
  // Search metadata for relevance-floor calibration (Settings → Database).
  const queryDebug = useQueryDebug();
  const [queryDebugData, setQueryDebugData] = useState<QueryDebugData | null>(null);
  // Turning the toggle off must drop stale numbers immediately, not leave the
  // last query's distances hanging around until the next search.
  // (State adjustment during render — see react.dev "You Might Not Need an Effect".)
  const [prevQueryDebug, setPrevQueryDebug] = useState(queryDebug);
  if (prevQueryDebug !== queryDebug) {
    setPrevQueryDebug(queryDebug);
    if (!queryDebug) setQueryDebugData(null);
  }
  // 'path' scopes to the selected tree path; 'workspace' lists every document.
  const [docScope, setDocScope] = useState<'path' | 'workspace'>('path');
  const [isStartingWorkspace, setIsStartingWorkspace] = useState(false);

  const [clipboard, setClipboard] = useState<WorkspaceClipboard | null>(null);

  // Canvas creation is a content-area form, not a tree input or a modal: the
  // parent path comes either from the tree ("New canvas here…", which lands
  // with ?createCanvas=1) or from the current view ("Save view as canvas",
  // which pre-arms the view capture).
  const [createCanvas, setCreateCanvas] = useState<{ parentPath: string; captureView: boolean } | null>(null);
  const [saveAsCanvasName, setSaveAsCanvasName] = useState('');
  const [saveAsCanvasLoading, setSaveAsCanvasLoading] = useState(false);
  const [shareCanvasLoading, setShareCanvasLoading] = useState(false);
  const [deleteCanvasLoading, setDeleteCanvasLoading] = useState(false);
  const [publicCanvasShare, setPublicCanvasShare] = useState<{ code: string; url: string } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [serverSearchQueries, setServerSearchQueries] = useState<string[]>(urlSearchQueries);
  const [ignoredSavedSearchPath, setIgnoredSavedSearchPath] = useState<string | null>(null);

  const { state: toolboxState, saveFilters, toggleView, setSort, setAccentColor, setMapDocuments, hasActiveFilters } = useToolbox();
  const tbAllOf = toolboxState.filters.features.allOf;
  const tbAnyOf = toolboxState.filters.features.anyOf;
  const tbNoneOf = toolboxState.filters.features.noneOf;
  const tbDatetimeFilters = buildDatetimeFilters(toolboxState.filters.timeline);
  const tbGeoFilters = buildGeoFilters(toolboxState.filters.geo);
  // Lens refine: GPS → a geo:near scope token; camera/desktop → a literal ids
  // constraint. Both live-feed ephemera, both fold into the fetch key.
  const tbLensFilters = buildLensFilters(toolboxState.filters.lens);
  const tbLensIds = toolboxState.filters.lens.ids;
  const tbScopeFilters = [...tbDatetimeFilters, ...tbGeoFilters, ...tbLensFilters];
  const tbSort = toolboxState.filters.sort ?? DEFAULT_TOOLBOX_SORT;
  const tbFiltersKey = JSON.stringify({ a: tbAllOf, b: tbAnyOf, c: tbNoneOf, d: tbScopeFilters, i: tbLensIds, s: tbSort });
  // Same key WITHOUT the live lens id-set: when only that part changed, the
  // refetch is a live-feed tick — update in place, never blink the list.
  const tbFiltersKeyNoLens = JSON.stringify({ a: tbAllOf, b: tbAnyOf, c: tbNoneOf, d: tbScopeFilters, s: tbSort });

  // Path from the URL. Derive it by parsing location.pathname with the shared
  // decoder (parseWorkspacePathFromUrl safely decodes each segment) rather than
  // the `useParams` `*` splat — React Router v7 leaves the splat percent-encoded
  // (buildWorkspaceUrl encodes segments), and reading it raw round-tripped
  // non-ASCII lossily ("Náš Domček" → "N Domek" on submit). Using the same
  // decoder as the rest of the app keeps every entry point (tree select, address
  // bar submit, reload, shared link) consistent.
  const selectedPath = parseWorkspacePathFromUrl(location.pathname).path;
  const selectedTreeName = treeName ?? DEFAULT_WORKSPACE_TREE_NAME;
  // Bulk "Purge All" is hidden in the backends tree: backend-mirrored docs
  // are purged via the tree's "Remove and purge documents" (folder-scoped) or
  // the per-doc Delete/Destroy context menu. The toolbar button queries the
  // context tree and would no-op on these directory-tree paths anyway.
  const isBackendsPath = selectedTreeName === 'backends';
  // Backends list — needed to resolve device-scoped mount nodes
  // (/device/<device>/<mount>) to their (driver, address) by treePath.
  const [wsBackends, setWsBackends] = useState<Backend[]>([]);
  useEffect(() => {
    if (!isBackendsPath || !workspaceName) return;
    listBackends(workspaceName).then(setWsBackends).catch(() => setWsBackends([]));
  }, [isBackendsPath, workspaceName]);
  // /<driver>/<address>/… backends-tree paths map to a syncable backend; used
  // for the "Unfiled only" filter (docs never filed into any other tree —
  // safe-to-purge candidates on the backend).
  const backendTarget = isBackendsPath ? backendAddressFromTreePath(selectedPath, wsBackends) : null;
  const [unfiledOnly, setUnfiledOnly] = useState(false);
  // Reset the filter when the tree/path changes (state adjustment during render).
  const unfiledResetKey = `${selectedTreeName}\0${selectedPath}`;
  const [prevUnfiledResetKey, setPrevUnfiledResetKey] = useState(unfiledResetKey);
  if (prevUnfiledResetKey !== unfiledResetKey) {
    setPrevUnfiledResetKey(unfiledResetKey);
    setUnfiledOnly(false);
  }

  const isLayerView = searchParams.get('layer') === '1';
  const selectedLayerId = searchParams.get('layerId') || null;
  // Leaf node type / canvas id are derived from the path against the loaded tree —
  // we do not encode them in the URL. The path is the source of truth, mirroring
  // the REST API. See `feedback_url_design` memory for rationale.
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [sidePane, setSidePane] = useState<WorkspaceSidePane | null>(null);
  const [focusedPane, setFocusedPane] = useState<FocusedPane>('left');
  const [leftSelection, setLeftSelection] = useState<number[]>([]);
  const { openM2Drawer } = useMenu();
  const isMobile = useIsMobile();
  const [rightSelection, setRightSelection] = useState<number[]>([]);
  const selectedNode = useMemo(() => {
    if (!tree || selectedPath === '/' || isLayerView) return null;
    const segments = selectedPath.split('/').filter(Boolean);
    let node: TreeNode | null = tree;
    for (const seg of segments) {
      node = node?.children?.find(c => c.name === seg) ?? null;
      if (!node) return null;
    }
    return node;
  }, [tree, selectedPath, isLayerView]);
  const selectedNodeType = selectedNode?.type === 'canvas' ? 'canvas' : null;

  // ── Content-area views (tabs) ──────────────────────────────────────────
  // A tree path is a layer — the "task container" — and its named views live
  // in the layer's metadata (`metadata.views`). Local state is derived per
  // path-key (no effects); edits are optimistic with a PATCH behind them.
  // Root '/' is the root layer: its node is the tree itself.
  const nodeForViews = !isLayerView ? (selectedPath === '/' ? tree : selectedNode) : null;
  const viewsKey = `${selectedTreeName}\0${selectedPath}`;
  const [viewsState, setViewsState] = useState<{ key: string; views: ContentView[]; activeId: string } | null>(null);
  const contentViews = viewsState?.key === viewsKey ? viewsState.views : viewsFromLayerMetadata(nodeForViews?.metadata);
  const activeContentViewId = viewsState?.key === viewsKey ? viewsState.activeId : contentViews[0]?.id ?? DEFAULT_VIEW.id;
  const activeContentView = contentViews.find(v => v.id === activeContentViewId) ?? contentViews[0] ?? DEFAULT_VIEW;

  const selectContentView = (id: string) => setViewsState({ key: viewsKey, views: contentViews, activeId: id });
  const saveContentViews = (views: ContentView[], nextActiveId?: string) => {
    setViewsState({ key: viewsKey, views, activeId: nextActiveId ?? activeContentViewId });
    // metadata is REPLACED server-side — carry the layer's other keys along.
    updateWorkspacePath(
      workspaceName!,
      selectedPath,
      { metadata: { ...(nodeForViews?.metadata ?? {}), views } },
      selectedTreeName,
    ).catch(() => {
      showToast({ title: 'View not saved', description: 'Could not persist views to the layer', variant: 'destructive' });
    });
  };
  const savedCanvasSearchQuery = selectedNodeType === 'canvas' && typeof selectedNode?.querySpec?.query === 'string'
    ? selectedNode.querySpec.query
    : '';
  const canvasInfo: CanvasInfo | null = selectedNodeType === 'canvas'
    ? { label: selectedNode?.label, description: selectedNode?.description, color: selectedNode?.color }
    : null;

  // Pinning a canvas to /home. Layer views are excluded: they are a filtered
  // read of a canvas, not an addressable canvas node of their own.
  const { isPinned, pin, unpin, pins } = useCanvasPins();
  const pinWorkspaceName = workspace?.name;
  const pinAddress = useMemo(
    () => (pinWorkspaceName && selectedNodeType === 'canvas' && !isLayerView
      ? { workspaceName: pinWorkspaceName, treeName: selectedTreeName, path: selectedPath }
      : null),
    [pinWorkspaceName, selectedNodeType, isLayerView, selectedTreeName, selectedPath],
  );
  const isCanvasPinned = pinAddress ? isPinned(pinAddress) : false;
  const pinLayerId = selectedNode?.id;
  const pinLabel = selectedNode?.label;
  const handleTogglePin = useCallback(async () => {
    if (!pinAddress) return;
    try {
      const existing = pins.find(p =>
        p.workspaceName === pinAddress.workspaceName &&
        p.treeName === pinAddress.treeName &&
        p.path === pinAddress.path);
      if (existing) {
        await unpin(existing.id);
      } else {
        await pin({ ...pinAddress, layerId: pinLayerId, label: pinLabel });
      }
    } catch (error) {
      console.error('Failed to update home pins:', error);
    }
  }, [pinAddress, pins, pin, unpin, pinLayerId, pinLabel]);
  const urlDisplay = workspaceName
    ? `${workspaceName}://${selectedPath === '/' ? '' : selectedPath.replace(/^\//, '')}`
    : '';

  // Publish the workspace accent color to the toolbox so its selected-tab
  // underline matches the content being filtered. Cleared on unmount (→ black).
  const workspaceAccent = visibleAccentColor(workspace?.color) || null;
  useEffect(() => {
    setAccentColor(workspaceAccent);
    return () => setAccentColor(null);
  }, [workspaceAccent, setAccentColor]);

  // Live canvas filter preview: while the toolbox filters are dirty on a canvas,
  // feed the widgets from a client-driven fetch (applyCanvasSpec:false) so every
  // filter edit — including loosening/removing one — reloads the canvas in real
  // time. When clean we pass undefined, so CanvasGrid uses its default
  // (server-composed) read and a saved canvas renders exactly as stored.
  const canvasFetchDocuments = useCallback(async (opts?: WidgetFetchOpts): Promise<WidgetDocumentsResult> => {
    const res = await getCanvasPathDocuments(workspaceName!, selectedPath, selectedTreeName, {
      limit: opts?.limit,
      offset: opts?.offset,
      page: opts?.page,
      sortBy: opts?.sortBy,
      order: opts?.order,
      // Keep the widget's fixed scope (e.g. gallery's data/mime/image) AND apply
      // the live toolbox feature filters on top.
      allOf: [...tbAllOf, ...(opts?.allOf ?? [])],
      anyOf: tbAnyOf,
      noneOf: tbNoneOf,
      filters: tbScopeFilters,
      ids: tbLensIds,
      queries: [...serverSearchQueries, ...(opts?.queries ?? []), ...(opts?.q ? [opts.q] : [])],
      applyCanvasSpec: false,
    });
    return { payload: (res.payload as Document[]) || [], count: res.count ?? undefined, totalCount: res.totalCount ?? undefined };
  // tbFiltersKey encodes all the tb* filter arrays; serverSearchQueries covers the query stack.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceName, selectedPath, selectedTreeName, tbFiltersKey, serverSearchQueries]);

  // Fetch workspace details
  useEffect(() => {
    if (!workspaceName) return;

    const fetchWorkspace = async () => {
      setIsLoadingWorkspace(true);
      try {
        const response = await api.get<{ workspace: Workspace } | Workspace>(
          `${API_ROUTES.workspaces}/${workspaceName}`
        );
        let ws: Workspace;
        if (response && 'workspace' in response) {
          ws = response.workspace as Workspace;
        } else {
          ws = response as Workspace;
        }
        setWorkspace(ws);
        // An offline workspace is NOT started here — opening the view is not
        // the same as using it. The document/tree queries this page issues will
        // wake it through the API layer, and the status pill catches up via the
        // workspace:autostarted event below.
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to fetch workspace ${workspaceName}`;
        showToast({ title: 'Error', description: message, variant: 'destructive' });
        setWorkspace(null);
      } finally {
        setIsLoadingWorkspace(false);
      }
    };

    fetchWorkspace();
  }, [workspaceName, showToast]);

  // A query woke this workspace up (see src/lib/api.ts): reflect it in the
  // status pill, which otherwise keeps showing the stale 'inactive' it was
  // loaded with.
  useEffect(() => {
    const onAutostarted = (event: Event) => {
      const ref = (event as CustomEvent<{ workspace: string }>).detail?.workspace;
      if (!ref) return;
      setWorkspace(prev => (
        prev && (ref === prev.name || ref === prev.id) && prev.status !== 'active'
          ? { ...prev, status: 'active' }
          : prev
      ));
    };
    window.addEventListener('workspace:autostarted', onAutostarted);
    return () => window.removeEventListener('workspace:autostarted', onAutostarted);
  }, []);

  // ── Live query session ─────────────────────────────────────────────────────
  // The lens feed is a STREAM, and answering a stream with a stateless refetch
  // per frame swaps the whole list every tick. Instead the server holds the
  // candidate set: the structural scope below is one cue, the feed's id-set is
  // another (replaced per frame via setCue), and the client gets
  // {added, removed} — so only genuinely new documents are ever fetched and the
  // rendered cards keep their identity.
  //
  // Deliberately narrow: only the plain document list, only while the feed is
  // running. Layer views and backend "unfiled only" have their own read paths
  // and fall back to the refetch path below, which still keeps previous results
  // and stable keys. So does a STACKED query (?q=car&q=red): that is chained
  // AND-narrowing across separate searches, and a session ranks by one match.
  const lensLive = (tbLensIds?.length ?? 0) > 0;
  const sessionEligible = lensLive
    && !isLayerView
    && !(unfiledOnly && backendTarget)
    && serverSearchQueries.length <= 1;

  const sessionSpecs = useMemo(() => {
    const scope: SessionSpec = {
      features: { allOf: tbAllOf, anyOf: tbAnyOf, noneOf: tbNoneOf },
      filters: tbScopeFilters,
    };
    // Whole-workspace scope drops the path bucket entirely (backend mirrors
    // live in their own tree and are otherwise invisible from a context path).
    if (docScope !== 'workspace') {
      if (treeTypeForName(selectedTreeName) === 'directory') {
        // Tree-qualified: 'directory' and 'backends' are distinct trees.
        scope.directory = { tree: selectedTreeName, path: selectedPath } as unknown as SessionSpec['directory'];
      } else {
        // The default context tree, addressed through the ctx: path grammar —
        // the same resolution every other Workspace read uses.
        scope.context = selectedPath;
      }
    }
    return [{ label: 'scope', spec: scope }];
  // tbFiltersKeyNoLens encodes every tb* array above; the lens id-set is a
  // separate cue on purpose (changing it must not reopen the session).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tbFiltersKeyNoLens, selectedPath, selectedTreeName, docScope]);

  const {
    documents: sessionDocuments,
    count: sessionCount,
    ready: sessionReady,
    setCue: setSessionCue,
    resync: resyncSession,
    rank: rankSession,
  } = useQuerySession({
    workspaceRef: workspaceName,
    specs: sessionSpecs,
    // debounce so an ingest burst converges into one delta instead of a storm.
    opts: useMemo(() => ({ mode: 'live' as const, debounceMs: 150 }), []),
    enabled: sessionEligible,
  });

  // The session is an optimization: until it is open the ordinary fetch path
  // owns the list, so a server without session support just keeps working.
  const sessionActive = sessionEligible && sessionReady;
  const sessionActiveRef = useRef(false);
  useEffect(() => { sessionActiveRef.current = sessionActive; }, [sessionActive]);

  // The search box drives the RANKING stage, not a cue. Cues (path, geo, the
  // frame's kNN survivors) build the candidate set; the text picks out what
  // matters inside it — including documents whose only match is a comment or a
  // generated summary, both of which synapsd always folds into FTS. The match
  // sticks: every later delta re-ranks against the new candidate set, so the
  // query keeps applying as the camera moves.
  const sessionQuery = serverSearchQueries.length === 1 ? serverSearchQueries[0].trim() : '';
  useEffect(() => {
    if (!sessionReady) return;
    void rankSession(
      sessionQuery ? { text: sessionQuery } : null,
      { limit: pageSize, offset: (currentPage - 1) * pageSize },
    ).catch(() => {});
  }, [sessionReady, sessionQuery, pageSize, currentPage, rankSession]);

  // Each frame REPLACES the cue — a patch would union every id the feed ever saw.
  const tbLensIdsKey = (tbLensIds ?? []).join(',');
  useEffect(() => {
    if (!sessionReady) return;
    void setSessionCue('lens', { ids: tbLensIds ?? [] }).catch(() => {});
  }, [sessionReady, tbLensIdsKey, setSessionCue, tbLensIds]);

  // The one list every consumer below reads: session-driven while the feed is
  // live, fetched otherwise.
  const listedDocuments = sessionActive ? sessionDocuments : documents;
  const listedTotalCount = sessionActive ? sessionCount : documentsTotalCount;

  // Publish the current result set to the toolbox map (it plots geo-tagged docs
  // as pins) and refine the content area by any drawn area — client-side, over
  // the already-fetched set, so navigating the map never triggers a re-fetch.
  const geoSelection = toolboxState.geoSelection;
  useEffect(() => { setMapDocuments(listedDocuments, workspace?.name ?? null); }, [listedDocuments, workspace?.name, setMapDocuments]);
  useEffect(() => () => setMapDocuments([]), [setMapDocuments]);
  const shownDocuments = useMemo(
    () => (geoSelection ? listedDocuments.filter((d) => docInGeoSelection(d, geoSelection)) : listedDocuments),
    [listedDocuments, geoSelection],
  );

  // Fetch documents when path, tree, pagination, or workspace status changes.
  // A monotonic sequence guards against out-of-order responses: during a reembed
  // (or any socket storm) many overlapping fetches are in flight, and on a slow
  // box a stale one — an older query/scope closure — can resolve after the
  // current one and clobber the list with unrelated documents. Only the latest
  // fetch is allowed to write state.
  const fetchSeqRef = useRef(0);
  // Everything that identifies the fetch EXCEPT the live lens id-set. When two
  // consecutive fetches share this identity, the trigger was a lens tick.
  const fetchIdentityRef = useRef('');
  const fetchDocuments = useCallback(async (opts?: { silent?: boolean }) => {
    if (!workspaceName) return;
    // While a session drives the list, a refetch would be both redundant and
    // wrong: it re-fetches every document to answer a question the deltas
    // already answered incrementally.
    if (sessionActiveRef.current) return;
    const seq = ++fetchSeqRef.current;
    const effectiveScope = unfiledOnly && backendTarget ? `${docScope}:unfiled` : docScope;
    const lensActive = (tbLensIds?.length ?? 0) > 0;
    const identity = documentKey(workspaceName, selectedTreeName, selectedPath, currentPage, pageSize, serverSearchQueries.join('␟'), tbFiltersKeyNoLens, (isLayerView && selectedLayerId) ? selectedLayerId : '', effectiveScope);
    const lensTickOnly = lensActive && identity === fetchIdentityRef.current;
    fetchIdentityRef.current = identity;
    const cacheKey = documentKey(workspaceName, selectedTreeName, selectedPath, currentPage, pageSize, serverSearchQueries.join('␟'), tbFiltersKey, (isLayerView && selectedLayerId) ? selectedLayerId : '', effectiveScope);
    // Live-feed ticks bypass the cache: every frame is a fresh id-set, so
    // caching would balloon the map with single-use entries.
    // Debug reads bypass the cache too: a cache hit skips the request entirely,
    // so the distances would never arrive and the panel would stay empty right
    // after switching the toggle on.
    const cached = (lensActive || queryDebug) ? undefined : documentCache.get(cacheKey);
    if (cached) {
      setDocuments(cached.documents);
      setDocumentsTotalCount(cached.totalCount);
      return;
    }
    // Background refreshes (socket events, post-mutation reconcile) and live
    // lens ticks update the list in place. Skipping the loading spinner keeps
    // the previous results rendered — no blink.
    const silent = opts?.silent ?? lensTickOnly;
    if (!silent) setIsLoadingDocuments(true);
    try {
      let response;
      if (unfiledOnly && backendTarget) {
        // Backend mirror with the "unfiled only" filter: documents present on
        // the backend but never filed into any other tree (safe to purge).
        response = await listBackendDocuments(workspaceName, backendTarget.driver, backendTarget.address, {
          linked: false,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        });
      } else if (isLayerView && selectedLayerId && docScope !== 'workspace') {
        response = await getWorkspaceLayerDocuments(workspaceName, selectedTreeName, selectedLayerId, {
          limit: pageSize,
          page: currentPage,
          queries: serverSearchQueries,
          allOf: tbAllOf,
          anyOf: tbAnyOf,
          noneOf: tbNoneOf,
          filters: tbScopeFilters,
          ids: tbLensIds,
          sortBy: tbSort.sortBy || undefined,
          order: tbSort.order,
        });
      } else {
        const selectedTreeType: 'context' | 'directory' = selectedTreeName === 'directory' || selectedTreeName === 'backends' ? 'directory' : 'context';
        response = await getWorkspaceDocuments(workspaceName, selectedPath, tbAllOf, {
          limit: pageSize,
          page: currentPage,
          treeName: selectedTreeName,
          treeType: selectedTreeType,
          queries: serverSearchQueries,
          anyOf: tbAnyOf,
          noneOf: tbNoneOf,
          filters: tbScopeFilters,
          ids: tbLensIds,
          sortBy: tbSort.sortBy || undefined,
          order: tbSort.order,
          // Whole-workspace scope lists every doc in the DB, including backend
          // mirrors (they live in their own tree now — no opt-in flag needed).
          scope: docScope,
          // Only meaningful with a text query — the server attaches image kNN
          // distances for the query (the LAST one of a refine stack). Ask for a
          // deep window: the nearest 25 of ANY query cluster tightly, so a short
          // list shows no boundary and invites a floor picked from noise.
          debug: queryDebug && serverSearchQueries.length > 0,
          debugLimit: 200,
        });
      }
      const nextDocuments = (response.payload as Document[]) || [];
      const nextTotalCount = response.totalCount || response.count || 0;
      // Cache is keyed by the exact query/scope, so store regardless of order —
      // but only the latest fetch may paint the live list.
      if (!lensActive) documentCache.set(cacheKey, { documents: nextDocuments, totalCount: nextTotalCount });
      if (seq !== fetchSeqRef.current) return;
      // Calibration data rides beside the payload; it is absent unless the
      // toggle is on AND the search had a text query.
      const dbg = (response as { debug?: { distances?: Array<{ id: number; distance: number }>; imageDistances?: Array<{ id: number; distance: number }> } }).debug;
      const distances = dbg?.imageDistances ?? dbg?.distances ?? null;
      setQueryDebugData(distances
        ? { query: serverSearchQueries[serverSearchQueries.length - 1] ?? '', distances }
        : null);
      if (lensTickOnly) {
        // Stable scene: identical id sequence → return prev, React bails out
        // and nothing re-renders. (Only safe on lens ticks — a background
        // refresh with the same ids may carry updated CONTENT.)
        setDocuments(prev =>
          prev.length === nextDocuments.length && prev.every((d, i) => d.id === nextDocuments[i].id)
            ? prev
            : nextDocuments,
        );
      } else {
        setDocuments(nextDocuments);
      }
      setDocumentsTotalCount(nextTotalCount);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to fetch documents';
      showToast({ title: 'Error', description: message, variant: 'destructive' });
      setDocuments([]);
      setDocumentsTotalCount(0);
    } finally {
      if (!silent && seq === fetchSeqRef.current) setIsLoadingDocuments(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceName, selectedPath, selectedTreeName, selectedLayerId, isLayerView, currentPage, pageSize, workspace?.status, serverSearchQueries, tbFiltersKey, docScope, unfiledOnly, queryDebug]);

  useEffect(() => {
    const run = () => fetchDocuments();
    void run();
  }, [fetchDocuments]);

  useEffect(() => {
    const onOpenToSide = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceSidePane & { workspaceName?: string }>).detail;
      if (!detail || detail.workspaceName !== workspaceName) return;
      setSidePane({ treeName: detail.treeName || DEFAULT_WORKSPACE_TREE_NAME, path: sanitizeUrlPath(detail.path || '/') });
      setFocusedPane('left');
    };
    window.addEventListener('workspace:open-to-side', onOpenToSide);
    return () => window.removeEventListener('workspace:open-to-side', onOpenToSide);
  }, [workspaceName, selectedTreeName, selectedPath]);

  useEffect(() => {
    const onDocumentsRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as { workspaceName?: string; path?: string; treeName?: string } | undefined;
      if (detail?.workspaceName && detail.workspaceName !== workspaceName) return;
      if (workspaceName) invalidateRefreshTarget(workspaceName, detail);
      // Refetch only when this pane shows the event's target (no detail →
      // broad refresh of the current view).
      if (detail?.treeName && detail.treeName !== selectedTreeName) return;
      if (detail?.path && detail.path !== selectedPath) return;
      if (workspaceName) invalidateDocumentCache(workspaceName, selectedTreeName, selectedPath);
      fetchDocuments({ silent: true });
    };

    window.addEventListener('workspace:documents:refresh', onDocumentsRefresh);
    return () => window.removeEventListener('workspace:documents:refresh', onDocumentsRefresh);
  }, [fetchDocuments, workspaceName, selectedPath, selectedTreeName]);

  // Live-refresh the content area when documents change in the DB (CLI, agents,
  // hooks, other clients). The backend forwards synapsd document events over the
  // workspace socket channel keyed by workspace id. We subscribe but never
  // unsubscribe on cleanup so we don't tear down a sibling component's
  // subscription to the same channel.
  const wsChannelName = workspace?.name;
  const wsChannelId = workspace?.id;
  useEffect(() => {
    if (!workspaceName || (!wsChannelName && !wsChannelId)) return;
    const channels = [wsChannelName, wsChannelId].filter(Boolean).map(id => `workspace:${id}`);
    const subscribe = () => channels.forEach(ch => socketService.emit('subscribe', { channel: ch }));
    subscribe();
    const offConnect = socketService.on('connect', subscribe);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Whole-workspace invalidation: the event may target a path this pane
        // isn't showing, so clearing only the current pane would leave those
        // paths stale until reload.
        if (workspaceName) invalidateWorkspaceDocumentCache(workspaceName);
        // A session usually learns about a write on its own (precise key-touch
        // invalidation → a delta). It cannot when a cue has no keys to
        // invalidate — a scope cue over a tree path that did not exist yet
        // consulted no bitmap, so documents arriving there push nothing. This
        // resync closes that gap and costs one bitmap read, no document loads.
        if (sessionActiveRef.current) { void resyncSession(); return; }
        fetchDocuments({ silent: true });
      }, 200);
    };

    const events = [
      'document.inserted', 'document.updated', 'document.removed', 'document.deleted',
      'document.removed.batch', 'document.deleted.batch',
      'tree.document.inserted', 'tree.document.inserted.batch',
      'tree.document.removed', 'tree.document.removed.batch',
      'tree.document.deleted', 'tree.document.deleted.batch',
      // Layer merge/subtract moves docs between layers (membership-only, no
      // per-doc events) — refresh the content area on these too.
      'tree.layer.merged', 'tree.layer.subtracted',
    ];
    events.forEach(ev => socketService.on(ev, refresh));

    return () => {
      if (timer) clearTimeout(timer);
      offConnect?.();
      events.forEach(ev => socketService.off(ev, refresh));
    };
  }, [workspaceName, wsChannelId, wsChannelName, selectedTreeName, selectedPath, fetchDocuments, resyncSession]);

  // Reset pagination / saved-search suppression when the addressed view changes
  // (state adjustment during render, not an effect).
  const pageResetKey = `${selectedPath}\0${selectedTreeName}\0${selectedLayerId ?? ''}\0${docScope}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (prevPageResetKey !== pageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setCurrentPage(1);
    setIgnoredSavedSearchPath(null);
  }

  // Leaving whole-workspace scope is implicit when the user navigates to a path.
  const scopeResetKey = `${selectedPath}\0${selectedTreeName}\0${selectedLayerId ?? ''}`;
  const [prevScopeResetKey, setPrevScopeResetKey] = useState(scopeResetKey);
  if (prevScopeResetKey !== scopeResetKey) {
    setPrevScopeResetKey(scopeResetKey);
    setDocScope('path');
  }

  const openCreateCanvas = (parentPath: string, captureView: boolean) => {
    const defaultName = parentPath === '/' ? 'canvas' : (parentPath.split('/').pop() || 'canvas');
    setSaveAsCanvasName(defaultName);
    setCreateCanvas({ parentPath, captureView });
  };

  // The M2 tree's "New canvas here…" navigates to the parent path with this
  // flag; consume it so a reload or back-navigation does not reopen the form.
  const wantsCreateCanvas = searchParams.get('createCanvas') === '1';
  // Open the form when the flag appears (state adjustment during render;
  // initialized to false so a direct landing on ?createCanvas=1 still opens it).
  const [prevWantsCreateCanvas, setPrevWantsCreateCanvas] = useState(false);
  if (prevWantsCreateCanvas !== wantsCreateCanvas) {
    setPrevWantsCreateCanvas(wantsCreateCanvas);
    if (wantsCreateCanvas) openCreateCanvas(selectedPath, false);
  }
  // Consuming the flag from the URL is a real side effect — keep it in an effect.
  useEffect(() => {
    if (!wantsCreateCanvas) return;
    const params = new URLSearchParams(location.search);
    params.delete('createCanvas');
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsCreateCanvas, selectedPath]);

  // Reflect a query stack into the URL (?q=a&q=b) so it is shareable/back-navigable.
  const syncQueriesToUrl = useCallback((queries: string[]) => {
    const params = new URLSearchParams(location.search);
    params.delete('q');
    params.delete('search');
    for (const q of queries) { params.append('q', q); }
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
  }, [location.pathname, location.search, navigate]);

  // URL is the source of truth for the query stack: when it changes, mirror it
  // into state (state adjustment during render, not an effect).
  const urlQueriesKey = urlSearchQueries.join('␟');
  const [prevUrlQueriesKey, setPrevUrlQueriesKey] = useState(urlQueriesKey);
  if (prevUrlQueriesKey !== urlQueriesKey) {
    setPrevUrlQueriesKey(urlQueriesKey);
    setServerSearchQueries(urlSearchQueries);
    setCurrentPage(1);
  }

  // Apply a canvas node's saved query when landing on it without an explicit
  // URL query (same render-time adjustment pattern as above).
  const savedQueryKey = `${urlQueriesKey}\0${selectedNodeType ?? ''}\0${savedCanvasSearchQuery}\0${selectedPath}\0${ignoredSavedSearchPath ?? ''}`;
  const [prevSavedQueryKey, setPrevSavedQueryKey] = useState(savedQueryKey);
  if (prevSavedQueryKey !== savedQueryKey) {
    setPrevSavedQueryKey(savedQueryKey);
    if (!(urlSearchQueries.length > 0 || selectedNodeType !== 'canvas' || ignoredSavedSearchPath === selectedPath)) {
      setServerSearchQueries(savedCanvasSearchQuery ? [savedCanvasSearchQuery] : []);
      setCurrentPage(1);
    }
  }

  // Append a query to the stack (refine). Empty input is ignored; duplicates skipped.
  const handleBackendSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setIgnoredSavedSearchPath(null);
    setServerSearchQueries((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      syncQueriesToUrl(next);
      setCurrentPage(1);
      return next;
    });
  }, [syncQueriesToUrl, setIgnoredSavedSearchPath, setServerSearchQueries, setCurrentPage]);

  // Remove one query chip (or clear all when index < 0).
  const handleRemoveBackendQuery = useCallback((index: number) => {
    setServerSearchQueries((prev) => {
      const next = index < 0 ? [] : prev.filter((_, i) => i !== index);
      if (next.length === 0) { setIgnoredSavedSearchPath(selectedPath); }
      syncQueriesToUrl(next);
      setCurrentPage(1);
      return next;
    });
  }, [syncQueriesToUrl, selectedPath, setIgnoredSavedSearchPath, setServerSearchQueries, setCurrentPage]);

  const currentSearchQuery = serverSearchQueries.join(' ').trim();
  const canSaveChanges = Boolean(toolboxState.activeContextType)
    && (toolboxState.isDirty || currentSearchQuery !== (selectedNodeType === 'canvas' ? savedCanvasSearchQuery : (toolboxState.savedSearchQuery || '')));

  // Full tree JSON is expensive for directory trees. Load it once per tree and
  // refresh only when the backend tells us tree metadata changed.
  // No workspace addressed → no tree (guarded state adjustment during render).
  if (!workspaceName && tree !== null) setTree(null);
  useEffect(() => {
    let cancelled = false;
    if (!workspaceName) return;

    const loadTree = (force = false) => {
      if (force) invalidateWorkspaceTreeCache(workspaceName, selectedTreeName);
      getCachedWorkspaceTreeByName(workspaceName, selectedTreeName, { force })
        .then(res => { if (!cancelled) setTree(res); })
        .catch(() => { if (!cancelled) setTree(null); });
    };

    loadTree(false);

    const onTreeRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail as { workspaceName?: string; treeName?: string } | undefined;
      if (detail?.workspaceName && detail.workspaceName !== workspaceName) return;
      if (detail?.treeName && detail.treeName !== selectedTreeName) return;
      loadTree(true);
    };
    window.addEventListener('workspace:tree:refresh', onTreeRefresh);

    // Live-reload the tree when paths change in the DB from any client (CLI,
    // agents, the browser extension). The backend forwards synapsd tree events
    // over the workspace socket channel (subscribed by-id in the document
    // effect — tree events carry only workspaceId). Re-broadcast as the local
    // 'workspace:tree:refresh' so BOTH this page tree and the sidebar
    // (WorkspaceM2) reload. Debounced so a batch triggers a single refetch.
    let socketTimer: ReturnType<typeof setTimeout> | null = null;
    const reloadTreeSoon = () => {
      if (socketTimer) clearTimeout(socketTimer);
      socketTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName } }));
      }, 200);
    };
    const treeEvents = [
      'tree.path.inserted', 'tree.path.moved', 'tree.path.removed', 'tree.path.copied',
      'tree.layer.updated', 'tree.layer.merged', 'tree.layer.subtracted',
      'tree.recalculated', 'tree.created', 'tree.deleted', 'tree.renamed',
    ];
    treeEvents.forEach(ev => socketService.on(ev, reloadTreeSoon));

    return () => {
      cancelled = true;
      if (socketTimer) clearTimeout(socketTimer);
      window.removeEventListener('workspace:tree:refresh', onTreeRefresh);
      treeEvents.forEach(ev => socketService.off(ev, reloadTreeSoon));
    };
  }, [workspaceName, selectedTreeName]);

  // Not on a shareable canvas → no public-share state (guarded state adjustment
  // during render; the effect below only handles the fetch).
  const isShareableCanvas = Boolean(workspaceName) && selectedNodeType === 'canvas' && !isLayerView;
  if (!isShareableCanvas && publicCanvasShare !== null) setPublicCanvasShare(null);
  useEffect(() => {
    let cancelled = false;
    if (!workspaceName || selectedNodeType !== 'canvas' || isLayerView) return;

    getPublicCanvasShare(workspaceName, selectedPath, selectedTreeName)
      .then(share => { if (!cancelled) setPublicCanvasShare(share); })
      .catch(() => { if (!cancelled) setPublicCanvasShare(null); });

    return () => { cancelled = true; };
  }, [workspaceName, selectedPath, selectedTreeName, selectedNodeType, isLayerView]);

  const handleStartWorkspace = async () => {
    if (!workspace) return;
    setIsStartingWorkspace(true);
    try {
      const updated = await startWorkspace(workspace.name);
      setWorkspace(updated);
      showToast({ title: 'Success', description: 'Workspace started successfully' });
      window.dispatchEvent(new CustomEvent('workspaces:refresh'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start workspace';
      showToast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsStartingWorkspace(false);
    }
  };

  const handleRemoveDocument = async (documentId: number) => {
    if (!workspace) return;
    try {
      await removeWorkspaceDocuments(workspace.name, [documentId], selectedPath, [], selectedTreeName, selectedTreeType, { trashIfOrphaned: true });
      invalidateDocumentCache(workspace.name, selectedTreeName, selectedPath);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setDocumentsTotalCount(prev => Math.max(0, prev - 1));
      showToast({ title: 'Success', description: 'Document removed from workspace path.' });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to remove document', variant: 'destructive' });
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!workspace) return;
    try {
      await deleteWorkspaceDocuments(workspace.name, [documentId], selectedPath, [], selectedTreeName, selectedTreeType);
      invalidateDocumentCache(workspace.name, selectedTreeName, selectedPath);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setDocumentsTotalCount(prev => Math.max(0, prev - 1));
      showToast({ title: 'Success', description: 'Document deleted.' });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete document', variant: 'destructive' });
    }
  };

  const handleRemoveDocuments = async (documentIds: number[]) => {
    if (!workspace) return;
    try {
      await removeWorkspaceDocuments(workspace.name, documentIds, selectedPath, [], selectedTreeName, selectedTreeType, { trashIfOrphaned: true });
      invalidateDocumentCache(workspace.name, selectedTreeName, selectedPath);
      setDocuments(prev => prev.filter(doc => !documentIds.includes(doc.id)));
      setDocumentsTotalCount(prev => Math.max(0, prev - documentIds.length));
      showToast({ title: 'Success', description: `${documentIds.length} document(s) removed.` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to remove documents', variant: 'destructive' });
    }
  };

  const handleDeleteDocuments = async (documentIds: number[]) => {
    if (!workspace) return;
    try {
      await deleteWorkspaceDocuments(workspace.name, documentIds, selectedPath, [], selectedTreeName, selectedTreeType);
      invalidateDocumentCache(workspace.name, selectedTreeName, selectedPath);
      setDocuments(prev => prev.filter(doc => !documentIds.includes(doc.id)));
      setDocumentsTotalCount(prev => Math.max(0, prev - documentIds.length));
      showToast({ title: 'Success', description: `${documentIds.length} document(s) deleted.` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete documents', variant: 'destructive' });
    }
  };

  const handleDestroyDocument = async (documentId: number) => {
    if (!workspace) return;
    try {
      const result = await destroyWorkspaceDocuments(workspace.name, [documentId]);
      if (result.failed?.length) {
        showToast({ title: 'Error', description: result.failed[0].reason, variant: 'destructive' });
        return;
      }
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setDocumentsTotalCount(prev => Math.max(0, prev - 1));
      showToast({ title: 'Destroyed', description: 'Document removed from all backends.' });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to destroy document', variant: 'destructive' });
    }
  };

  const handleDestroyDocuments = async (documentIds: number[]) => {
    if (!workspace) return;
    try {
      const result = await destroyWorkspaceDocuments(workspace.name, documentIds);
      const succeededIds = new Set(result.successful?.filter(r => r.docDeleted).map(r => r.id) ?? []);
      setDocuments(prev => prev.filter(doc => !succeededIds.has(doc.id)));
      setDocumentsTotalCount(prev => Math.max(0, prev - succeededIds.size));
      const msg = [
        result.successful?.length ? `${result.successful.length} destroyed` : null,
        result.failed?.length ? `${result.failed.length} failed` : null,
      ].filter(Boolean).join(', ');
      showToast({ title: 'Done', description: msg || 'No documents destroyed' });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to destroy documents', variant: 'destructive' });
    }
  };

  const handleCopyDocuments = (documentIds: number[]) => {
    setClipboard({ documentIds, operation: 'copy', sourcePath: selectedPath, sourceTreeName: selectedTreeName });
    window.dispatchEvent(new CustomEvent('documents:clipboard', { detail: { documentIds, operation: 'copy' } }));
    showToast({ title: 'Copied', description: `${documentIds.length} document(s) copied to clipboard` });
  };

  const handleCutDocuments = (documentIds: number[]) => {
    setClipboard({ documentIds, operation: 'cut', sourcePath: selectedPath, sourceTreeName: selectedTreeName });
    window.dispatchEvent(new CustomEvent('documents:clipboard', { detail: { documentIds, operation: 'cut' } }));
    showToast({ title: 'Cut', description: `${documentIds.length} document(s) cut to clipboard` });
  };

  const selectedTreeType: 'context' | 'directory' = treeTypeForName(selectedTreeName);

  const handlePasteDocuments = async (path: string, documentIds: number[], options: DocumentPasteOptions = {}): Promise<boolean> => {
    if (!workspaceName) return false;
    // "Link to…" targets an explicit tree (options.target*); a plain paste
    // targets whatever tree is in view. The former lets you link documents out
    // of a read-only backends path into a context/directory tree.
    const targetTreeName = options.targetTreeName ?? selectedTreeName;
    const targetTreeType = options.targetTreeType ?? selectedTreeType;
    try {
      const success = await pasteDocumentsToWorkspacePath(workspaceName, path, documentIds, targetTreeName, targetTreeType);
      if (success) {
        invalidateDocumentCache(workspaceName, targetTreeName, path);
        const sourceTreeName = options.sourceTreeName || clipboard?.sourceTreeName;
        const sourcePath = options.sourcePath || clipboard?.sourcePath;
        const shouldMove = options.move || clipboard?.operation === 'cut';
        if (shouldMove && sourcePath && sourceTreeName) {
          const sourceTreeType: 'context' | 'directory' = treeTypeForName(sourceTreeName);
          await removeWorkspaceDocuments(workspaceName, documentIds, sourcePath, [], sourceTreeName, sourceTreeType);
          invalidateDocumentCache(workspaceName, sourceTreeName, sourcePath);
          window.dispatchEvent(new CustomEvent('workspace:documents:refresh', {
            detail: { workspaceName, path: sourcePath, treeName: sourceTreeName },
          }));
        }
        await fetchDocuments();
        setClipboard(null);
        window.dispatchEvent(new CustomEvent('documents:clipboard', { detail: null }));
        window.dispatchEvent(new CustomEvent('workspace:documents:refresh', {
          detail: { workspaceName, path, treeName: targetTreeName },
        }));
        showToast({ title: 'Success', description: `${documentIds.length} document(s) ${options.move || clipboard?.operation === 'cut' ? 'moved' : 'pasted'} to "${path}"` });
      }
      return success;
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to paste documents', variant: 'destructive' });
      return false;
    }
  };

  const handleImportDocuments = async (docs: Record<string, unknown>[], contextPath: string): Promise<boolean> => {
    if (!workspaceName) return false;
    try {
      const ids = await importDocumentsToWorkspacePath(workspaceName, contextPath, docs, selectedTreeName, selectedTreeType);
      const success = ids.length > 0;
      if (success) {
        window.dispatchEvent(new CustomEvent('workspace:documents:refresh', {
          detail: { workspaceName, path: contextPath, treeName: selectedTreeName },
        }));
        showToast({ title: 'Success', description: `Imported ${docs.length} document(s) to "${contextPath}"` });
      }
      return success;
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to import documents', variant: 'destructive' });
      return false;
    }
  };

  const handlePurgeDocuments = async () => {
    if (!workspace || documentsTotalCount === 0) return;
    const confirmation = window.prompt(`Type PURGE to permanently delete all ${documentsTotalCount} matching documents.`);
    if (confirmation !== 'PURGE') return;
    try {
      const result = await purgeWorkspaceDocuments(workspace.name, selectedPath, [], [], {}, selectedTreeName);
      await fetchDocuments();
      showToast({ title: 'Success', description: `${result.deleted} document(s) purged.` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to purge documents', variant: 'destructive' });
    }
  };

  const handleSaveAsCanvas = () => openCreateCanvas(selectedPath, true);

  const handleConfirmSaveAsCanvas = async () => {
    if (!workspaceName || !createCanvas || !saveAsCanvasName.trim()) return;
    setSaveAsCanvasLoading(true);
    try {
      const name = saveAsCanvasName.trim();
      const parentPath = createCanvas.parentPath;
      const path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
      await createWorkspaceCanvas(workspaceName, path, selectedTreeName, createCanvas.captureView ? {
        metadata: { toolbox: toolboxState.filters },
        querySpec: {
          features: toolboxState.filters.features,
          filters: [...buildDatetimeFilters(toolboxState.filters.timeline), ...buildGeoFilters(toolboxState.filters.geo)],
          // Canvas querySpec holds a single query; a refine stack collapses to a
          // combined search string on save (reload runs it as one query).
          query: currentSearchQuery || undefined,
          sort: toolboxState.filters.sort?.sortBy ? toolboxState.filters.sort : null,
        },
      } : {});
      setCreateCanvas(null);
      // Refresh the local tree before navigating so the new node resolves as a
      // canvas — otherwise the page renders generic context/directory controls
      // until the async tree:refresh lands.
      invalidateWorkspaceTreeCache(workspaceName!, selectedTreeName);
      try {
        const res = await getCachedWorkspaceTreeByName(workspaceName!, selectedTreeName, { force: true });
        setTree(res);
      } catch { /* falls back to the tree:refresh event below */ }
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName } }));
      navigate(buildWorkspaceUrl(workspaceName!, path, selectedTreeName));
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create canvas', variant: 'destructive' });
    } finally {
      setSaveAsCanvasLoading(false);
    }
  };

  const handleShareCanvas = async () => {
    if (!workspaceName || selectedNodeType !== 'canvas') return;
    setShareCanvasLoading(true);
    try {
      const share = publicCanvasShare || await createPublicCanvasShare(workspaceName, selectedPath, selectedTreeName);
      setPublicCanvasShare(share);
      const url = `${window.location.origin}${share.url}`;
      await navigator.clipboard?.writeText(url);
      showToast({ title: 'Public canvas link copied', description: url });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to share canvas', variant: 'destructive' });
    } finally {
      setShareCanvasLoading(false);
    }
  };

  const handleUnshareCanvas = async () => {
    if (!publicCanvasShare) return;
    setShareCanvasLoading(true);
    try {
      await deletePublicCanvasShare(publicCanvasShare.code);
      setPublicCanvasShare(null);
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName, treeName: selectedTreeName } }));
      showToast({ title: 'Canvas unshared', description: 'The public link no longer works.' });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to unshare canvas', variant: 'destructive' });
    } finally {
      setShareCanvasLoading(false);
    }
  };

  const handleDeleteCanvas = async () => {
    if (!workspaceName || selectedNodeType !== 'canvas' || selectedPath === '/') return;

    const name = canvasInfo?.label || selectedPath.split('/').pop() || 'canvas';
    const sharedHint = publicCanvasShare ? ' Its public link will stop working.' : '';
    if (!window.confirm(`Delete canvas "${name}"? This cannot be undone.${sharedHint}`)) return;

    setDeleteCanvasLoading(true);
    try {
      if (publicCanvasShare) {
        await deletePublicCanvasShare(publicCanvasShare.code);
        setPublicCanvasShare(null);
      } else if (selectedNode?.locked) {
        showToast({ title: 'Canvas is locked', description: 'Unlock it before deleting.', variant: 'destructive' });
        return;
      }

      await removeWorkspacePath(workspaceName, selectedPath, false, selectedTreeName);

      const segments = selectedPath.split('/').filter(Boolean);
      segments.pop();
      const parentPath = segments.length ? `/${segments.join('/')}` : '/';

      window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName, treeName: selectedTreeName } }));
      navigate(buildWorkspaceUrl(workspaceName, parentPath, selectedTreeName));
      showToast({ title: 'Canvas deleted', description: `"${name}" was removed.` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete canvas', variant: 'destructive' });
    } finally {
      setDeleteCanvasLoading(false);
    }
  };

  // Midnight-Commander transfer: move the focused pane's selection into the
  // other pane's path/tree in one keystroke (F5 = copy/link, F6 = move).
  const transferBetweenPanes = useCallback(async (move: boolean) => {
    if (!workspaceName || !sidePane) return;
    const left: WorkspaceSidePane = { treeName: selectedTreeName, path: selectedPath };
    const source = focusedPane === 'left' ? left : sidePane;
    const target = focusedPane === 'left' ? sidePane : left;
    const ids = focusedPane === 'left' ? leftSelection : rightSelection;
    if (ids.length === 0) {
      showToast({ title: 'Nothing selected', description: 'Tick documents in the focused pane first.' });
      return;
    }
    const targetType: 'context' | 'directory' = treeTypeForName(target.treeName);
    try {
      const ok = await pasteDocumentsToWorkspacePath(workspaceName, target.path, ids, target.treeName, targetType);
      if (!ok) return;
      invalidateDocumentCache(workspaceName, target.treeName, target.path);
      if (move) {
        const sourceType: 'context' | 'directory' = treeTypeForName(source.treeName);
        await removeWorkspaceDocuments(workspaceName, ids, source.path, [], source.treeName, sourceType);
        invalidateDocumentCache(workspaceName, source.treeName, source.path);
      }
      [source, target].forEach(p => window.dispatchEvent(new CustomEvent('workspace:documents:refresh', {
        detail: { workspaceName, path: p.path, treeName: p.treeName },
      })));
      showToast({ title: move ? 'Moved' : 'Copied', description: `${ids.length} document(s) → "${target.path}"` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Transfer failed', variant: 'destructive' });
    }
  }, [workspaceName, sidePane, focusedPane, selectedTreeName, selectedPath, leftSelection, rightSelection, showToast]);

  useEffect(() => {
    if (!sidePane) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'F5' && e.key !== 'F6') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      transferBetweenPanes(e.key === 'F6');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidePane, transferBetweenPanes]);

  if (isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Workspace not found.</div>;
  }

  const showCanvasGrid = selectedNodeType === 'canvas' && !isLayerView && !!selectedNode;

  const currentCanvas = (
    <DefaultCanvas
      urlType={isLayerView ? (selectedTreeName === 'directory' ? 'directory-layer' : 'context-layer') : (selectedNodeType === 'canvas' ? 'canvas' : selectedTreeName === 'directory' ? 'directory' : 'context')}
      urlDisplay={urlDisplay}
      contextPath={selectedPath}
      treeName={selectedTreeName}
      workspaceId={workspace.name}
      documents={shownDocuments}
      isLoading={isLoadingDocuments}
      totalCount={listedTotalCount}
      currentPage={currentPage}
      pageSize={pageSize}
      onPageChange={setCurrentPage}
      onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
      onRemoveDocument={selectedPath !== '/' ? handleRemoveDocument : undefined}
      onDeleteDocument={handleDeleteDocument}
      onDestroyDocument={handleDestroyDocument}
      onRemoveDocuments={selectedPath !== '/' ? handleRemoveDocuments : undefined}
      onDeleteDocuments={handleDeleteDocuments}
      onDestroyDocuments={handleDestroyDocuments}
      onCopyDocuments={handleCopyDocuments}
      onCutDocuments={handleCutDocuments}
      onPasteDocuments={handlePasteDocuments}
      onImportDocuments={handleImportDocuments}
      onSelectionChange={setLeftSelection}
      selectedCount={leftSelection.length}
      onUrlClick={() => openM2Drawer('workspaces', 'detail', workspaceName ?? null)}
      onUrlSubmit={(p) => navigate(buildWorkspaceUrl(workspaceName!, sanitizeUrlPath('/' + p), selectedTreeName))}
      scope={docScope}
      onScopeChange={setDocScope}
      pastedDocumentIds={clipboard?.documentIds}
      linkTree={tree}
      onPurgeDocuments={isBackendsPath ? undefined : handlePurgeDocuments}
      disablePurgeDocuments={false}
      canvasInfo={canvasInfo ?? undefined}
      isCanvasPinned={isCanvasPinned}
      onTogglePinCanvas={pinAddress ? handleTogglePin : undefined}
      onSaveAsCanvas={tree && selectedNodeType !== 'canvas' && !isLayerView && !isBackendsPath ? handleSaveAsCanvas : undefined}
      onShareCanvas={selectedNodeType === 'canvas' && !isLayerView ? handleShareCanvas : undefined}
      onUnshareCanvas={publicCanvasShare ? handleUnshareCanvas : undefined}
      onDeleteCanvas={selectedNodeType === 'canvas' && !isLayerView ? handleDeleteCanvas : undefined}
      isSharingCanvas={shareCanvasLoading}
      isDeletingCanvas={deleteCanvasLoading}
      isCanvasShared={!!publicCanvasShare}
      isCanvasLocked={!!selectedNode?.locked}
      backendSearchQueries={serverSearchQueries}
      onBackendSearch={handleBackendSearch}
      serverSort={toolboxState.filters.sort}
      onServerSortChange={setSort}
      onRemoveBackendQuery={handleRemoveBackendQuery}
      canSaveChanges={canSaveChanges}
      isSavingChanges={toolboxState.isSaving}
      onSaveChanges={saveFilters}
      contentBanner={queryDebug && queryDebugData
        ? <QueryDebugPanel data={queryDebugData} className="mb-3" />
        : null}
    >
      {/* Single expression on purpose — see the children guard in DefaultCanvas:
          an array of children is truthy even when every element is false. */}
      {showCanvasGrid && selectedNode ? (
        <CanvasGrid
          workspaceId={workspace.name}
          treeName={selectedTreeName}
          path={selectedPath}
          layerId={selectedNode.id}
          querySpec={selectedNode.querySpec}
          metadata={selectedNode.metadata}
          isLocked={!!selectedNode.locked}
          // Only override the widget fetch while previewing dirty toolbox
          // filters; a clean canvas keeps the default server-composed read.
          fetchDocuments={toolboxState.isDirty ? canvasFetchDocuments : undefined}
        />
      ) : !isBackendsPath && activeContentView.kind === 'columns' ? (
        <SchemaColumnsBoard
          documents={shownDocuments}
          workspaceId={workspace.name}
          columns={activeContentView.columns ?? []}
          onColumnsChange={(columns) => saveContentViews(
            contentViews.map(v => (v.id === activeContentView.id ? { ...v, columns } : v)),
          )}
        />
      ) : null}
    </DefaultCanvas>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Compact workspace status bar — bottom border carries the workspace
          color as the primary accent; near-white colors fall back to the
          theme border so the accent never vanishes on the light background. */}
      <div
        className="shrink-0 border-b"
        style={visibleAccentColor(workspace.color)
          ? { borderBottom: `3px solid ${visibleAccentColor(workspace.color)}` }
          : { borderBottomWidth: 3 }}
      >
        {/* Mobile: browser order — tabs first, then the title/controls row,
            then the URL bar (rendered by DefaultCanvas below). */}
        {!showCanvasGrid && !isBackendsPath && nodeForViews && (
          <div className="px-2 pt-1.5 sm:hidden">
            <ContentViewTabs
              views={contentViews}
              activeId={activeContentViewId}
              onSelect={selectContentView}
              onSave={saveContentViews}
              readOnly={!!nodeForViews.locked && selectedPath !== '/'}
            />
          </div>
        )}
        <div className="flex h-12 items-center gap-3 px-4">
        {/* Same gesture as a settings page: reopen the tree panel on mobile
            (it closed on navigation), step up to the list on desktop. */}
        <SectionBackButton
          title={isMobile ? 'Back to workspace tree' : 'Back to workspaces'}
          onBack={() => (isMobile
            ? openM2Drawer('workspaces', 'detail', workspace.name)
            : navigate('/workspaces'))}
        />
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            workspace.status === 'active' ? 'bg-success' :
            workspace.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground'
          }`}
          title={workspace.status}
        />
        <button
          type="button"
          onClick={() => openM2Drawer('workspaces', 'detail', workspace.name)}
          title="Browse workspace tree"
          className="flex min-w-0 items-center gap-1.5 truncate rounded px-1 -mx-1 text-left text-sm font-medium transition-colors hover:bg-accent"
        >
          <Icon
            icon={workspace.icon || DEFAULT_WORKSPACE_ICON}
            width={16}
            height={16}
            color={visibleAccentColor(workspace.color)}
            className={cn('shrink-0', !visibleAccentColor(workspace.color) && 'text-muted-foreground')}
          />
          <span className="truncate">{workspace.label || workspace.name}</span>
        </button>
        {/* Desktop: browser-style, the view tabs ride the title row. On
            mobile they render as their own top row above (max-sm:hidden). */}
        {!showCanvasGrid && !isBackendsPath && nodeForViews ? (
          <>
            <ContentViewTabs
              className="min-w-0 flex-1 max-sm:hidden"
              views={contentViews}
              activeId={activeContentViewId}
              onSelect={selectContentView}
              onSave={saveContentViews}
              readOnly={!!nodeForViews.locked && selectedPath !== '/'}
            />
            <div className="flex-1 sm:hidden" />
          </>
        ) : (
          <div className="flex-1" />
        )}
        {/* Backend mirrors: show only docs never filed into another tree
            (safe-to-purge candidates on the backend). */}
        {backendTarget && (
          <button
            onClick={() => { setUnfiledOnly(!unfiledOnly); setCurrentPage(1); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-xs border rounded-md transition-colors',
              unfiledOnly
                ? 'bg-warning/15 border-warning/40 text-warning'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground',
            )}
            title="Show only documents not filed into any context/directory tree — safe to purge from the backend"
          >
            Unfiled only
          </button>
        )}
        {/* Filtering earns the header slot; stopping a workspace is a rarer
            action that stays available on the workspace list rows (M1). */}
        {workspace.status === 'active' ? (
          <button
            onClick={() => toggleView('tools')}
            className={cn(
              'flex h-7 w-7 items-center justify-center border rounded-md transition-colors',
              // Filters narrow every tree read - keep the button colored while
              // any are active so an empty folder is explainable at a glance.
              hasActiveFilters
                ? 'border-info bg-info text-info-foreground hover:bg-info/90'
                : toolboxState.t1Open && toolboxState.t1View === 'tools'
                  ? 'bg-accent text-foreground'
                  : 'hover:bg-accent text-muted-foreground hover:text-foreground',
            )}
            aria-label="Filters"
            title={hasActiveFilters ? 'Toolbox filters are active and narrow this view' : 'Open the toolbox filters'}
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={handleStartWorkspace}
            disabled={isStartingWorkspace}
            className="px-3 py-1 text-xs border rounded-md hover:bg-accent disabled:opacity-50"
          >
            {isStartingWorkspace ? 'Starting…' : 'Start'}
          </button>
        )}
        <CloseSectionButton />
        </div>
      </div>

      {createCanvas && (
        <div className="shrink-0 px-2 pt-2">
          <FormPanel title="New canvas" onClose={() => setCreateCanvas(null)}>
            <form
              onSubmit={(e) => { e.preventDefault(); handleConfirmSaveAsCanvas(); }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="canvas-name" className="mb-1 block text-sm font-medium">Name</label>
                  <input
                    id="canvas-name"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Canvas name…"
                    value={saveAsCanvasName}
                    onChange={e => setSaveAsCanvasName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setCreateCanvas(null); }}
                    autoFocus
                  />
                </div>
                <div>
                  <span className="mb-1 block text-sm font-medium">Parent path</span>
                  <div className="flex h-10 items-center rounded-md bg-muted px-3 font-mono text-sm text-muted-foreground">
                    {createCanvas.parentPath === '/' ? '/' : createCanvas.parentPath}
                  </div>
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={createCanvas.captureView}
                  onChange={e => setCreateCanvas({ ...createCanvas, captureView: e.target.checked })}
                />
                <span>
                  Capture the current view
                  <span className="block text-xs text-muted-foreground">
                    Freezes the active filters, search and sort into the canvas.
                  </span>
                </span>
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={!saveAsCanvasName.trim() || saveAsCanvasLoading}>
                  {saveAsCanvasLoading ? 'Creating…' : 'Create canvas'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setCreateCanvas(null)}>Cancel</Button>
              </div>
            </form>
          </FormPanel>
        </div>
      )}

      {/* Canvas — dual-pane is pure local focus; the left pane stays URL-bound,
          the right is self-contained, so switching focus never refetches. */}
      <div className="flex-1 min-h-0 flex gap-2 p-2 bg-muted/20">
        <div
          className={cn(
            'flex-1 min-w-0 rounded-lg border bg-background overflow-hidden',
            sidePane && (focusedPane === 'left' ? 'ring-2 ring-primary' : 'ring-1 ring-primary/20'),
          )}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button,input,textarea,select,a')) return;
            setFocusedPane('left');
          }}
        >
          {currentCanvas}
        </div>
        {sidePane && workspaceName && (
          <SideWorkspaceCanvas
            workspaceName={workspaceName}
            pane={sidePane}
            isFocused={focusedPane === 'right'}
            clipboard={clipboard}
            setClipboard={setClipboard}
            onFocus={() => setFocusedPane('right')}
            onSelectionChange={setRightSelection}
            onClose={() => {
              setSidePane(null);
              setFocusedPane('left');
              setRightSelection([]);
            }}
          />
        )}
      </div>

    </div>
  );
}

function findTreeNode(root: TreeNode | null, path: string): TreeNode | null {
  if (!root || path === '/') return root;
  let node: TreeNode | null = root;
  for (const segment of path.split('/').filter(Boolean)) {
    node = node?.children?.find(child => child.name === segment) ?? null;
    if (!node) return null;
  }
  return node;
}

function SideWorkspaceCanvas({
  workspaceName,
  pane,
  isFocused = false,
  clipboard,
  setClipboard,
  onFocus,
  onSelectionChange,
  onClose,
}: {
  workspaceName: string;
  pane: WorkspaceSidePane;
  isFocused?: boolean;
  clipboard: WorkspaceClipboard | null;
  setClipboard: (clipboard: WorkspaceClipboard | null) => void;
  onFocus: () => void;
  onSelectionChange?: (documentIds: number[]) => void;
  onClose?: () => void;
}) {
  const { showToast } = useToast();
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const treeType: 'context' | 'directory' = treeTypeForName(pane.treeName);
  const selectedNode = findTreeNode(tree, pane.path);
  const isCanvas = selectedNode?.type === 'canvas';
  const urlDisplay = `${workspaceName}://${pane.path === '/' ? '' : pane.path.replace(/^\//, '')}`;

  const fetchPaneDocuments = useCallback(async () => {
    const cacheKey = documentKey(workspaceName, pane.treeName, pane.path, currentPage, pageSize, '', '');
    const cached = documentCache.get(cacheKey);
    if (cached) {
      setDocuments(cached.documents);
      setTotalCount(cached.totalCount);
      return;
    }
    setIsLoading(true);
    try {
      const response = await getWorkspaceDocuments(workspaceName, pane.path, [], {
        limit: pageSize,
        page: currentPage,
        treeName: pane.treeName,
        treeType,
      });
      const nextDocuments = (response.payload as Document[]) || [];
      const nextTotalCount = response.totalCount || response.count || 0;
      setDocuments(nextDocuments);
      setTotalCount(nextTotalCount);
      documentCache.set(cacheKey, { documents: nextDocuments, totalCount: nextTotalCount });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to fetch side pane documents', variant: 'destructive' });
      setDocuments([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceName, pane.path, pane.treeName, treeType, pageSize, currentPage, showToast]);

  useEffect(() => {
    let cancelled = false;
    const loadTree = (force = false) => {
      if (force) invalidateWorkspaceTreeCache(workspaceName, pane.treeName);
      getCachedWorkspaceTreeByName(workspaceName, pane.treeName, { force })
        .then(res => { if (!cancelled) setTree(res); })
        .catch(() => { if (!cancelled) setTree(null); });
    };

    loadTree(false);

    const onTreeRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as { workspaceName?: string; treeName?: string } | undefined;
      if (detail?.workspaceName && detail.workspaceName !== workspaceName) return;
      if (detail?.treeName && detail.treeName !== pane.treeName) return;
      loadTree(true);
    };

    window.addEventListener('workspace:tree:refresh', onTreeRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('workspace:tree:refresh', onTreeRefresh);
    };
  }, [workspaceName, pane.treeName]);

  useEffect(() => {
    const run = () => fetchPaneDocuments();
    void run();
  }, [fetchPaneDocuments]);

  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as { workspaceName?: string; path?: string; treeName?: string } | undefined;
      if (detail?.workspaceName && detail.workspaceName !== workspaceName) return;
      invalidateRefreshTarget(workspaceName, detail);
      if (detail?.treeName && detail.treeName !== pane.treeName) return;
      if (detail?.path && detail.path !== pane.path) return;
      invalidateDocumentCache(workspaceName, pane.treeName, pane.path);
      fetchPaneDocuments();
    };
    window.addEventListener('workspace:documents:refresh', onRefresh);
    return () => window.removeEventListener('workspace:documents:refresh', onRefresh);
  }, [fetchPaneDocuments, workspaceName, pane.treeName, pane.path]);

  const pasteDocuments = useCallback(async (path: string, documentIds: number[], options: DocumentPasteOptions = {}) => {
    // "Link to…" targets an explicit tree; a plain paste targets this pane's tree.
    const targetTreeName = options.targetTreeName ?? pane.treeName;
    const targetTreeType = options.targetTreeType ?? treeType;
    try {
      const success = await pasteDocumentsToWorkspacePath(workspaceName, path, documentIds, targetTreeName, targetTreeType);
      if (success) {
        invalidateDocumentCache(workspaceName, targetTreeName, path);
        const sourcePath = options.sourcePath || clipboard?.sourcePath;
        const sourceTreeName = options.sourceTreeName || clipboard?.sourceTreeName;
        const shouldMove = options.move || clipboard?.operation === 'cut';
        if (shouldMove && sourcePath && sourceTreeName) {
          const sourceTreeType: 'context' | 'directory' = treeTypeForName(sourceTreeName);
          await removeWorkspaceDocuments(workspaceName, documentIds, sourcePath, [], sourceTreeName, sourceTreeType);
          invalidateDocumentCache(workspaceName, sourceTreeName, sourcePath);
          window.dispatchEvent(new CustomEvent('workspace:documents:refresh', {
            detail: { workspaceName, path: sourcePath, treeName: sourceTreeName },
          }));
        }
        setClipboard(null);
        await fetchPaneDocuments();
        window.dispatchEvent(new CustomEvent('workspace:documents:refresh', {
          detail: { workspaceName, path, treeName: targetTreeName },
        }));
      }
      return success;
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to paste documents', variant: 'destructive' });
      return false;
    }
  }, [workspaceName, pane.treeName, treeType, fetchPaneDocuments, showToast, clipboard, setClipboard]);

  // Remove / delete / destroy, scoped to this pane's own path + tree.
  const refreshPane = useCallback(() => {
    invalidateDocumentCache(workspaceName, pane.treeName, pane.path);
    fetchPaneDocuments();
  }, [workspaceName, pane.treeName, pane.path, fetchPaneDocuments]);

  const removeDocs = useCallback(async (ids: number[]) => {
    try {
      await removeWorkspaceDocuments(workspaceName, ids, pane.path, [], pane.treeName, treeType);
      refreshPane();
      showToast({ title: 'Removed', description: `${ids.length} document(s) removed from "${pane.path}"` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to remove documents', variant: 'destructive' });
    }
  }, [workspaceName, pane.path, pane.treeName, treeType, refreshPane, showToast]);

  const deleteDocs = useCallback(async (ids: number[]) => {
    try {
      await deleteWorkspaceDocuments(workspaceName, ids, pane.path, [], pane.treeName, treeType);
      refreshPane();
      showToast({ title: 'Deleted', description: `${ids.length} document(s) deleted.` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete documents', variant: 'destructive' });
    }
  }, [workspaceName, pane.path, pane.treeName, treeType, refreshPane, showToast]);

  const destroyDocs = useCallback(async (ids: number[]) => {
    try {
      const result = await destroyWorkspaceDocuments(workspaceName, ids);
      if (result.failed?.length && !result.successful?.length) {
        showToast({ title: 'Error', description: result.failed[0].reason, variant: 'destructive' });
        return;
      }
      refreshPane();
      showToast({ title: 'Destroyed', description: `${result.successful?.length ?? ids.length} document(s) removed from all backends.` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to destroy documents', variant: 'destructive' });
    }
  }, [workspaceName, refreshPane, showToast]);

  return (
    <div
      className={cn(
        'relative flex-1 min-w-0 rounded-lg border bg-background overflow-hidden',
        isFocused ? 'ring-2 ring-primary' : 'ring-1 ring-primary/20',
      )}
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest('button,input,textarea,select,a')) return;
        onFocus();
      }}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 px-2 py-1 text-xs rounded-md border bg-background/90 hover:bg-accent"
        >
          Close
        </button>
      )}
      <DefaultCanvas
        urlType={isCanvas ? 'canvas' : treeType}
        urlDisplay={urlDisplay}
        contextPath={pane.path}
        treeName={pane.treeName}
        workspaceId={workspaceName}
        documents={documents}
        isLoading={isLoading}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        onRemoveDocument={pane.path !== '/' ? (id) => removeDocs([id]) : undefined}
        onRemoveDocuments={pane.path !== '/' ? removeDocs : undefined}
        onDeleteDocument={(id) => deleteDocs([id])}
        onDeleteDocuments={deleteDocs}
        onDestroyDocument={(id) => destroyDocs([id])}
        onDestroyDocuments={destroyDocs}
        onCopyDocuments={(documentIds) => {
          setClipboard({ documentIds, operation: 'copy', sourcePath: pane.path, sourceTreeName: pane.treeName });
          window.dispatchEvent(new CustomEvent('documents:clipboard', { detail: { documentIds, operation: 'copy' } }));
        }}
        onCutDocuments={(documentIds) => {
          setClipboard({ documentIds, operation: 'cut', sourcePath: pane.path, sourceTreeName: pane.treeName });
          window.dispatchEvent(new CustomEvent('documents:clipboard', { detail: { documentIds, operation: 'cut' } }));
        }}
        onPasteDocuments={pasteDocuments}
        onSelectionChange={onSelectionChange}
        pastedDocumentIds={clipboard?.documentIds}
        linkTree={tree}
        canvasInfo={isCanvas ? {
          label: selectedNode?.label,
          description: selectedNode?.description,
          color: selectedNode?.color,
        } : undefined}
      />
    </div>
  );
}

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';
import { useToast } from '@/components/ui/toast-container';
import { DefaultCanvas } from '@/components/canvas/DefaultCanvas';
import type { CanvasInfo } from '@/components/canvas/DefaultCanvas';
import { CanvasGrid } from '@/components/canvas/CanvasGrid';
import type { DocumentPasteOptions } from '@/components/common/document-list';
import {
  getWorkspaceDocuments,
  getWorkspaceLayerDocuments,
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
} from '@/services/workspace';
import { Document, TreeNode, buildDatetimeFilters } from '@/types/workspace';
import { sanitizeUrlPath, buildWorkspaceUrl } from '@/utils/url-params';
import { useToolbox } from '@/components/toolbox/toolbox-context';
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

export default function WorkspaceDetailPage() {
  const { workspaceName, treeName, '*': pathSplat } = useParams<{ workspaceName: string; treeName?: string; '*'?: string }>();
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
  // 'path' scopes to the selected tree path; 'workspace' lists every document.
  const [docScope, setDocScope] = useState<'path' | 'workspace'>('path');
  const [isStartingWorkspace, setIsStartingWorkspace] = useState(false);

  const [clipboard, setClipboard] = useState<WorkspaceClipboard | null>(null);

  const [saveAsCanvasOpen, setSaveAsCanvasOpen] = useState(false);
  const [saveAsCanvasName, setSaveAsCanvasName] = useState('');
  const [saveAsCanvasLoading, setSaveAsCanvasLoading] = useState(false);
  const [shareCanvasLoading, setShareCanvasLoading] = useState(false);
  const [deleteCanvasLoading, setDeleteCanvasLoading] = useState(false);
  const [publicCanvasShare, setPublicCanvasShare] = useState<{ code: string; url: string } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [serverSearchQueries, setServerSearchQueries] = useState<string[]>(urlSearchQueries);
  const [ignoredSavedSearchPath, setIgnoredSavedSearchPath] = useState<string | null>(null);

  const { state: toolboxState, saveFilters, toggleView } = useToolbox();
  const tbAllOf = toolboxState.filters.features.allOf;
  const tbAnyOf = toolboxState.filters.features.anyOf;
  const tbNoneOf = toolboxState.filters.features.noneOf;
  const tbDatetimeFilters = buildDatetimeFilters(toolboxState.filters.timeline);
  const tbFiltersKey = JSON.stringify({ a: tbAllOf, b: tbAnyOf, c: tbNoneOf, d: tbDatetimeFilters });

  // Path and tree from URL segments; UI state from query params
  const selectedPath = sanitizeUrlPath('/' + (pathSplat ?? ''));
  const selectedTreeName = treeName ?? DEFAULT_WORKSPACE_TREE_NAME;
  // Bulk "Purge All" is hidden in the /.incoming subtree: incoming docs are
  // purged via the tree's "Remove and purge documents" (folder-scoped) or the
  // per-doc Delete/Destroy context menu. The toolbar button queries the context
  // tree and would no-op on these directory-tree paths anyway.
  const isIncomingPath = selectedTreeName === 'directory'
    && (selectedPath === '/.incoming' || selectedPath.startsWith('/.incoming/'));

  const isLayerView = searchParams.get('layer') === '1';
  const selectedLayerId = searchParams.get('layerId') || null;
  // Leaf node type / canvas id are derived from the path against the loaded tree —
  // we do not encode them in the URL. The path is the source of truth, mirroring
  // the REST API. See `feedback_url_design` memory for rationale.
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [sidePane, setSidePane] = useState<WorkspaceSidePane | null>(null);
  const [focusedPane, setFocusedPane] = useState<FocusedPane>('left');
  const [leftSelection, setLeftSelection] = useState<number[]>([]);
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
  const savedCanvasSearchQuery = selectedNodeType === 'canvas' && typeof selectedNode?.querySpec?.query === 'string'
    ? selectedNode.querySpec.query
    : '';
  const canvasInfo: CanvasInfo | null = selectedNodeType === 'canvas'
    ? { label: selectedNode?.label, description: selectedNode?.description, color: selectedNode?.color }
    : null;
  const urlDisplay = workspaceName
    ? `${workspaceName}://${selectedPath === '/' ? '' : selectedPath.replace(/^\//, '')}`
    : '';

  // Fetch workspace details
  useEffect(() => {
    if (!workspaceName) return;

    const fetchWorkspace = async () => {
      setIsLoadingWorkspace(true);
      try {
        const response = await api.get<ApiResponse<{ workspace: Workspace } | Workspace>>(
          `${API_ROUTES.workspaces}/${workspaceName}`
        );
        let ws: Workspace;
        if (response.payload && 'workspace' in response.payload) {
          ws = response.payload.workspace as Workspace;
        } else {
          ws = response.payload as Workspace;
        }
        setWorkspace(ws);

        if (ws.status !== 'active') {
          try {
            const started = await startWorkspace(ws.name);
            setWorkspace(started);
          } catch {
            // non-fatal: workspace may start later
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to fetch workspace ${workspaceName}`;
        showToast({ title: 'Error', description: message, variant: 'destructive' });
        setWorkspace(null);
      } finally {
        setIsLoadingWorkspace(false);
      }
    };

    fetchWorkspace();
  }, [workspaceName]);

  // Fetch documents when path, tree, pagination, or workspace status changes
  const fetchDocuments = useCallback(async (opts?: { silent?: boolean }) => {
    if (!workspaceName) return;
    const cacheKey = documentKey(workspaceName, selectedTreeName, selectedPath, currentPage, pageSize, serverSearchQueries.join('␟'), tbFiltersKey, (isLayerView && selectedLayerId) ? selectedLayerId : '', docScope);
    const cached = documentCache.get(cacheKey);
    if (cached) {
      setDocuments(cached.documents);
      setDocumentsTotalCount(cached.totalCount);
      return;
    }
    // Background refreshes (socket events, post-mutation reconcile) update the
    // list in place. Skipping the loading spinner keeps the list from blinking.
    if (!opts?.silent) setIsLoadingDocuments(true);
    try {
      let response;
      if (isLayerView && selectedLayerId && docScope !== 'workspace') {
        response = await getWorkspaceLayerDocuments(workspaceName, selectedTreeName, selectedLayerId, {
          limit: pageSize,
          page: currentPage,
          queries: serverSearchQueries,
          allOf: tbAllOf,
          anyOf: tbAnyOf,
          noneOf: tbNoneOf,
          filters: tbDatetimeFilters,
        });
      } else {
        const selectedTreeType: 'context' | 'directory' = selectedTreeName === 'directory' ? 'directory' : 'context';
        response = await getWorkspaceDocuments(workspaceName, selectedPath, tbAllOf, {
          limit: pageSize,
          page: currentPage,
          treeName: selectedTreeName,
          treeType: selectedTreeType,
          queries: serverSearchQueries,
          anyOf: tbAnyOf,
          noneOf: tbNoneOf,
          filters: tbDatetimeFilters,
          scope: docScope,
        });
      }
      const nextDocuments = (response.payload as Document[]) || [];
      const nextTotalCount = response.totalCount || response.count || 0;
      setDocuments(nextDocuments);
      setDocumentsTotalCount(nextTotalCount);
      documentCache.set(cacheKey, { documents: nextDocuments, totalCount: nextTotalCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch documents';
      showToast({ title: 'Error', description: message, variant: 'destructive' });
      setDocuments([]);
      setDocumentsTotalCount(0);
    } finally {
      if (!opts?.silent) setIsLoadingDocuments(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceName, selectedPath, selectedTreeName, selectedLayerId, isLayerView, currentPage, pageSize, workspace?.status, serverSearchQueries, tbFiltersKey, docScope]);

  useEffect(() => {
    fetchDocuments();
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
  useEffect(() => {
    if (!workspaceName || !workspace) return;
    const channels = [workspace.name, workspace.id].filter(Boolean).map(id => `workspace:${id}`);
    const subscribe = () => channels.forEach(ch => socketService.emit('subscribe', { channel: ch }));
    subscribe();
    const offConnect = socketService.on('connect', subscribe);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (workspaceName) invalidateDocumentCache(workspaceName, selectedTreeName, selectedPath);
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
  }, [workspaceName, workspace?.id, workspace?.name, selectedTreeName, selectedPath, fetchDocuments]);

  useEffect(() => {
    setCurrentPage(1);
    setIgnoredSavedSearchPath(null);
  }, [selectedPath, selectedTreeName, selectedLayerId, docScope]);

  // Leaving whole-workspace scope is implicit when the user navigates to a path.
  useEffect(() => {
    setDocScope('path');
  }, [selectedPath, selectedTreeName, selectedLayerId]);

  // Reflect a query stack into the URL (?q=a&q=b) so it is shareable/back-navigable.
  const syncQueriesToUrl = useCallback((queries: string[]) => {
    const params = new URLSearchParams(location.search);
    params.delete('q');
    params.delete('search');
    for (const q of queries) { params.append('q', q); }
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
  }, [location.pathname, location.search, navigate]);

  const urlQueriesKey = urlSearchQueries.join('␟');
  useEffect(() => {
    setServerSearchQueries(urlSearchQueries);
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQueriesKey]);

  useEffect(() => {
    if (urlSearchQueries.length > 0 || selectedNodeType !== 'canvas' || ignoredSavedSearchPath === selectedPath) return;
    setServerSearchQueries(savedCanvasSearchQuery ? [savedCanvasSearchQuery] : []);
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQueriesKey, selectedNodeType, savedCanvasSearchQuery, selectedPath, ignoredSavedSearchPath]);

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
  }, [syncQueriesToUrl]);

  // Remove one query chip (or clear all when index < 0).
  const handleRemoveBackendQuery = useCallback((index: number) => {
    setServerSearchQueries((prev) => {
      const next = index < 0 ? [] : prev.filter((_, i) => i !== index);
      if (next.length === 0) { setIgnoredSavedSearchPath(selectedPath); }
      syncQueriesToUrl(next);
      setCurrentPage(1);
      return next;
    });
  }, [syncQueriesToUrl, selectedPath]);

  const currentSearchQuery = serverSearchQueries.join(' ').trim();
  const canSaveChanges = Boolean(toolboxState.activeContextType)
    && (toolboxState.isDirty || currentSearchQuery !== (selectedNodeType === 'canvas' ? savedCanvasSearchQuery : (toolboxState.savedSearchQuery || '')));

  // Full tree JSON is expensive for directory trees. Load it once per tree and
  // refresh only when the backend tells us tree metadata changed.
  useEffect(() => {
    let cancelled = false;
    if (!workspaceName) { setTree(null); return; }

    const loadTree = (force = false) => {
      if (force) invalidateWorkspaceTreeCache(workspaceName, selectedTreeName);
      getCachedWorkspaceTreeByName(workspaceName, selectedTreeName, { force })
        .then(res => { if (!cancelled) setTree(res.payload); })
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

  useEffect(() => {
    let cancelled = false;
    if (!workspaceName || selectedNodeType !== 'canvas' || isLayerView) {
      setPublicCanvasShare(null);
      return;
    }

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
      await removeWorkspaceDocuments(workspace.name, [documentId], selectedPath, [], selectedTreeName, selectedTreeType);
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
      await removeWorkspaceDocuments(workspace.name, documentIds, selectedPath, [], selectedTreeName, selectedTreeType);
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

  const selectedTreeType: 'context' | 'directory' = selectedTreeName === 'directory' ? 'directory' : 'context';

  const handlePasteDocuments = async (path: string, documentIds: number[], options: DocumentPasteOptions = {}): Promise<boolean> => {
    if (!workspaceName) return false;
    try {
      const success = await pasteDocumentsToWorkspacePath(workspaceName, path, documentIds, selectedTreeName, selectedTreeType);
      if (success) {
        invalidateDocumentCache(workspaceName, selectedTreeName, path);
        const sourceTreeName = options.sourceTreeName || clipboard?.sourceTreeName;
        const sourcePath = options.sourcePath || clipboard?.sourcePath;
        const shouldMove = options.move || clipboard?.operation === 'cut';
        if (shouldMove && sourcePath && sourceTreeName) {
          const sourceTreeType: 'context' | 'directory' = sourceTreeName === 'directory' ? 'directory' : 'context';
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
          detail: { workspaceName, path, treeName: selectedTreeName },
        }));
        showToast({ title: 'Success', description: `${documentIds.length} document(s) ${options.move || clipboard?.operation === 'cut' ? 'moved' : 'pasted'} to "${path}"` });
      }
      return success;
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to paste documents', variant: 'destructive' });
      return false;
    }
  };

  const handleImportDocuments = async (docs: any[], contextPath: string): Promise<boolean> => {
    if (!workspaceName) return false;
    try {
      const ids = await importDocumentsToWorkspacePath(workspaceName, contextPath, docs, selectedTreeName, selectedTreeType);
      const success = ids.length > 0;
      if (success) {
        invalidateDocumentCache(workspaceName, selectedTreeName, contextPath);
        if (contextPath === selectedPath) await fetchDocuments();
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

  const handleSaveAsCanvas = () => {
    const defaultName = selectedPath === '/' ? 'canvas' : (selectedPath.split('/').pop() || 'canvas');
    setSaveAsCanvasName(defaultName);
    setSaveAsCanvasOpen(true);
  };

  const handleConfirmSaveAsCanvas = async () => {
    if (!workspaceName || !saveAsCanvasName.trim()) return;
    setSaveAsCanvasLoading(true);
    try {
      const name = saveAsCanvasName.trim();
      const path = selectedPath === '/' ? `/${name}` : `${selectedPath}/${name}`;
      await createWorkspaceCanvas(workspaceName, path, selectedTreeName, {
        metadata: { toolbox: toolboxState.filters },
        querySpec: {
          features: toolboxState.filters.features,
          filters: [],
          // Canvas querySpec holds a single query; a refine stack collapses to a
          // combined search string on save (reload runs it as one query).
          query: currentSearchQuery || undefined,
        },
      });
      setSaveAsCanvasOpen(false);
      // Refresh the local tree before navigating so the new node resolves as a
      // canvas — otherwise the page renders generic context/directory controls
      // until the async tree:refresh lands.
      invalidateWorkspaceTreeCache(workspaceName!, selectedTreeName);
      try {
        const res = await getCachedWorkspaceTreeByName(workspaceName!, selectedTreeName, { force: true });
        setTree(res.payload);
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
    const targetType: 'context' | 'directory' = target.treeName === 'directory' ? 'directory' : 'context';
    try {
      const ok = await pasteDocumentsToWorkspacePath(workspaceName, target.path, ids, target.treeName, targetType);
      if (!ok) return;
      invalidateDocumentCache(workspaceName, target.treeName, target.path);
      if (move) {
        const sourceType: 'context' | 'directory' = source.treeName === 'directory' ? 'directory' : 'context';
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
      documents={documents}
      isLoading={isLoadingDocuments}
      totalCount={documentsTotalCount}
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
      scope={docScope}
      onScopeChange={setDocScope}
      pastedDocumentIds={clipboard?.documentIds}
      linkTree={tree}
      onPurgeDocuments={isIncomingPath ? undefined : handlePurgeDocuments}
      disablePurgeDocuments={false}
      canvasInfo={canvasInfo ?? undefined}
      onSaveAsCanvas={tree && selectedNodeType !== 'canvas' && !isLayerView ? handleSaveAsCanvas : undefined}
      onShareCanvas={selectedNodeType === 'canvas' && !isLayerView ? handleShareCanvas : undefined}
      onUnshareCanvas={publicCanvasShare ? handleUnshareCanvas : undefined}
      onDeleteCanvas={selectedNodeType === 'canvas' && !isLayerView ? handleDeleteCanvas : undefined}
      isSharingCanvas={shareCanvasLoading}
      isDeletingCanvas={deleteCanvasLoading}
      isCanvasShared={!!publicCanvasShare}
      isCanvasLocked={!!selectedNode?.locked}
      backendSearchQueries={serverSearchQueries}
      onBackendSearch={handleBackendSearch}
      onRemoveBackendQuery={handleRemoveBackendQuery}
      canSaveChanges={canSaveChanges}
      isSavingChanges={toolboxState.isSaving}
      onSaveChanges={saveFilters}
    >
      {showCanvasGrid && selectedNode && (
        <CanvasGrid
          workspaceId={workspace.name}
          treeName={selectedTreeName}
          path={selectedPath}
          layerId={selectedNode.id}
          querySpec={selectedNode.querySpec}
          metadata={selectedNode.metadata}
          isLocked={!!selectedNode.locked}
        />
      )}
    </DefaultCanvas>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Compact workspace status bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
        style={workspace.color ? { borderLeft: `8px solid ${workspace.color}` } : undefined}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            workspace.status === 'active' ? 'bg-green-500' :
            workspace.status === 'error' ? 'bg-red-500' : 'bg-gray-400'
          }`}
          title={workspace.status}
        />
        <span className="text-sm font-medium truncate">{workspace.label || workspace.name}</span>
        <div className="flex-1" />
        {/* Filtering earns the header slot; stopping a workspace is a rarer
            action that stays available on the workspace list rows (M1). */}
        {workspace.status === 'active' ? (
          <button
            onClick={() => toggleView('tools')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-xs border rounded-md transition-colors',
              toolboxState.t1Open && toolboxState.t1View === 'tools'
                ? 'bg-accent text-foreground'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground',
            )}
          >
            <Filter className="w-3 h-3" />
            Filter
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
      </div>

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

      {/* Save as canvas dialog */}
      {saveAsCanvasOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-lg border shadow-xl p-5 w-80 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Save view as canvas</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Creates a canvas under <span className="font-mono">{selectedPath === '/' ? '/' : selectedPath}</span>
              </p>
            </div>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Canvas name…"
              value={saveAsCanvasName}
              onChange={e => setSaveAsCanvasName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleConfirmSaveAsCanvas();
                if (e.key === 'Escape') setSaveAsCanvasOpen(false);
              }}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setSaveAsCanvasOpen(false)}
                className="px-3 py-1.5 text-xs border rounded-md hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveAsCanvas}
                disabled={!saveAsCanvasName.trim() || saveAsCanvasLoading}
                className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {saveAsCanvasLoading ? 'Creating…' : 'Create canvas'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const treeType: 'context' | 'directory' = pane.treeName === 'directory' ? 'directory' : 'context';
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
        .then(res => { if (!cancelled) setTree(res.payload); })
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
    fetchPaneDocuments();
  }, [fetchPaneDocuments]);

  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as { workspaceName?: string; path?: string; treeName?: string } | undefined;
      if (detail?.workspaceName && detail.workspaceName !== workspaceName) return;
      if (detail?.treeName && detail.treeName !== pane.treeName) return;
      if (detail?.path && detail.path !== pane.path) return;
      invalidateDocumentCache(workspaceName, pane.treeName, pane.path);
      fetchPaneDocuments();
    };
    window.addEventListener('workspace:documents:refresh', onRefresh);
    return () => window.removeEventListener('workspace:documents:refresh', onRefresh);
  }, [fetchPaneDocuments, workspaceName, pane.treeName, pane.path]);

  const pasteDocuments = useCallback(async (path: string, documentIds: number[], options: DocumentPasteOptions = {}) => {
    try {
      const success = await pasteDocumentsToWorkspacePath(workspaceName, path, documentIds, pane.treeName, treeType);
      if (success) {
        invalidateDocumentCache(workspaceName, pane.treeName, path);
        const sourcePath = options.sourcePath || clipboard?.sourcePath;
        const sourceTreeName = options.sourceTreeName || clipboard?.sourceTreeName;
        const shouldMove = options.move || clipboard?.operation === 'cut';
        if (shouldMove && sourcePath && sourceTreeName) {
          const sourceTreeType: 'context' | 'directory' = sourceTreeName === 'directory' ? 'directory' : 'context';
          await removeWorkspaceDocuments(workspaceName, documentIds, sourcePath, [], sourceTreeName, sourceTreeType);
          invalidateDocumentCache(workspaceName, sourceTreeName, sourcePath);
          window.dispatchEvent(new CustomEvent('workspace:documents:refresh', {
            detail: { workspaceName, path: sourcePath, treeName: sourceTreeName },
          }));
        }
        setClipboard(null);
        await fetchPaneDocuments();
        window.dispatchEvent(new CustomEvent('workspace:documents:refresh', {
          detail: { workspaceName, path, treeName: pane.treeName },
        }));
      }
      return success;
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to paste documents', variant: 'destructive' });
      return false;
    }
  }, [workspaceName, pane.treeName, treeType, fetchPaneDocuments, showToast, clipboard]);

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

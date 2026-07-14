import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/toast-container';
import {
  getContext,
  getContextDocuments,
  removeDocumentsFromContext,
  deleteDocumentsFromContext,
  pasteDocumentsToContext,
  importDocumentsToContext,
} from '@/services/context';
import socketService from '@/lib/socket';
import { DefaultCanvas } from '@/components/canvas/DefaultCanvas';
import { Document as WorkspaceDocument } from '@/types/workspace';
import { docInGeoSelection } from '@/utils/geo';
import { useToolbox } from '@/components/toolbox/toolbox-context';
import { useMenu } from '@/components/shell/menu-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { Icon } from '@iconify/react';
import { visibleAccentColor } from '@/utils/color';
import { DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style';
import { cn } from '@/lib/utils';

function contextUrlToPath(url: string, workspaceName?: string): string {
  if (!url || !workspaceName) return '/';
  const prefix = `${workspaceName}://`;
  if (!url.startsWith(prefix)) return '/';
  const raw = url.slice(prefix.length);
  const clean = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  return clean ? `/${clean}` : '/';
}

interface ContextData {
  id: string;
  userId: string;
  url: string;
  baseUrl: string | null;
  path: string | null;
  pathArray: string[];
  workspaceId: string;
  workspaceName: string;
  acl: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  locked: boolean;
  serverContextArray: string[];
  clientContextArray: string[];
  contextBitmapArray: string[];
  featureBitmapArray: string[];
  filterArray: string[];
  pendingUrl: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  name?: string | null;
  color?: string | null;
  icon?: string | null;
}

export default function ContextDetailPage() {
  const { contextId } = useParams<{ contextId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const ownerId = new URLSearchParams(location.search).get('ownerId') || undefined;
  // Repeated ?q= params form a refinement stack (each term narrows the
  // previous set, the last ranks); ?search= stays as a legacy single-term alias.
  const urlSearchQueries = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const stack = params.getAll('q').map(s => s.trim()).filter(Boolean);
    const legacy = (params.get('search') || '').trim();
    return stack.length ? stack : (legacy ? [legacy] : []);
  }, [location.search]);
  const { showToast } = useToast();
  const { state: toolboxState, saveFilters, setAccentColor, setMapDocuments } = useToolbox();
  const { openM2Drawer } = useMenu();
  const isMobile = useIsMobile();
  const tbAllOf = toolboxState.filters.features.allOf;
  const tbAnyOf = toolboxState.filters.features.anyOf;
  const tbNoneOf = toolboxState.filters.features.noneOf;
  const tbFiltersKey = JSON.stringify({ a: tbAllOf, b: tbAnyOf, c: tbNoneOf });

  const [context, setContext] = useState<ContextData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [documentsTotalCount, setDocumentsTotalCount] = useState(0);
  const [copiedDocuments, setCopiedDocuments] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [serverSearchQueries, setServerSearchQueries] = useState<string[]>(urlSearchQueries);
  const [ignoreSavedSearch, setIgnoreSavedSearch] = useState(false);

  const layerParam = new URLSearchParams(location.search).get('layer');
  const isSharedContext = Boolean(ownerId);
  const selectedPath = context ? contextUrlToPath(context.url, context.workspaceName) : '/';
  const urlType = layerParam ? 'context-layer' : 'context';
  const savedContextSearchQuery = typeof context?.metadata?.toolboxSearchQuery === 'string' ? context.metadata.toolboxSearchQuery : '';

  const fetchDocuments = useCallback(async () => {
    if (!contextId) return;
    setIsLoadingDocuments(true);
    try {
      const data = await getContextDocuments(
        contextId,
        tbAllOf,
        [],
        { limit: pageSize, page: currentPage, queries: serverSearchQueries.length ? serverSearchQueries : undefined, anyOf: tbAnyOf, noneOf: tbNoneOf },
        ownerId,
      );
      setDocuments(
        (data as any[]).map((doc: any) => ({
          ...doc,
          parentId: doc.parentId ? parseInt(doc.parentId as string) : null,
        }))
      );
      setDocumentsTotalCount((data as any).totalCount || (data as any).count || (data as any[]).length);
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to fetch documents', variant: 'destructive' });
      setDocuments([]);
      setDocumentsTotalCount(0);
    } finally {
      setIsLoadingDocuments(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, currentPage, pageSize, ownerId, serverSearchQueries, tbFiltersKey]);

  const fetchContextDetails = useCallback(async () => {
    if (!contextId) return;
    setIsLoading(true);
    try {
      const fetched = isSharedContext ? await getContext(contextId, ownerId) : await getContext(contextId);
      if (!fetched) throw new Error('No context data received.');

      const workspaceId =
        (fetched as any).workspaceId ||
        (typeof (fetched as any).workspace === 'string' ? (fetched as any).workspace : (fetched as any).workspace?.id) || '';
      const workspaceName =
        (fetched as any).workspaceName ||
        (typeof (fetched as any).workspace === 'string' ? (fetched as any).workspace : (fetched as any).workspace?.name) || '';

      setContext({
        id: fetched.id,
        userId: fetched.userId,
        url: fetched.url,
        baseUrl: fetched.baseUrl || null,
        path: fetched.path || null,
        pathArray: fetched.pathArray || [],
        workspaceId,
        workspaceName,
        acl: (fetched as any).acl || {},
        createdAt: fetched.createdAt,
        updatedAt: fetched.updatedAt,
        locked: fetched.locked || false,
        serverContextArray: fetched.serverContextArray || [],
        clientContextArray: fetched.clientContextArray || [],
        contextBitmapArray: fetched.contextBitmapArray || [],
        featureBitmapArray: fetched.featureBitmapArray || [],
        filterArray: fetched.filterArray || [],
        pendingUrl: fetched.pendingUrl || null,
        description: fetched.description || null,
        metadata: (fetched as any).metadata || {},
        name: fetched.name ?? null,
        color: fetched.color ?? null,
        icon: fetched.icon ?? null,
      });
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to fetch context ${contextId}`;
      setError(message);
      setContext(null);
      showToast({ title: 'Error', description: message, variant: 'destructive' });
    }
    setIsLoading(false);
  }, [contextId, ownerId, isSharedContext]);

  useEffect(() => { fetchContextDetails(); }, [fetchContextDetails]);

  // Publish the context accent to the toolbox so its top-bar bottom border
  // matches the content being filtered. Cleared on unmount (→ black).
  const contextAccent = visibleAccentColor(context?.color) || null;
  useEffect(() => {
    setAccentColor(contextAccent);
    return () => setAccentColor(null);
  }, [contextAccent, setAccentColor]);

  // Feed the toolbox map with this context's results and refine them by any
  // drawn area — client-side, over the already-fetched set.
  const geoSelection = toolboxState.geoSelection;
  useEffect(() => { setMapDocuments(documents); }, [documents, setMapDocuments]);
  useEffect(() => () => setMapDocuments([]), [setMapDocuments]);
  const shownDocuments = useMemo(
    () => (geoSelection ? documents.filter((d) => docInGeoSelection(d, geoSelection)) : documents),
    [documents, geoSelection],
  );
  useEffect(() => { if (context) fetchDocuments(); }, [context?.id, fetchDocuments]);
  useEffect(() => {
    const onRefresh = () => fetchDocuments();
    window.addEventListener('workspace:documents:refresh', onRefresh);
    return () => window.removeEventListener('workspace:documents:refresh', onRefresh);
  }, [fetchDocuments]);
  useEffect(() => { setCurrentPage(1); setIgnoreSavedSearch(false); }, [contextId]);
  useEffect(() => { setServerSearchQueries(urlSearchQueries); setCurrentPage(1); }, [urlSearchQueries]);
  useEffect(() => {
    if (urlSearchQueries.length || ignoreSavedSearch) return;
    setServerSearchQueries(savedContextSearchQuery ? [savedContextSearchQuery] : []);
    setCurrentPage(1);
  }, [urlSearchQueries, ignoreSavedSearch, savedContextSearchQuery]);

  const syncQueriesToUrl = useCallback((queries: string[]) => {
    const params = new URLSearchParams(location.search);
    params.delete('q');
    params.delete('search');
    for (const term of queries) params.append('q', term);
    const next = params.toString();
    navigate(`${location.pathname}${next ? `?${next}` : ''}`);
  }, [location.pathname, location.search, navigate]);

  // Appends to the refinement stack (dedupes); the URL is the source of truth.
  const handleBackendSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setIgnoreSavedSearch(false);
    const next = serverSearchQueries.includes(trimmed) ? serverSearchQueries : [...serverSearchQueries, trimmed];
    setServerSearchQueries(next);
    syncQueriesToUrl(next);
  }, [serverSearchQueries, syncQueriesToUrl]);

  // index -1 = clear the whole stack (DocumentList convention).
  const handleRemoveBackendQuery = useCallback((index: number) => {
    const next = index < 0 ? [] : serverSearchQueries.filter((_, i) => i !== index);
    if (next.length === 0) setIgnoreSavedSearch(true);
    setServerSearchQueries(next);
    syncQueriesToUrl(next);
  }, [serverSearchQueries, syncQueriesToUrl]);

  // Toolbox saved-search stays single-term: the stack's first term is "the"
  // search for save/compare purposes; refinements are ephemeral.
  const currentSearchQuery = (serverSearchQueries[0] || '').trim();
  const canSaveChanges = Boolean(toolboxState.activeContextType)
    && (toolboxState.isDirty || currentSearchQuery !== (toolboxState.savedSearchQuery || savedContextSearchQuery || ''));

  // WebSocket subscription for real-time context and document updates
  useEffect(() => {
    if (!contextId) return;

    const subscribe = () => socketService.emit('subscribe', { channel: `context:${contextId}` });
    const unsubscribe = () => socketService.emit('unsubscribe', { channel: `context:${contextId}` });

    const offConnect = socketService.on('connect', subscribe);
    subscribe();

    const recentEvents = new Map<string, number>();
    const shouldProcess = (type: string, data: any): boolean => {
      const now = Date.now();
      const key = `${type}:${data?.id || data?.contextId || contextId}`;
      if ((recentEvents.get(key) || 0) + 1000 > now) return false;
      recentEvents.set(key, now);
      return true;
    };

    const onContextUpdate = (data: any) => {
      const ctx = data?.context || data;
      if (ctx?.id !== contextId && ctx?.contextId !== contextId) return;
      if (!shouldProcess('ctx:updated', ctx)) return;
      setContext(prev => prev ? { ...prev, ...ctx } as ContextData : null);
      if (ctx.url) fetchDocuments();
    };

    const onUrlChanged = (data: any) => {
      const id = data?.id || data?.contextId || data?.context?.id;
      const url = data?.url || data?.context?.url;
      if (id !== contextId || typeof url !== 'string') return;
      if (!shouldProcess('ctx:url', data)) return;
      setContext(prev => prev ? { ...prev, url } : null);
      fetchDocuments();
    };

    const onDocumentChanged = (data: any) => {
      const id = data?.contextId || data?.id || data?.context?.id;
      if (id !== contextId) return;
      if (!shouldProcess('doc:changed', data)) return;
      fetchDocuments();
    };

    const events: [string, (d: any) => void][] = [
      ['context.updated', onContextUpdate], ['context:updated', onContextUpdate],
      ['context.url.set', onUrlChanged], ['context:url:set', onUrlChanged],
      ['document.inserted', onDocumentChanged], ['document.updated', onDocumentChanged],
      ['document.removed', onDocumentChanged], ['document.removed.batch', onDocumentChanged],
      ['document.deleted', onDocumentChanged], ['document.deleted.batch', onDocumentChanged],
    ];
    events.forEach(([ev, fn]) => socketService.on(ev, fn));

    return () => {
      offConnect();
      unsubscribe();
      events.forEach(([ev, fn]) => socketService.off(ev, fn));
    };
  }, [contextId, fetchDocuments]);

  const handleRemoveDocument = async (documentId: number) => {
    if (!context) return;
    try {
      await removeDocumentsFromContext(context.id, [documentId], ownerId, selectedPath);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setDocumentsTotalCount(prev => Math.max(0, prev - 1));
      showToast({ title: 'Success', description: 'Document removed from context.' });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to remove document', variant: 'destructive' });
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!context) return;
    try {
      await deleteDocumentsFromContext(context.id, [documentId], ownerId, selectedPath);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setDocumentsTotalCount(prev => Math.max(0, prev - 1));
      showToast({ title: 'Success', description: 'Document deleted.' });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete document', variant: 'destructive' });
    }
  };

  const handleRemoveDocuments = async (documentIds: number[]) => {
    if (!context) return;
    try {
      await removeDocumentsFromContext(context.id, documentIds, ownerId, selectedPath);
      setDocuments(prev => prev.filter(doc => !documentIds.includes(doc.id)));
      setDocumentsTotalCount(prev => Math.max(0, prev - documentIds.length));
      showToast({ title: 'Success', description: `${documentIds.length} document(s) removed.` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to remove documents', variant: 'destructive' });
    }
  };

  const handleDeleteDocuments = async (documentIds: number[]) => {
    if (!context) return;
    try {
      await deleteDocumentsFromContext(context.id, documentIds, ownerId, selectedPath);
      setDocuments(prev => prev.filter(doc => !documentIds.includes(doc.id)));
      setDocumentsTotalCount(prev => Math.max(0, prev - documentIds.length));
      showToast({ title: 'Success', description: `${documentIds.length} document(s) deleted.` });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete documents', variant: 'destructive' });
    }
  };

  const handleCopyDocuments = (documentIds: number[]) => {
    setCopiedDocuments(documentIds);
    showToast({ title: 'Copied', description: `${documentIds.length} document(s) copied to clipboard` });
  };

  const handlePasteDocuments = async (path: string, documentIds: number[]): Promise<boolean> => {
    if (!context) return false;
    try {
      const success = await pasteDocumentsToContext(context.id, path, documentIds, ownerId);
      if (success) {
        await fetchDocuments();
        setCopiedDocuments([]);
        showToast({ title: 'Success', description: `${documentIds.length} document(s) pasted to "${path}"` });
      }
      return success;
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to paste documents', variant: 'destructive' });
      return false;
    }
  };

  const handleImportDocuments = async (docs: any[], contextPath: string): Promise<boolean> => {
    if (!context) return false;
    try {
      const success = await importDocumentsToContext(context.workspaceId, contextPath, docs);
      if (success) {
        await fetchDocuments();
        showToast({ title: 'Success', description: `Imported ${docs.length} document(s) to "${contextPath}"` });
      }
      return success;
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to import documents', variant: 'destructive' });
      return false;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading context...</p>
        </div>
      </div>
    );
  }

  if (error && !context) {
    return <div className="flex items-center justify-center h-full text-destructive">Error: {error}</div>;
  }

  if (!context) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Context not found.</div>;
  }

  const accent = visibleAccentColor(context.color);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Workspace indicator — a context is bound to exactly one workspace;
          icon + color keep that visible even when only the content area is
          shown (mobile). Mirrors the workspace view's status bar. */}
      <div
        className="flex h-12 items-center gap-2 border-b px-4 shrink-0"
        style={accent ? { borderBottom: `3px solid ${accent}` } : { borderBottomWidth: 3 }}
      >
        <Icon
          icon={context.icon || DEFAULT_WORKSPACE_ICON}
          width={16}
          height={16}
          color={accent}
          className={cn('shrink-0', !accent && 'text-muted-foreground')}
        />
        <span className="min-w-0 truncate text-sm font-medium">{context.name || context.id}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          @ {context.workspaceName || context.workspaceId}
        </span>
      </div>
      <DefaultCanvas
        urlType={urlType}
        urlDisplay={context.url}
        contextPath={selectedPath}
        workspaceId={context.workspaceName || context.workspaceId}
        documents={shownDocuments}
        isLoading={isLoadingDocuments}
        totalCount={documentsTotalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        onRemoveDocument={selectedPath !== '/' ? handleRemoveDocument : undefined}
        onDeleteDocument={handleDeleteDocument}
        onRemoveDocuments={selectedPath !== '/' ? handleRemoveDocuments : undefined}
        onDeleteDocuments={handleDeleteDocuments}
        onCopyDocuments={handleCopyDocuments}
        onPasteDocuments={handlePasteDocuments}
        onImportDocuments={!isSharedContext ? handleImportDocuments : undefined}
        pastedDocumentIds={copiedDocuments}
        backendSearchQueries={serverSearchQueries}
        onBackendSearch={handleBackendSearch}
        onRemoveBackendQuery={handleRemoveBackendQuery}
        canSaveChanges={canSaveChanges}
        isSavingChanges={toolboxState.isSaving}
        onSaveChanges={saveFilters}
        // Mobile: tapping the context URL opens the workspace tree drawer
        // (M2 detail) so the URL can be navigated by touch. Desktop already
        // has the tree visible in the side panel.
        onUrlClick={isMobile && contextId ? () => openM2Drawer('contexts', 'detail', contextId) : undefined}
      />
    </div>
  );
}

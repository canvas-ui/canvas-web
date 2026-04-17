import { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
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
}

export default function ContextDetailPage() {
  const { contextId } = useParams<{ contextId: string }>();
  const location = useLocation();
  const ownerId = new URLSearchParams(location.search).get('ownerId') || undefined;
  const { showToast } = useToast();

  const [context, setContext] = useState<ContextData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [documentsTotalCount, setDocumentsTotalCount] = useState(0);
  const [copiedDocuments, setCopiedDocuments] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const layerParam = new URLSearchParams(location.search).get('layer');
  const isSharedContext = Boolean(ownerId);
  const selectedPath = context ? contextUrlToPath(context.url, context.workspaceName) : '/';
  const urlType = layerParam ? 'context-layer' : 'context';

  const fetchDocuments = useCallback(async () => {
    if (!contextId) return;
    setIsLoadingDocuments(true);
    try {
      const data = await getContextDocuments(contextId, [], [], { limit: pageSize, page: currentPage }, ownerId);
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
  }, [contextId, currentPage, pageSize, ownerId]);

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
  useEffect(() => { if (context) fetchDocuments(); }, [context?.id, fetchDocuments]);
  useEffect(() => { setCurrentPage(1); }, [contextId]);

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <DefaultCanvas
        urlType={urlType}
        urlDisplay={context.url}
        contextPath={selectedPath}
        documents={documents}
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
      />
    </div>
  );
}

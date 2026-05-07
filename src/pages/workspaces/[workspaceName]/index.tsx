import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';
import { useToast } from '@/components/ui/toast-container';
import { DefaultCanvas } from '@/components/canvas/DefaultCanvas';
import type { CanvasInfo } from '@/components/canvas/DefaultCanvas';
import {
  getWorkspaceDocuments,
  getWorkspaceLayerDocuments,
  getWorkspaceTreeByName,
  createWorkspaceCanvas,
  createPublicCanvasShare,
  getPublicCanvasShare,
  deletePublicCanvasShare,
  pasteDocumentsToWorkspacePath,
  importDocumentsToWorkspacePath,
  removeWorkspaceDocuments,
  deleteWorkspaceDocuments,
  evictWorkspaceDocuments,
  purgeWorkspaceDocuments,
  startWorkspace,
  stopWorkspace,
  DEFAULT_WORKSPACE_TREE_NAME,
} from '@/services/workspace';
import { Document, TreeNode } from '@/types/workspace';
import { sanitizeUrlPath, buildWorkspaceUrl } from '@/utils/url-params';
import { useToolbox } from '@/components/toolbox/toolbox-context';

export default function WorkspaceDetailPage() {
  const { workspaceName, treeName, '*': pathSplat } = useParams<{ workspaceName: string; treeName?: string; '*'?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const searchParams = new URLSearchParams(location.search);
  const urlSearchQuery = searchParams.get('q') || searchParams.get('search') || '';

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [documentsTotalCount, setDocumentsTotalCount] = useState(0);
  const [isStartingWorkspace, setIsStartingWorkspace] = useState(false);
  const [isStoppingWorkspace, setIsStoppingWorkspace] = useState(false);

  const [clipboard, setClipboard] = useState<{
    documentIds: number[];
    operation: 'copy' | 'cut';
  } | null>(null);

  const [saveAsCanvasOpen, setSaveAsCanvasOpen] = useState(false);
  const [saveAsCanvasName, setSaveAsCanvasName] = useState('');
  const [saveAsCanvasLoading, setSaveAsCanvasLoading] = useState(false);
  const [shareCanvasLoading, setShareCanvasLoading] = useState(false);
  const [publicCanvasShare, setPublicCanvasShare] = useState<{ code: string; url: string } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [serverSearchQuery, setServerSearchQuery] = useState(urlSearchQuery);

  const { state: toolboxState } = useToolbox();
  const tbAllOf = toolboxState.filters.features.allOf;
  const tbAnyOf = toolboxState.filters.features.anyOf;
  const tbNoneOf = toolboxState.filters.features.noneOf;
  const tbFiltersKey = JSON.stringify({ a: tbAllOf, b: tbAnyOf, c: tbNoneOf });

  // Path and tree from URL segments; UI state from query params
  const selectedPath = sanitizeUrlPath('/' + (pathSplat ?? ''));
  const selectedTreeName = treeName ?? DEFAULT_WORKSPACE_TREE_NAME;

  const isLayerView = searchParams.get('layer') === '1';
  const selectedLayerId = searchParams.get('layerId') || null;
  // Leaf node type / canvas id are derived from the path against the loaded tree —
  // we do not encode them in the URL. The path is the source of truth, mirroring
  // the REST API. See `feedback_url_design` memory for rationale.
  const [tree, setTree] = useState<TreeNode | null>(null);
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
  const fetchDocuments = useCallback(async () => {
    if (!workspaceName) return;
    setIsLoadingDocuments(true);
    try {
      let response;
      if (isLayerView && selectedLayerId) {
        response = await getWorkspaceLayerDocuments(workspaceName, selectedTreeName, selectedLayerId, {
          limit: pageSize,
          page: currentPage,
          q: serverSearchQuery || undefined,
          allOf: tbAllOf,
          anyOf: tbAnyOf,
          noneOf: tbNoneOf,
        });
      } else {
        const selectedTreeType: 'context' | 'directory' = selectedTreeName === 'directory' ? 'directory' : 'context';
        response = await getWorkspaceDocuments(workspaceName, selectedPath, tbAllOf, {
          limit: pageSize,
          page: currentPage,
          treeName: selectedTreeName,
          treeType: selectedTreeType,
          q: serverSearchQuery || undefined,
          anyOf: tbAnyOf,
          noneOf: tbNoneOf,
        });
      }
      setDocuments((response.payload as Document[]) || []);
      setDocumentsTotalCount(response.totalCount || response.count || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch documents';
      showToast({ title: 'Error', description: message, variant: 'destructive' });
      setDocuments([]);
      setDocumentsTotalCount(0);
    } finally {
      setIsLoadingDocuments(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceName, selectedPath, selectedTreeName, selectedLayerId, isLayerView, currentPage, pageSize, workspace?.status, serverSearchQuery, tbFiltersKey]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    const onDocumentsRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as { workspaceName?: string; path?: string; treeName?: string } | undefined;
      if (detail?.workspaceName && detail.workspaceName !== workspaceName) return;
      if (detail?.treeName && detail.treeName !== selectedTreeName) return;
      if (detail?.path && detail.path !== selectedPath) return;
      fetchDocuments();
    };

    window.addEventListener('workspace:documents:refresh', onDocumentsRefresh);
    return () => window.removeEventListener('workspace:documents:refresh', onDocumentsRefresh);
  }, [fetchDocuments, workspaceName, selectedPath, selectedTreeName]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPath, selectedTreeName, selectedLayerId]);

  useEffect(() => {
    setServerSearchQuery(urlSearchQuery);
    setCurrentPage(1);
  }, [urlSearchQuery]);

  const handleBackendSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    const params = new URLSearchParams(location.search);
    if (trimmed) {
      params.set('q', trimmed);
    } else {
      params.delete('q');
      params.delete('search');
    }
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
  }, [location.pathname, location.search, navigate]);

  // Keep the tree fresh enough to resolve leaf type locally. Path changes can
  // follow a just-created canvas, so refetch on path navigation too.
  useEffect(() => {
    let cancelled = false;
    if (!workspaceName) { setTree(null); return; }
    getWorkspaceTreeByName(workspaceName, selectedTreeName)
      .then(res => { if (!cancelled) setTree(res.payload); })
      .catch(() => { if (!cancelled) setTree(null); });

    const onTreeRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail as { workspaceName?: string } | undefined;
      if (detail?.workspaceName && detail.workspaceName !== workspaceName) return;
      getWorkspaceTreeByName(workspaceName, selectedTreeName)
        .then(res => { if (!cancelled) setTree(res.payload); })
        .catch(() => {});
    };
    window.addEventListener('workspace:tree:refresh', onTreeRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('workspace:tree:refresh', onTreeRefresh);
    };
  }, [workspaceName, selectedTreeName, selectedPath]);

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

  const handleStopWorkspace = async () => {
    if (!workspace) return;
    setIsStoppingWorkspace(true);
    try {
      const updated = await stopWorkspace(workspace.name);
      setWorkspace(updated);
      showToast({ title: 'Success', description: 'Workspace stopped successfully' });
      window.dispatchEvent(new CustomEvent('workspaces:refresh'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop workspace';
      showToast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsStoppingWorkspace(false);
    }
  };

  const handleRemoveDocument = async (documentId: number) => {
    if (!workspace) return;
    try {
      await removeWorkspaceDocuments(workspace.name, [documentId], selectedPath);
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
      await deleteWorkspaceDocuments(workspace.name, [documentId], selectedPath);
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
      await removeWorkspaceDocuments(workspace.name, documentIds, selectedPath);
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
      await deleteWorkspaceDocuments(workspace.name, documentIds, selectedPath);
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
      const result = await evictWorkspaceDocuments(workspace.name, [documentId]);
      if (result.failed?.length) {
        const f = result.failed[0];
        const msg = f.backends
          ? `${f.reason} (${f.backends.join(', ')})`
          : f.reason;
        showToast({ title: 'Error', description: msg, variant: 'destructive' });
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
      const result = await evictWorkspaceDocuments(workspace.name, documentIds);
      const succeededIds = new Set(result.successful?.map(r => r.id) ?? []);
      setDocuments(prev => prev.filter(doc => !succeededIds.has(doc.id)));
      setDocumentsTotalCount(prev => Math.max(0, prev - succeededIds.size));
      const msg = [
        result.successful?.length ? `${result.successful.length} destroyed` : null,
        result.failed?.length ? `${result.failed.length} failed` : null,
        result.skipped?.length ? `${result.skipped.length} skipped` : null,
      ].filter(Boolean).join(', ');
      showToast({ title: 'Done', description: msg || 'No documents destroyed' });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to destroy documents', variant: 'destructive' });
    }
  };

  const handleCopyDocuments = (documentIds: number[]) => {
    setClipboard({ documentIds, operation: 'copy' });
    window.dispatchEvent(new CustomEvent('documents:clipboard', { detail: { documentIds, operation: 'copy' } }));
    showToast({ title: 'Copied', description: `${documentIds.length} document(s) copied to clipboard` });
  };

  const handleCutDocuments = (documentIds: number[]) => {
    setClipboard({ documentIds, operation: 'cut' });
    window.dispatchEvent(new CustomEvent('documents:clipboard', { detail: { documentIds, operation: 'cut' } }));
    showToast({ title: 'Cut', description: `${documentIds.length} document(s) cut to clipboard` });
  };

  const selectedTreeType: 'context' | 'directory' = selectedTreeName === 'directory' ? 'directory' : 'context';

  const handlePasteDocuments = async (path: string, documentIds: number[]): Promise<boolean> => {
    if (!workspaceName) return false;
    try {
      const success = await pasteDocumentsToWorkspacePath(workspaceName, path, documentIds, selectedTreeName, selectedTreeType);
      if (success) {
        await fetchDocuments();
        setClipboard(null);
        window.dispatchEvent(new CustomEvent('documents:clipboard', { detail: null }));
        showToast({ title: 'Success', description: `${documentIds.length} document(s) ${clipboard?.operation === 'cut' ? 'moved' : 'pasted'} to "${path}"` });
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
      const success = await importDocumentsToWorkspacePath(workspaceName, contextPath, docs, selectedTreeName, selectedTreeType);
      if (success) {
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
      const result = await purgeWorkspaceDocuments(workspace.name, selectedPath, [], []);
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
          query: serverSearchQuery.trim() || undefined,
        },
      });
      setSaveAsCanvasOpen(false);
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
      showToast({ title: 'Canvas unshared', description: 'The public link no longer works.' });
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to unshare canvas', variant: 'destructive' });
    } finally {
      setShareCanvasLoading(false);
    }
  };

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
        {workspace.status === 'active' ? (
          <button
            onClick={handleStopWorkspace}
            disabled={isStoppingWorkspace}
            className="px-3 py-1 text-xs border rounded-md hover:bg-accent disabled:opacity-50"
          >
            {isStoppingWorkspace ? 'Stopping…' : 'Stop'}
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

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        <DefaultCanvas
          urlType={isLayerView ? (selectedTreeName === 'directory' ? 'directory-layer' : 'context-layer') : (selectedNodeType === 'canvas' ? 'canvas' : selectedTreeName === 'directory' ? 'directory' : 'context')}
          urlDisplay={urlDisplay}
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
          onDestroyDocument={handleDestroyDocument}
          onRemoveDocuments={selectedPath !== '/' ? handleRemoveDocuments : undefined}
          onDeleteDocuments={handleDeleteDocuments}
          onDestroyDocuments={handleDestroyDocuments}
          onCopyDocuments={handleCopyDocuments}
          onCutDocuments={handleCutDocuments}
          onPasteDocuments={handlePasteDocuments}
          onImportDocuments={handleImportDocuments}
          pastedDocumentIds={clipboard?.documentIds}
          onPurgeDocuments={handlePurgeDocuments}
          disablePurgeDocuments={false}
          canvasInfo={canvasInfo ?? undefined}
          onSaveAsCanvas={tree && selectedNodeType !== 'canvas' && !isLayerView ? handleSaveAsCanvas : undefined}
          onShareCanvas={selectedNodeType === 'canvas' && !isLayerView ? handleShareCanvas : undefined}
          onUnshareCanvas={publicCanvasShare ? handleUnshareCanvas : undefined}
          isSharingCanvas={shareCanvasLoading}
          isCanvasShared={!!publicCanvasShare}
          backendSearchQuery={serverSearchQuery}
          onBackendSearch={handleBackendSearch}
        />
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

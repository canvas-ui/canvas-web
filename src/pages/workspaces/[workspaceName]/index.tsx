import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';
import { useToast } from '@/components/ui/toast-container';
import { FileManagerView } from '@/components/workspace/file-manager-view';

import {
  getWorkspaceTree,
  getWorkspaceDocuments,
  insertWorkspacePath,
  removeWorkspacePath,
  moveWorkspacePath,
  copyWorkspacePath,
  mergeUpWorkspacePath,
  mergeDownWorkspacePath,
  subtractUpWorkspacePath,
  subtractDownWorkspacePath,
  pasteDocumentsToWorkspacePath,
  importDocumentsToWorkspacePath,
  removeWorkspaceDocuments,
  deleteWorkspaceDocuments,
  listWorkspaceLayers,
  renameWorkspaceLayer,
  lockWorkspaceLayer,
  unlockWorkspaceLayer,
  destroyWorkspaceLayer
} from '@/services/workspace';
import { getSchemas } from '@/services/schemas';
import { TreeNode, Document } from '@/types/workspace';
import { parseUrlFilters, extractWorkspacePath, buildWorkspaceUrl, sanitizeUrlPath, UrlFilters } from '@/utils/url-params';

// Using global Workspace interface from types/api.d.ts

export default function WorkspaceDetailPage() {
  const { workspaceName } = useParams<{ workspaceName: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('/');
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentsTotalCount, setDocumentsTotalCount] = useState(0);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchemas, setSelectedSchemas] = useState<string[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);

  // URL-based features and filters
  const [urlFilters, setUrlFilters] = useState<UrlFilters>({ features: [], filters: [] });

  // Clipboard state for copy/cut operations
  const [clipboard, setClipboard] = useState<{
    documentIds: number[];
    operation: 'copy' | 'cut';
    sourcePath: string;
  } | null>(null);
  const { showToast } = useToast();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [layers, setLayers] = useState<any[]>([]);
  const [isLoadingLayers, setIsLoadingLayers] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Initialize path and filters from URL
  useEffect(() => {
    if (!workspaceName) return;

    // Extract path from URL
    const pathFromUrl = extractWorkspacePath(location.pathname, workspaceName);
    setSelectedPath(pathFromUrl);

    // Parse filters from URL search params
    const searchParams = new URLSearchParams(location.search);
    const parsedFilters = parseUrlFilters(searchParams);
    setUrlFilters(parsedFilters);
  }, [location.pathname, location.search, workspaceName]);

  // Update URL when path or filters change
  const updateUrl = (newPath: string, newFilters?: UrlFilters) => {
    if (!workspaceName) return;

    const filters = newFilters || urlFilters;
    const newUrl = buildWorkspaceUrl(workspaceName, newPath, filters);

    // Only navigate if URL is different
    if (newUrl !== location.pathname + location.search) {
      navigate(newUrl, { replace: true });
    }
  };

  // Reusable fetch functions
  const fetchTree = async () => {
    if (!workspaceName) return;
    setIsLoadingTree(true);
    try {
      const response = await getWorkspaceTree(workspaceName);
      setTree(response.payload as TreeNode);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch workspace tree';
      setError(message);
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setIsLoadingTree(false);
    }
  };

  const fetchDocuments = async () => {
    if (!workspaceName) return;
    setIsLoadingDocuments(true);
    try {
      // Combine selected schemas with URL features as additional schema filters
      const allSchemas = [...selectedSchemas, ...urlFilters.features];

      const response = await getWorkspaceDocuments(workspaceName, selectedPath, allSchemas, {
        limit: pageSize,
        page: currentPage
      });
      // response.payload is directly an array of documents, not an object with 'data' property
      const documents = response.payload as Document[];
      setDocuments(documents || []);
      setDocumentsTotalCount(response.totalCount || response.count || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      setDocuments([]);
      setDocumentsTotalCount(0);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  // Fetch workspace details
  useEffect(() => {
    if (!workspaceName) return;

    const fetchWorkspace = async () => {
      setIsLoadingWorkspace(true);
      try {
        const response = await api.get<ApiResponse<{ workspace: Workspace } | Workspace>>(`${API_ROUTES.workspaces}/${workspaceName}`);

        if (response.payload && 'workspace' in response.payload) {
          setWorkspace(response.payload.workspace as Workspace);
        } else {
          setWorkspace(response.payload as Workspace);
        }
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to fetch workspace ${workspaceName}`;
        setError(message);
        setWorkspace(null);
        showToast({
          title: 'Error',
          description: message,
          variant: 'destructive'
        });
      } finally {
        setIsLoadingWorkspace(false);
      }
    };

    fetchWorkspace();
  }, [workspaceName]);

  // Fetch workspace tree
  useEffect(() => {
    fetchTree();
  }, [workspaceName]);

  // Load schemas for filtering
  useEffect(() => {
    const loadSchemas = async () => {
      try {
        setIsLoadingSchemas(true);
        const schemasData = await getSchemas();
        setSchemas(schemasData);
      } catch (err) {
        console.error('Failed to load schemas:', err);
      } finally {
        setIsLoadingSchemas(false);
      }
    };
    loadSchemas();
  }, []);

  // Fetch documents when path, schema filters, URL filters, or pagination changes
  useEffect(() => {
    fetchDocuments();
  }, [workspaceName, selectedPath, selectedSchemas, urlFilters, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPath, selectedSchemas, urlFilters]);

  // Helper function to refresh layers
  const refreshLayers = async () => {
    if (!workspace) return;
    try {
      const data = await listWorkspaceLayers(workspace.id);
      setLayers(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error('Failed to refresh layers:', err);
    }
  };

  // Load layers when workspace loads
  useEffect(() => {
    const loadLayers = async () => {
      if (!workspace) return;
      try {
        setIsLoadingLayers(true);
        const data = await listWorkspaceLayers(workspace.id);
        // sort by name; include root and handle it as disabled in UI
        setLayers(data.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error('Failed to load layers:', err);
      } finally {
        setIsLoadingLayers(false);
      }
    };
    loadLayers();
  }, [workspace]);

  // Tree operation handlers
  const handleInsertPath = async (path: string, autoCreateLayers: boolean = true): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await insertWorkspacePath(workspace.id, path, autoCreateLayers);
      if (success) {
        await fetchTree(); // Refresh tree
        await refreshLayers(); // Refresh layers
        showToast({
          title: 'Success',
          description: `Path "${path}" created successfully`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create path';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleRemovePath = async (path: string, recursive: boolean = false): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await removeWorkspacePath(workspace.id, path, recursive);
      if (success) {
        await fetchTree(); // Refresh tree
        await refreshLayers(); // Refresh layers
        showToast({
          title: 'Success',
          description: `Path "${path}" removed successfully`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove path';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleMovePath = async (fromPath: string, toPath: string, recursive: boolean = false): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await moveWorkspacePath(workspace.id, fromPath, toPath, recursive);
      if (success) {
        await fetchTree(); // Refresh tree
        await refreshLayers(); // Refresh layers
        showToast({
          title: 'Success',
          description: `Path moved from "${fromPath}" to "${toPath}"`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to move path';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleRenamePath = async (fromPath: string, newName: string): Promise<boolean> => {
    if (!workspace) return false;
    try {
      // Find the layer that corresponds to this path
      // Convert path to layer name (remove leading slash)
      const layerName = fromPath === '/' ? '/' : fromPath.substring(1);
      const layer = layers?.find(l => l.name === layerName);

      if (!layer) {
        throw new Error(`No layer found for path "${fromPath}"`);
      }

      if (layer.name === '/') {
        throw new Error('Cannot rename root layer');
      }

      // Extract parent path and construct new layer name
      const pathParts = fromPath.split('/');
      pathParts[pathParts.length - 1] = newName;
      const newPath = pathParts.join('/');
      const newLayerName = newPath === '/' ? '/' : newPath.substring(1);

      await renameWorkspaceLayer(workspace.id, layer.id, newLayerName.toLowerCase());

      // Refresh tree and layers
      await fetchTree();
      const data = await listWorkspaceLayers(workspace.id);
      setLayers(data.sort((a, b) => a.name.localeCompare(b.name)));

      showToast({
        title: 'Success',
        description: `Layer renamed from "${fromPath}" to "${newPath}"`
      });

      // If the renamed path was selected, update selection to new path
      if (selectedPath === fromPath) {
        const sanitizedNewPath = sanitizeUrlPath(newPath);
        setSelectedPath(sanitizedNewPath);
        updateUrl(sanitizedNewPath);
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename path';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleCopyPath = async (fromPath: string, toPath: string, recursive: boolean = false): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await copyWorkspacePath(workspace.id, fromPath, toPath, recursive);
      if (success) {
        await fetchTree(); // Refresh tree
        await refreshLayers(); // Refresh layers
        showToast({
          title: 'Success',
          description: `Path copied from "${fromPath}" to "${toPath}"`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to copy path';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleMergeUp = async (path: string): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await mergeUpWorkspacePath(workspace.id, path);
      if (success) {
        await fetchTree(); // Refresh tree
        await refreshLayers(); // Refresh layers
        showToast({
          title: 'Success',
          description: `Path "${path}" merged up successfully`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to merge up';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleMergeDown = async (path: string): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await mergeDownWorkspacePath(workspace.id, path);
      if (success) {
        await fetchTree(); // Refresh tree
        await refreshLayers(); // Refresh layers
        showToast({
          title: 'Success',
          description: `Path "${path}" merged down successfully`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to merge down';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleSubtractUp = async (path: string): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await subtractUpWorkspacePath(workspace.id, path);
      if (success) {
        await fetchTree(); // Refresh tree
        await refreshLayers(); // Refresh layers
        showToast({
          title: 'Success',
          description: `Path "${path}" subtracted up successfully`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to subtract up';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleSubtractDown = async (path: string): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await subtractDownWorkspacePath(workspace.id, path);
      if (success) {
        await fetchTree(); // Refresh tree
        await refreshLayers(); // Refresh layers
        showToast({
          title: 'Success',
          description: `Path "${path}" subtracted down successfully`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to subtract down';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

      const handlePasteDocuments = async (path: string, documentIds: number[]): Promise<boolean> => {
    if (!workspace) return false;
    console.log('handlePasteDocuments called:', { path, documentIds, clipboard });
    try {
      console.log('About to call pasteDocumentsToWorkspacePath with:', { workspaceId: workspace.id, path, documentIds });
      const success = await pasteDocumentsToWorkspacePath(workspace.id, path, documentIds);
      console.log('pasteDocumentsToWorkspacePath result:', success);
      if (success) {
        await fetchDocuments(); // Refresh documents
        if (clipboard) {
          setClipboard(null); // Clear clipboard
        }
        showToast({
          title: 'Success',
          description: `${documentIds.length} document(s) ${clipboard?.operation === 'cut' ? 'moved' : 'pasted'} to "${path}"`
        });
      }
      return success;
    } catch (err) {
      console.error('Error in handlePasteDocuments:', err);
      const message = err instanceof Error ? err.message : 'Failed to paste documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleImportDocuments = async (documents: any[], contextPath: string): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await importDocumentsToWorkspacePath(workspace.id, contextPath, documents);
      if (success) {
        // If the import is to the current selected path, refresh documents
        if (contextPath === selectedPath) {
          await fetchDocuments();
        }
        showToast({
          title: 'Success',
          description: `Imported ${documents.length} document(s) to "${contextPath}"`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleCopyDocuments = (documentIds: number[]) => {
    setClipboard({
      documentIds,
      operation: 'copy',
      sourcePath: selectedPath
    });
    showToast({
      title: 'Success',
      description: `${documentIds.length} document(s) copied to clipboard`
    });
  };

  const handleCutDocuments = (documentIds: number[]) => {
    console.log('handleCutDocuments called:', { documentIds, selectedPath });
    setClipboard({
      documentIds,
      operation: 'cut',
      sourcePath: selectedPath
    });
    showToast({
      title: 'Success',
      description: `${documentIds.length} document(s) cut to clipboard`
    });
  };

  // Handle document removal from workspace path
  const handleRemoveDocument = async (documentId: number, fromPath?: string) => {
    if (!workspace) return;
    const contextPath = fromPath || selectedPath;
    try {
      await removeWorkspaceDocuments(workspace.id, [documentId], contextPath);
      // Update local state only if removing from current path
      if (contextPath === selectedPath) {
        setDocuments(prev => prev.filter(doc => doc.id !== documentId));
        setDocumentsTotalCount(prev => Math.max(0, prev - 1));
      }
      showToast({
        title: 'Success',
        description: `Document removed from workspace path "${contextPath}" successfully.`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove document';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
  };

  // Handle document deletion from workspace
  const handleDeleteDocument = async (documentId: number) => {
    if (!workspace) return;
    try {
      await deleteWorkspaceDocuments(workspace.id, [documentId], selectedPath);
      // Update local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setDocumentsTotalCount(prev => Math.max(0, prev - 1));
      showToast({
        title: 'Success',
        description: 'Document deleted from workspace successfully.'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete document';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
  };

  // Handle multiple document removal from workspace path
  const handleRemoveDocuments = async (documentIds: number[], fromPath?: string) => {
    if (!workspace) return;
    const contextPath = fromPath || selectedPath;
    console.log('Workspace handleRemoveDocuments:', { documentIds, fromPath, contextPath, selectedPath });
    try {
      await removeWorkspaceDocuments(workspace.id, documentIds, contextPath);
      console.log('Successfully removed documents from workspace');
      // Update local state only if removing from current path
      if (contextPath === selectedPath) {
        setDocuments(prev => prev.filter(doc => !documentIds.includes(doc.id)));
        setDocumentsTotalCount(prev => Math.max(0, prev - documentIds.length));
      }
      showToast({
        title: 'Success',
        description: `${documentIds.length} document(s) removed from workspace path "${contextPath}" successfully.`
      });
    } catch (err) {
      console.error('Error removing documents:', err);
      const message = err instanceof Error ? err.message : 'Failed to remove documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
  };

  // Handle multiple document deletion from workspace
  const handleDeleteDocuments = async (documentIds: number[]) => {
    if (!workspace) return;
    try {
      await deleteWorkspaceDocuments(workspace.id, documentIds, selectedPath);
      // Update local state
      setDocuments(prev => prev.filter(doc => !documentIds.includes(doc.id)));
      setDocumentsTotalCount(prev => Math.max(0, prev - documentIds.length));
      showToast({
        title: 'Success',
        description: `${documentIds.length} document(s) deleted from workspace successfully.`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
  };

  // Pagination handlers
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Layer tab interactions
  const handleSelectLayer = async (layer: any) => {
    setSelectedLayerId(layer.id);
    // If context layer, fetch documents for that single layer (use layer.name as contextSpec)
    if (workspace) {
      setIsLoadingDocuments(true);
      try {
        const response = await getWorkspaceDocuments(workspace.id, `/${layer.name}`, selectedSchemas, {
          limit: pageSize,
          page: currentPage
        });
        // response.payload is directly an array of documents, not an object with 'data' property
        const documents = response.payload as Document[];
        setDocuments(documents || []);
        setDocumentsTotalCount(response.totalCount || response.count || 0);
        const newPath = sanitizeUrlPath(`/${layer.name}`);
        setSelectedPath(newPath);
        updateUrl(newPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch layer documents';
        showToast({ title: 'Error', description: message, variant: 'destructive' });
      } finally {
        setIsLoadingDocuments(false);
      }
    }
  };

  const handleRenameLayer = async (layer: any) => {
    if (!workspace) return;
    if (layer.name === '/') return;
    const newName = prompt('Enter new layer name (lowercase):', layer.name);
    if (!newName || newName === layer.name) return;
    try {
      await renameWorkspaceLayer(workspace.id, layer.id, newName.toLowerCase());
      showToast({ title: 'Success', description: `Layer renamed to ${newName}` });
      // reload list and possibly tree
      await fetchTree();
      const data = await listWorkspaceLayers(workspace.id);
      setLayers(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to rename layer', variant: 'destructive' });
    }
  };

  const handleLockLayer = async (layer: any) => {
    if (!workspace) return;
    const lockBy = workspace.id; // simple placeholder lockBy
    try {
      await lockWorkspaceLayer(workspace.id, layer.id, lockBy);
      showToast({ title: 'Success', description: `Layer locked` });
      const data = await listWorkspaceLayers(workspace.id);
      setLayers(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to lock layer', variant: 'destructive' });
    }
  };

  const handleUnlockLayer = async (layer: any) => {
    if (!workspace) return;
    const lockBy = workspace.id; // simple placeholder lockBy
    try {
      await unlockWorkspaceLayer(workspace.id, layer.id, lockBy);
      showToast({ title: 'Success', description: `Layer unlocked` });
      const data = await listWorkspaceLayers(workspace.id);
      setLayers(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to unlock layer', variant: 'destructive' });
    }
  };

  const handleDestroyLayer = async (layer: any) => {
    if (!workspace) return;
    if (layer.name === '/') return;
    if (!confirm(`Destroy layer "${layer.name}"? This cannot be undone.`)) return;
    try {
      await destroyWorkspaceLayer(workspace.id, layer.id);
      showToast({ title: 'Success', description: 'Layer destroyed' });
      await fetchTree();
      const data = await listWorkspaceLayers(workspace.id);
      setLayers(data.sort((a, b) => a.name.localeCompare(b.name)));
      if (selectedLayerId === layer.id) {
        setSelectedLayerId(null);
        setSelectedPath('/');
        updateUrl('/');
        fetchDocuments();
      }
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to destroy layer', variant: 'destructive' });
    }
  };



  if (isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="text-center space-y-4">
        <div className="text-destructive">Error: {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!workspace) {
    return <div className="text-center">Workspace not found.</div>;
  }

  return (
    <div className="flex h-full min-h-0 gap-6">

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-6 min-h-0">
        {/* Page Header */}
        <div className="border-b pb-4">
          <h1 className="text-3xl font-bold tracking-tight">{workspace.label}</h1>
          <p className="text-muted-foreground mt-2">{workspace.description || 'No description available'}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Status: <span className="font-mono">{workspace.status}</span></span>
            <span>Owner: {workspace.owner}</span>
            {workspace.color && (
              <div className="flex items-center gap-2">
                <span>Color:</span>
                <div
                  className="w-4 h-4 rounded border"
                  style={{ backgroundColor: workspace.color }}
                />
                <span className="font-mono text-xs">{workspace.color}</span>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced File Manager */}
        <FileManagerView
          tree={tree}
          selectedPath={selectedPath}
          onPathSelect={(path: string) => {
            const sanitizedPath = sanitizeUrlPath(path);
            setSelectedPath(sanitizedPath);
            updateUrl(sanitizedPath);
          }}
          isLoadingTree={isLoadingTree}
          documents={documents}
          isLoadingDocuments={isLoadingDocuments}
          totalCount={documentsTotalCount}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          layers={layers}
          selectedLayerId={selectedLayerId}
          isLoadingLayers={isLoadingLayers}
          onSelectLayer={handleSelectLayer}
          onRenameLayer={handleRenameLayer}
          onLockLayer={handleLockLayer}
          onUnlockLayer={handleUnlockLayer}
          onDestroyLayer={handleDestroyLayer}
          onInsertPath={handleInsertPath}
          onRemovePath={handleRemovePath}
          onRenamePath={handleRenamePath}
          onMovePath={handleMovePath}
          onCopyPath={handleCopyPath}
          onMergeUp={handleMergeUp}
          onMergeDown={handleMergeDown}
          onSubtractUp={handleSubtractUp}
          onSubtractDown={handleSubtractDown}
          onRemoveDocument={selectedPath !== '/' ? handleRemoveDocument : undefined}
          onDeleteDocument={handleDeleteDocument}
          onRemoveDocuments={selectedPath !== '/' ? handleRemoveDocuments : undefined}
          onDeleteDocuments={handleDeleteDocuments}
          onCopyDocuments={handleCopyDocuments}
          onCutDocuments={handleCutDocuments}
          onPasteDocuments={handlePasteDocuments}
          onImportDocuments={handleImportDocuments}
          schemas={schemas}
          selectedSchemas={[...selectedSchemas, ...urlFilters.features]}
          onSchemaChange={(newSchemas) => {
            // Split into URL features and manual selections
            const urlFeatures = newSchemas.filter(schema => schema.startsWith('data/abstraction/'));
            const manualSchemas = newSchemas.filter(schema => !schema.startsWith('data/abstraction/'));

            // Update manual selections
            setSelectedSchemas(manualSchemas);

            // Update URL features if they changed
            if (JSON.stringify(urlFeatures.sort()) !== JSON.stringify(urlFilters.features.sort())) {
              const newFilters = { features: urlFeatures, filters: urlFilters.filters };
              setUrlFilters(newFilters);
              updateUrl(selectedPath, newFilters);
            }
          }}
          isLoadingSchemas={isLoadingSchemas}
          copiedDocuments={clipboard?.documentIds || []}
          workspaceId={workspace.id}
        />


      </div>


    </div>
  );
}

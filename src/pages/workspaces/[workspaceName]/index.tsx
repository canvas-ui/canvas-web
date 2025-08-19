import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';
import { useToast } from '@/components/ui/toast-container';
import { Button } from '@/components/ui/button';
import { TreeView } from '@/components/common/tree-view';
import { DocumentList } from '@/components/common/document-list';
import { TokenManager } from '@/components/workspace/token-manager';
import { createPortal } from 'react-dom';
import {
  getWorkspaceTree,
  getWorkspaceDocuments,
  insertWorkspacePath,
  removeWorkspacePath,
  moveWorkspacePath,
  copyWorkspacePath,
  mergeUpWorkspacePath,
  mergeDownWorkspacePath,
  pasteDocumentsToWorkspacePath,
  removeWorkspaceDocuments,
  deleteWorkspaceDocuments,
  listWorkspaceLayers,
  renameWorkspaceLayer,
  lockWorkspaceLayer,
  unlockWorkspaceLayer,
  destroyWorkspaceLayer
} from '@/services/workspace';
import { getSchemas, getSchemaDisplayName } from '@/services/schemas';
import { TreeNode, Document, DocumentsResponse } from '@/types/workspace';

// Using global Workspace interface from types/api.d.ts

export default function WorkspaceDetailPage() {
  const { workspaceName } = useParams<{ workspaceName: string }>();
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
  const [rightTab, setRightTab] = useState<'filter' | 'tokens'>('tokens');
  const [copiedDocuments, setCopiedDocuments] = useState<number[]>([]);
  const { showToast } = useToast();

  const [leftTab, setLeftTab] = useState<'tree' | 'layers'>('tree');
  const [layers, setLayers] = useState<any[]>([]);
  const [isLoadingLayers, setIsLoadingLayers] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [layersContextMenu, setLayersContextMenu] = useState<{ x: number; y: number; layer: any } | null>(null);

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
      const response = await getWorkspaceDocuments(workspaceName, selectedPath, selectedSchemas);
      const documentsData = response.payload as DocumentsResponse;
      setDocuments(documentsData.data || []);
      setDocumentsTotalCount(documentsData.count || 0);
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

  // Fetch documents when path or schema filters change
  useEffect(() => {
    fetchDocuments();
  }, [workspaceName, selectedPath, selectedSchemas]);

  // Load layers when switching to layers tab
  useEffect(() => {
    const loadLayers = async () => {
      if (!workspace || leftTab !== 'layers') return;
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
  }, [workspace, leftTab]);

  // Tree operation handlers
  const handleInsertPath = async (path: string, autoCreateLayers: boolean = true): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await insertWorkspacePath(workspace.id, path, autoCreateLayers);
      if (success) {
        await fetchTree(); // Refresh tree
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

  const handleCopyPath = async (fromPath: string, toPath: string, recursive: boolean = false): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await copyWorkspacePath(workspace.id, fromPath, toPath, recursive);
      if (success) {
        await fetchTree(); // Refresh tree
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

  const handlePasteDocuments = async (path: string, documentIds: number[]): Promise<boolean> => {
    if (!workspace) return false;
    try {
      const success = await pasteDocumentsToWorkspacePath(workspace.id, path, documentIds);
      if (success) {
        await fetchDocuments(); // Refresh documents
        setCopiedDocuments([]); // Clear copied documents
        showToast({
          title: 'Success',
          description: `${documentIds.length} document(s) pasted to "${path}"`
        });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to paste documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleCopyDocuments = (documentIds: number[]) => {
    setCopiedDocuments(documentIds);
    showToast({
      title: 'Success',
      description: `${documentIds.length} document(s) copied to clipboard`
    });
  };

  // Handle document removal from workspace path
  const handleRemoveDocument = async (documentId: number) => {
    if (!workspace) return;
    try {
      await removeWorkspaceDocuments(workspace.id, [documentId], selectedPath);
      // Update local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setDocumentsTotalCount(prev => Math.max(0, prev - 1));
      showToast({
        title: 'Success',
        description: 'Document removed from workspace path successfully.'
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
  const handleRemoveDocuments = async (documentIds: number[]) => {
    if (!workspace) return;
    try {
      await removeWorkspaceDocuments(workspace.id, documentIds, selectedPath);
      // Update local state
      setDocuments(prev => prev.filter(doc => !documentIds.includes(doc.id)));
      setDocumentsTotalCount(prev => Math.max(0, prev - documentIds.length));
      showToast({
        title: 'Success',
        description: `${documentIds.length} document(s) removed from workspace path successfully.`
      });
    } catch (err) {
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

  // Layer tab interactions
  const handleSelectLayer = async (layer: any) => {
    setSelectedLayerId(layer.id);
    // If context layer, fetch documents for that single layer (use layer.name as contextSpec)
    if (workspace) {
      setIsLoadingDocuments(true);
      try {
        const response = await getWorkspaceDocuments(workspace.id, `/${layer.name}`, selectedSchemas);
        const documentsData = response.payload as DocumentsResponse;
        setDocuments(documentsData.data || []);
        setDocumentsTotalCount(documentsData.count || 0);
        setSelectedPath(`/${layer.name}`);
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
        fetchDocuments();
      }
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to destroy layer', variant: 'destructive' });
    }
  };

  const handleLayerRightClick = (e: React.MouseEvent, layer: any) => {
    if (layer.name === '/') return;
    e.preventDefault();
    setLayersContextMenu({ x: e.clientX, y: e.clientY, layer });
  };

  const handlePasteToLayer = async (layer: any) => {
    if (!workspace || copiedDocuments.length === 0) return;
    await handlePasteDocuments(`/${layer.name}`, copiedDocuments);
    setLayersContextMenu(null);
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
    <div className="flex h-full gap-6">

      {/* Main content */}
      <div className="flex-1 space-y-6">
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

        {/* File Manager Layout */}
        <div className="flex gap-6 h-[calc(100vh-300px)]">
          {/* Left Panel - Tree View */}
          <div className="w-80 border rounded-lg p-0 overflow-y-auto bg-card flex flex-col">
            <div className="flex border-b">
              <button
                className={`flex-1 py-2 text-xs font-medium ${leftTab === 'tree' ? 'border-b-2 border-primary' : ''}`}
                onClick={() => setLeftTab('tree')}
              >
                Workspace Tree
              </button>
              <button
                className={`flex-1 py-2 text-xs font-medium ${leftTab === 'layers' ? 'border-b-2 border-primary' : ''}`}
                onClick={() => setLeftTab('layers')}
              >
                Tree Layers
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              {leftTab === 'tree' ? (
                isLoadingTree ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-center space-y-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                      <p className="text-xs text-muted-foreground">Loading tree...</p>
                    </div>
                  </div>
                ) : tree ? (
                  <TreeView
                    tree={tree}
                    selectedPath={selectedPath}
                    onPathSelect={setSelectedPath}
                    readOnly={false}
                    title="Workspace Tree"
                    subtitle="Right-click for context menu, drag to move/copy (Ctrl=copy, Shift=recursive)"
                    onInsertPath={handleInsertPath}
                    onRemovePath={handleRemovePath}
                    onMovePath={handleMovePath}
                    onCopyPath={handleCopyPath}
                    onMergeUp={handleMergeUp}
                    onMergeDown={handleMergeDown}
                    onPasteDocuments={handlePasteDocuments}
                    pastedDocumentIds={copiedDocuments}
                  />
                ) : (
                  <div className="text-center text-muted-foreground text-sm">
                    Failed to load workspace tree
                  </div>
                )
              ) : (
                <div>
                  <div className="mb-2 text-sm text-muted-foreground">All Layers</div>
                  {isLoadingLayers ? (
                    <div className="text-xs text-muted-foreground">Loading layers...</div>
                  ) : layers.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No layers</div>
                  ) : (
                    <ul className="space-y-1">
                      {layers.map((layer) => (
                        <li
                          key={layer.id}
                          className={`flex items-center justify-between px-2 py-1 rounded hover:bg-accent ${selectedLayerId === layer.id ? 'bg-accent' : ''} ${layer.name === '/' ? 'opacity-60 pointer-events-none' : ''}`}
                          onContextMenu={(e) => handleLayerRightClick(e, layer)}
                        >
                          <button className="flex items-center gap-2 min-w-0 flex-1 text-left" onClick={() => handleSelectLayer(layer)} title={layer.description || layer.label}>
                            {layer.color && (
                              <span className="w-2 h-2 rounded-full border" style={{ backgroundColor: layer.color }} />
                            )}
                            <span className="truncate" title={layer.name}>{layer.name}</span>
                            {(() => {
                              const isLocked = layer.name === '/' || layer.locked === true || (Array.isArray(layer.lockedBy) && layer.lockedBy.length > 0)
                              if (isLocked) {
                                const lockedBy = Array.isArray(layer.lockedBy) ? layer.lockedBy : []
                                return <span className="text-xs text-muted-foreground" title={lockedBy.length > 0 ? `Locked by: ${lockedBy.join(', ')}` : 'Locked'}>🔒</span>
                              }
                              return null
                            })()}
                          </button>
                          {layer.name !== '/' && (
                            <div className="flex items-center gap-1 ml-2">
                              {(() => {
                                const isLocked = layer.locked === true || (Array.isArray(layer.lockedBy) && layer.lockedBy.length > 0)
                                return isLocked ? (
                                  <button className="px-1 text-xs hover:bg-muted rounded" onClick={() => handleUnlockLayer(layer)} title="Unlock">Unlock</button>
                                ) : (
                                  <button className="px-1 text-xs hover:bg-muted rounded" onClick={() => handleLockLayer(layer)} title="Lock">Lock</button>
                                )
                              })()}
                              <button className="px-1 text-xs hover:bg-muted rounded" onClick={() => handleRenameLayer(layer)} title="Rename">Rename</button>
                              <button className="px-1 text-xs hover:bg-destructive/10 text-destructive rounded" onClick={() => handleDestroyLayer(layer)} title="Destroy">Destroy</button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Center Panel - Document List */}
          <div className="flex-1 border rounded-lg p-4 bg-card flex flex-col min-h-0">
            <DocumentList
              documents={documents}
              isLoading={isLoadingDocuments}
              contextPath={selectedPath}
              totalCount={documentsTotalCount}
              viewMode="table"
              onRemoveDocument={selectedPath !== '/' ? handleRemoveDocument : undefined}
              onDeleteDocument={handleDeleteDocument}
              onRemoveDocuments={selectedPath !== '/' ? handleRemoveDocuments : undefined}
              onDeleteDocuments={handleDeleteDocuments}
              onCopyDocuments={handleCopyDocuments}
              onPasteDocuments={handlePasteDocuments}
              pastedDocumentIds={copiedDocuments}
            />
          </div>

          {/* Right Sidebar */}
          <div className="w-80 border rounded-lg p-4 bg-card">
            <div className="flex border-b mb-4">
              <button
                className={`flex-1 py-2 text-sm font-medium ${rightTab === 'tokens' ? 'border-b-2 border-primary' : ''}`}
                onClick={() => setRightTab('tokens')}
              >
                Tokens
              </button>
              <button
                className={`flex-1 py-2 text-sm font-medium ${rightTab === 'filter' ? 'border-b-2 border-primary' : ''}`}
                onClick={() => setRightTab('filter')}
              >
                Filter
              </button>
            </div>

            {rightTab === 'tokens' ? (
              <TokenManager workspaceId={workspace.id} />
            ) : (
              <div>
                <h3 className="text-lg font-semibold mb-4">Filter by Schema</h3>
                {isLoadingSchemas ? (
                  <div className="text-sm text-muted-foreground">Loading schemas...</div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {schemas.map((schema) => (
                      <label key={schema} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedSchemas.includes(schema)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSchemas(prev => [...prev, schema])
                            } else {
                              setSelectedSchemas(prev => prev.filter(s => s !== schema))
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span title={schema}>
                          {getSchemaDisplayName(schema)}
                        </span>
                      </label>
                    ))}
                    {selectedSchemas.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSchemas([])}
                        className="w-full mt-2"
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Layers context menu */}
      {layersContextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setLayersContextMenu(null)} />
          <div
            className="fixed z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: layersContextMenu.x, top: layersContextMenu.y }}
          >
            <button
              className={`relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${copiedDocuments.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => handlePasteToLayer(layersContextMenu.layer)}
            >
              Paste Documents {copiedDocuments.length > 0 ? `(${copiedDocuments.length})` : ''}
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

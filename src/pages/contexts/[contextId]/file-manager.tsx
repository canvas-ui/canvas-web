import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-container';
import { Share, X, Plus, Settings, Info, ArrowLeft } from 'lucide-react';
import { getContext, getSharedContext, updateContextUrl, getContextTree, getContextDocuments, getSharedContextDocuments, removeDocumentsFromContext, deleteDocumentsFromContext, pasteDocumentsToContext, importDocumentsToContext } from '@/services/context';
import socketService from '@/lib/socket';
import { FileManager } from '@/components/common/file-manager';
import { useTreeOperations } from '@/hooks/useTreeOperations';
import { DocumentDetailModal } from '@/components/context/document-detail-modal';
import { TreeNode, Document as WorkspaceDocument } from '@/types/workspace';

// Simple debounce utility function
const debounce = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

// Interface based on the GET /contexts and GET /contexts/:id API payloads
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

// Document interface - matches the actual API response structure for context documents
interface ContextDocument {
  id: number;
  schema: string;
  schemaVersion: string;
  data: any;
  metadata: {
    contentType: string;
    contentEncoding: string;
    dataPaths: string[];
  };
  indexOptions: {
    checksumAlgorithms: string[];
    primaryChecksumAlgorithm: string;
    checksumFields: string[];
    ftsSearchFields: string[];
    vectorEmbeddingFields: string[];
    embeddingOptions: {
      embeddingModel: string;
      embeddingDimensions: number;
      embeddingProvider: string;
      embeddingProviderOptions: Record<string, any>;
      chunking: {
        type: string;
        chunkSize: number;
        chunkOverlap: number;
      };
    };
  };
  createdAt: string;
  updatedAt: string;
  checksumArray: string[];
  embeddingsArray: any[];
  parentId: string | null;
  versions: any[];
  versionNumber: number;
  latestVersion: number;
}

export default function ContextFileManagerPage() {
  const { contextId, userId } = useParams<{ contextId: string; userId?: string }>();
  const navigate = useNavigate();
  const [context, setContext] = useState<ContextData | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [workspaceDocuments, setWorkspaceDocuments] = useState<WorkspaceDocument[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('/');
  const [editableUrl, setEditableUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [documentsTotalCount, setDocumentsTotalCount] = useState(0);
  const { showToast } = useToast();

  // Sidebar states
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isToolboxOpen, setIsToolboxOpen] = useState(false);

  // Toolbox state
  const [activeFilters, setActiveFilters] = useState({
    tabs: false,
    notes: false,
    todo: false
  });
  const [customBitmaps, setCustomBitmaps] = useState<string[]>([]);

  // Document management state
  const [copiedDocuments, setCopiedDocuments] = useState<number[]>([]);

  // Sharing state
  const [shareableLink] = useState<string | null>(null);
  const [tempEmailAddress, setTempEmailAddress] = useState('');

  // Modal state
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<WorkspaceDocument | null>(null);

  const isSharedContext = Boolean(userId);

  // Close all right sidebars
  const closeAllRightSidebars = () => {
    setIsDetailsOpen(false);
    setIsShareOpen(false);
    setIsToolboxOpen(false);
  };

  // Toggle specific sidebar
  const toggleSidebar = (sidebarName: 'details' | 'share' | 'toolbox') => {
    switch (sidebarName) {
      case 'details':
        closeAllRightSidebars();
        setIsDetailsOpen(true);
        break;
      case 'share':
        closeAllRightSidebars();
        setIsShareOpen(true);
        break;
      case 'toolbox':
        closeAllRightSidebars();
        setIsToolboxOpen(true);
        break;
    }
  };

  // Add these handlers for tree operations  
  const handlePathSelect = (path: string) => {
    setSelectedPath(path);
  };



  // Convert ContextDocument to WorkspaceDocument for compatibility with DocumentList
  const convertToWorkspaceDocuments = (contextDocs: ContextDocument[]): WorkspaceDocument[] => {
    return contextDocs.map(doc => ({
      ...doc,
      parentId: doc.parentId ? parseInt(doc.parentId as string) : null
    }));
  };

  // Fetch documents with feature filters
  const fetchDocuments = useCallback(async () => {
    if (!contextId) return;

    setIsLoadingDocuments(true);
    try {
      const featureArray = [];

      // Add feature filters based on toolbox settings
      if (activeFilters.tabs) featureArray.push('data/abstraction/tab');
      if (activeFilters.notes) featureArray.push('data/abstraction/note');
      if (activeFilters.todo) featureArray.push('data/abstraction/todo');

      // Add custom bitmaps
      featureArray.push(...customBitmaps);

      // Use REST API to get documents with filters
      const documentsData = isSharedContext && userId
        ? await getSharedContextDocuments(userId, contextId, featureArray, [], {})
        : await getContextDocuments(contextId, featureArray, [], {});

      setWorkspaceDocuments(convertToWorkspaceDocuments(documentsData));
      setDocumentsTotalCount(documentsData.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      setWorkspaceDocuments([]);
      setDocumentsTotalCount(0);
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [contextId, activeFilters, customBitmaps, userId, isSharedContext]);

  // Fetch context details
  const fetchContextDetails = useCallback(async () => {
    if (!contextId) return;
    setIsLoading(true);
    try {
      const fetchedContext = isSharedContext && userId
        ? await getSharedContext(userId, contextId)
        : await getContext(contextId);

      if (!fetchedContext) {
        throw new Error('No context data received from getContext service.');
      }

      if (typeof fetchedContext.id !== 'string' || typeof fetchedContext.url !== 'string') {
        throw new Error('Fetched context data is invalid, incomplete, or not of the expected type.');
      }

      // Convert Context to ContextData format
      const contextData: ContextData = {
        id: fetchedContext.id,
        userId: fetchedContext.userId,
        url: fetchedContext.url,
        baseUrl: fetchedContext.baseUrl || null,
        path: fetchedContext.path || null,
        pathArray: fetchedContext.pathArray || [],
        workspaceId: fetchedContext.workspaceId || fetchedContext.workspace,
        workspaceName: fetchedContext.workspaceName || fetchedContext.workspace,
        acl: (fetchedContext as any).acl || {},
        createdAt: fetchedContext.createdAt,
        updatedAt: fetchedContext.updatedAt,
        locked: fetchedContext.locked || false,
        serverContextArray: fetchedContext.serverContextArray || [],
        clientContextArray: fetchedContext.clientContextArray || [],
        contextBitmapArray: fetchedContext.contextBitmapArray || [],
        featureBitmapArray: fetchedContext.featureBitmapArray || [],
        filterArray: fetchedContext.filterArray || [],
        pendingUrl: fetchedContext.pendingUrl || null,
        description: fetchedContext.description || null
      };

      setContext(contextData);
      setEditableUrl(contextData.url);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to fetch context ${contextId}`;
      setError(message);
      setContext(null);
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [contextId, userId, isSharedContext]);

  // Fetch context tree
  const fetchContextTree = useCallback(async () => {
    if (!contextId) return;
    setIsLoadingTree(true);
    try {
      const treeData = await getContextTree(contextId);
      setTree(treeData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tree';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      setTree(null);
    } finally {
      setIsLoadingTree(false);
    }
  }, [contextId]);

  // Tree operations hook
  const treeOperations = useTreeOperations({
    contextId: contextId || '',
    onRefresh: fetchContextTree
  });

  // Document handlers
  const handleRemoveDocument = async (documentId: number) => {
    if (!contextId) return;
    try {
      await removeDocumentsFromContext(contextId, [documentId]);
      await fetchDocuments();
      showToast({
        title: 'Success',
        description: 'Document removed from context',
        variant: 'default'
      });
    } catch (err) {
      showToast({
        title: 'Error',
        description: 'Failed to remove document',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!contextId) return;
    try {
      await deleteDocumentsFromContext(contextId, [documentId]);
      await fetchDocuments();
      showToast({
        title: 'Success',
        description: 'Document deleted permanently',
        variant: 'default'
      });
    } catch (err) {
      showToast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive'
      });
    }
  };

  const handleRemoveDocuments = async (documentIds: number[]) => {
    if (!contextId) return;
    try {
      await removeDocumentsFromContext(contextId, documentIds);
      await fetchDocuments();
      showToast({
        title: 'Success',
        description: `${documentIds.length} documents removed from context`,
        variant: 'default'
      });
    } catch (err) {
      showToast({
        title: 'Error',
        description: 'Failed to remove documents',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteDocuments = async (documentIds: number[]) => {
    if (!contextId) return;
    try {
      await deleteDocumentsFromContext(contextId, documentIds);
      await fetchDocuments();
      showToast({
        title: 'Success',
        description: `${documentIds.length} documents deleted permanently`,
        variant: 'default'
      });
    } catch (err) {
      showToast({
        title: 'Error',
        description: 'Failed to delete documents',
        variant: 'destructive'
      });
    }
  };

  const handleCopyDocuments = (documentIds: number[]) => {
    setCopiedDocuments(documentIds);
    showToast({
      title: 'Success',
      description: `${documentIds.length} document(s) copied`,
      variant: 'default'
    });
  };

  const handlePasteDocuments = async (path: string, documentIds: number[]): Promise<boolean> => {
    if (!contextId) return false;
    try {
      await pasteDocumentsToContext(contextId, path, documentIds);
      await fetchDocuments();
      setCopiedDocuments([]);
      showToast({
        title: 'Success',
        description: `${documentIds.length} document(s) pasted to ${path}`,
        variant: 'default'
      });
      return true;
    } catch (err) {
      showToast({
        title: 'Error',
        description: 'Failed to paste documents',
        variant: 'destructive'
      });
      return false;
    }
  };

  const handleImportDocuments = async (documents: any[], contextPath: string): Promise<boolean> => {
    if (!contextId || !context?.workspaceId) return false;
    try {
      await importDocumentsToContext(context.workspaceId, contextPath, documents);
      await fetchDocuments();
      showToast({
        title: 'Success',
        description: `${documents.length} document(s) imported`,
        variant: 'default'
      });
      return true;
    } catch (err) {
      showToast({
        title: 'Error',
        description: 'Failed to import documents',
        variant: 'destructive'
      });
      return false;
    }
  };

  // Load initial data
  useEffect(() => {
    fetchContextDetails();
    fetchContextTree();
  }, [fetchContextDetails, fetchContextTree]);

  // Load documents when context changes or filters change
  useEffect(() => {
    fetchDocuments();
  }, [context?.id, activeFilters, customBitmaps, contextId, userId, isSharedContext, fetchDocuments]);

  // WebSocket event handling - only for context updates
  useEffect(() => {
    if (!contextId) return;

    const handleContextUpdate = (data: any) => {
      if (data.contextId === contextId) {
        fetchContextDetails();
        fetchDocuments();
      }
    };

    socketService.on('contextUpdate', handleContextUpdate);

    return () => {
      socketService.off('contextUpdate', handleContextUpdate);
    };
  }, [contextId, fetchContextDetails, fetchDocuments]);

  const debouncedSave = useCallback(
    debounce(async (url: string) => {
      if (!context || isSaving || url === context.url) return;

      setIsSaving(true);
      try {
        await updateContextUrl(context.id, url);
        setContext(prev => prev ? { ...prev, url } : null);
        showToast({
          title: 'Success',
          description: 'Context URL updated successfully',
          variant: 'default'
        });
      } catch (error) {
        showToast({
          title: 'Error',
          description: 'Failed to update context URL',
          variant: 'destructive'
        });
        // Revert the URL on error
        setEditableUrl(context.url);
      } finally {
        setIsSaving(false);
      }
    }, 1000),
    [context, isSaving]
  );

  useEffect(() => {
    if (editableUrl && context && editableUrl !== context.url) {
      debouncedSave(editableUrl);
    }
  }, [editableUrl, context, debouncedSave]);

  const anyRightSidebarOpen = isDetailsOpen || isShareOpen || isToolboxOpen;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading context...</p>
        </div>
      </div>
    );
  }

  if (error || !context) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-destructive">Error</h2>
          <p className="text-muted-foreground">{error || 'Context not found'}</p>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col ${anyRightSidebarOpen ? 'mr-96' : ''}`}>
        {/* Browser-like Toolbar */}
        <div className="flex items-center gap-2 p-2 border rounded-md shadow-sm bg-background">
          {/* Back Button */}
          <Button
            onClick={() => {
              const baseUrl = userId 
                ? `/users/${userId}/contexts/${contextId}`
                : `/contexts/${contextId}`
              navigate(baseUrl)
            }}
            variant="outline"
            size="sm"
            className="p-2"
            title="Back to regular view"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* URL Input */}
          <div className="flex-1">
            <Input
              value={editableUrl}
              onChange={(e) => setEditableUrl(e.target.value)}
              placeholder="Enter context URL..."
              className="text-sm"
              disabled={isSaving}
            />
          </div>

          {/* Action Buttons */}
          <Button
            onClick={() => toggleSidebar('details')}
            variant={isDetailsOpen ? "default" : "outline"}
            size="sm"
            className="p-2"
            title="View context details"
          >
            <Info className="h-4 w-4" />
          </Button>

          <Button
            onClick={() => toggleSidebar('share')}
            variant={isShareOpen ? "default" : "outline"}
            size="sm"
            className="p-2"
            title="Share context"
          >
            <Share className="h-4 w-4" />
          </Button>

          <Button
            onClick={() => toggleSidebar('toolbox')}
            variant={isToolboxOpen ? "default" : "outline"}
            size="sm"
            className="p-2"
            title="Content filters"
          >
            <Settings className="h-4 w-4" />
          </Button>

          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              Saving...
            </div>
          )}
        </div>

        {/* File Manager */}
        <div className="flex-1 mt-4">
          {isLoadingTree ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground">Loading file manager...</p>
              </div>
            </div>
          ) : tree ? (
            <FileManager
              tree={tree}
              selectedPath={selectedPath}
              onPathSelect={handlePathSelect}
              documents={workspaceDocuments}
              isLoadingDocuments={isLoadingDocuments}
              documentsTotalCount={documentsTotalCount}
              onInsertPath={treeOperations.insertPath}
              onRemovePath={treeOperations.removePath}
              onMovePath={treeOperations.movePath}
              onCopyPath={treeOperations.copyPath}
              onMergeUp={treeOperations.mergeUp}
              onMergeDown={treeOperations.mergeDown}
              onSubtractUp={treeOperations.subtractUp}
              onSubtractDown={treeOperations.subtractDown}
              onRemoveDocument={selectedPath !== '/' ? handleRemoveDocument : undefined}
              onDeleteDocument={handleDeleteDocument}
              onRemoveDocuments={selectedPath !== '/' ? handleRemoveDocuments : undefined}
              onDeleteDocuments={handleDeleteDocuments}
              onCopyDocuments={handleCopyDocuments}
              onPasteDocuments={handlePasteDocuments}
              onImportDocuments={!isSharedContext ? handleImportDocuments : undefined}
              pastedDocumentIds={copiedDocuments}
              readOnly={isSharedContext}
              contextPath={selectedPath}
              activeContextUrl={editableUrl}
              currentContextUrl={context.url}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <h3 className="text-lg font-medium">No tree data available</h3>
                <p className="text-muted-foreground">Unable to load context tree</p>
                <Button onClick={fetchContextTree}>
                  Retry
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Details, Share, Toolbox */}
      {anyRightSidebarOpen && (
        <div className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-lg overflow-y-auto z-50">
          {/* Sidebar Header */}
          <div className="flex border-b mb-4">
            <button
              className={`flex-1 py-2 text-sm font-medium ${isDetailsOpen ? 'border-b-2 border-primary' : ''}`}
              onClick={() => toggleSidebar('details')}
            >
              Details
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium ${isShareOpen ? 'border-b-2 border-primary' : ''}`}
              onClick={() => toggleSidebar('share')}
            >
              Share
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium ${isToolboxOpen ? 'border-b-2 border-primary' : ''}`}
              onClick={() => toggleSidebar('toolbox')}
            >
              Filter
            </button>
            <Button
              onClick={closeAllRightSidebars}
              variant="ghost"
              size="sm"
              className="p-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Sidebar Content */}
          <div className="p-4">
            {/* Context Details Content */}
            {isDetailsOpen && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Basic Information</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">ID:</span>
                      <span className="ml-2 font-mono">{context.id}</span>
                    </div>
                    <div>
                      <span className="font-medium">User ID:</span>
                      <span className="ml-2 font-mono">{context.userId}</span>
                    </div>
                    <div>
                      <span className="font-medium">Workspace ID:</span>
                      <span className="ml-2 font-mono">{context.workspaceId}</span>
                    </div>
                    <div>
                      <span className="font-medium">Created:</span>
                      <span className="ml-2">{new Date(context.createdAt).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="font-medium">Last Updated:</span>
                      <span className="ml-2">{new Date(context.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {context.description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground">{context.description}</p>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-2">Status</h4>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${context.locked ? 'bg-red-500' : 'bg-green-500'}`}></div>
                    <span className="text-sm">{context.locked ? 'Locked' : 'Active'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Share Content */}
            {isShareOpen && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Share Context</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Share this context with other users by granting them access.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Email Address</label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={tempEmailAddress}
                      onChange={(e) => setTempEmailAddress(e.target.value)}
                      className="flex-1"
                    />
                    <Button size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {shareableLink && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Shareable Link</label>
                    <div className="flex gap-2">
                      <Input
                        value={shareableLink}
                        readOnly
                        className="flex-1 font-mono text-xs"
                      />
                      <Button size="sm" variant="outline">
                        Copy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Toolbox/Filter Content */}
            {isToolboxOpen && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Content Filters</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Filter documents by type and custom tags.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={activeFilters.tabs}
                      onChange={(e) => setActiveFilters(prev => ({ ...prev, tabs: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Browser Tabs</span>
                  </label>

                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={activeFilters.notes}
                      onChange={(e) => setActiveFilters(prev => ({ ...prev, notes: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Notes</span>
                  </label>

                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={activeFilters.todo}
                      onChange={(e) => setActiveFilters(prev => ({ ...prev, todo: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Todo Items</span>
                  </label>
                </div>

                {customBitmaps.length > 0 && (
                  <div>
                    <h5 className="font-medium mb-2 text-sm">Custom Filters</h5>
                    <div className="space-y-1">
                      {customBitmaps.map((bitmap, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <span className="text-sm font-mono">{bitmap}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCustomBitmaps(prev => prev.filter((_, i) => i !== index))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Detail Modal */}
      <DocumentDetailModal
        document={selectedDocument ? {
          ...selectedDocument,
          parentId: selectedDocument.parentId?.toString() || null
        } : null}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedDocument(null);
        }}
      />
    </div>
  );
}
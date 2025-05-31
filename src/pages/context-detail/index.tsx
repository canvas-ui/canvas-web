import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-container';
import { Save, Share, X, Plus, Settings, Info, Sidebar, Eye, Trash2, Minus } from 'lucide-react';
import { getContext, updateContextUrl, grantContextAccess, revokeContextAccess, getContextTree, getContextDocuments } from '@/services/context';
import socketService from '@/lib/socket';
import { getCurrentUserFromToken } from '@/services/auth';
import { ContextTreeView } from '@/components/context/tree-view';
import { DocumentDetailModal } from '@/components/context/document-detail-modal';
import { TreeNode } from '@/types/workspace';

// Interface based on the GET /contexts and GET /contexts/:id API payloads
interface ContextData {
  id: string;
  userId: string;
  url: string;
  baseUrl: string | null;
  path: string | null;
  pathArray: string[];
  workspaceId: string;
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

// Document interface - matches the actual API response structure
interface Document {
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

// WebSocket event types
const WS_EVENTS = {
  CONTEXT_CREATED: 'context:created',
  CONTEXT_UPDATED: 'context:updated',
  CONTEXT_DELETED: 'context:deleted',
  CONTEXT_URL_CHANGED: 'context:url:changed',
  CONTEXT_LOCKED: 'context:locked',
  CONTEXT_UNLOCKED: 'context:unlocked',
  CONTEXT_ACL_UPDATED: 'context:acl:updated',
  CONTEXT_ACL_REVOKED: 'context:acl:revoked'
};

export default function ContextDetailPage() {
  const { contextId } = useParams<{ contextId: string }>();
  const [context, setContext] = useState<ContextData | null>(null);
  const [editableUrl, setEditableUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const { showToast } = useToast();

  // Sidebar states
  const [isTreeViewOpen, setIsTreeViewOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isToolboxOpen, setIsToolboxOpen] = useState(false);

  // Tree view state
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>('/');
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  // Toolbox state
  const [activeFilters, setActiveFilters] = useState({
    tabs: false,
    notes: false,
    todo: false
  });
  const [customBitmaps, setCustomBitmaps] = useState<string[]>([]);
  const [newBitmapInput, setNewBitmapInput] = useState('');

  // Sharing state
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState<string>('documentRead');
  const [isSharing, setIsSharing] = useState(false);

  // Document detail modal state
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);

  // Get current user to check if they're the owner
  const currentUser = getCurrentUserFromToken();
  const isOwner = currentUser && context && currentUser.id === context.userId;

  // Close all right sidebars
  const closeAllRightSidebars = () => {
    setIsDetailsOpen(false);
    setIsShareOpen(false);
    setIsToolboxOpen(false);
  };

  // Toggle specific sidebar
  const toggleSidebar = (sidebarName: 'tree' | 'details' | 'share' | 'toolbox') => {
    switch (sidebarName) {
      case 'tree':
        // Tree view is on the left, just toggle it
        setIsTreeViewOpen(!isTreeViewOpen);
        break;
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

  // Fetch context tree
  const fetchContextTree = useCallback(async () => {
    if (!contextId) return;

    setIsLoadingTree(true);
    try {
      console.log(`Fetching context tree for contextId: ${contextId}`);
      // Use REST API to get context tree
      const treeData = await getContextTree(contextId);
      console.log('Context tree fetched:', treeData);

      if (treeData) {
        setTree(treeData);
      } else {
        console.warn('No tree data received from API');
        setTree(null);
      }
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch context tree';
      console.error('Context tree fetch error:', err);
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      setTree(null);
    } finally {
      setIsLoadingTree(false);
    }
  }, [contextId, showToast]);

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
      const documentsData = await getContextDocuments(contextId, featureArray, [], {});
      setDocuments(documentsData || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      setDocuments([]);
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [contextId, activeFilters, customBitmaps, showToast]);

  // Update context URL from tree path selection
  const handlePathSelect = (path: string) => {
    setSelectedPath(path);
    if (context && context.url) {
      // Extract workspace part from current URL and combine with new path
      let newUrl;
      if (context.url.includes('://')) {
        // Current URL has workspace format: workspaceName://currentPath
        const workspacePart = context.url.split('://')[0];
        const pathPart = path.startsWith('/') ? path.slice(1) : path;
        newUrl = `${workspacePart}://${pathPart}`;
      } else {
        // Current URL is just a path, keep it as a path
        newUrl = path;
      }

      console.log('Selected path:', path);
      console.log('Current URL:', context.url);
      console.log('New URL:', newUrl);

      setEditableUrl(newUrl);
    }
  };

  // Fetch context details
  const fetchContextDetails = useCallback(async () => {
    if (!contextId) return;
    setIsLoading(true);
    try {
      const fetchedContext = await getContext(contextId) as unknown as ContextData;

      if (!fetchedContext) {
        throw new Error('No context data received from getContext service.');
      }

      if (typeof fetchedContext.id !== 'string' || typeof fetchedContext.url !== 'string') {
        throw new Error('Fetched context data is invalid, incomplete, or not of the expected type.');
      }

      // Log context data for debugging
      console.log('Fetched context data:', fetchedContext);
      console.log('Context workspaceId:', fetchedContext.workspaceId);
      console.log('Context URL:', fetchedContext.url);

      setContext(fetchedContext);
      setEditableUrl(fetchedContext.url);
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
    }
    setIsLoading(false);
  }, [contextId]);

  // Initial data fetch
  useEffect(() => {
    fetchContextDetails();
  }, [fetchContextDetails]);

  // Fetch documents when filters change
  useEffect(() => {
    if (context) {
      fetchDocuments();
    }
  }, [fetchDocuments, context]);

  // Fetch tree when tree view opens
  useEffect(() => {
    if (isTreeViewOpen && !tree) {
      fetchContextTree();
    }
  }, [isTreeViewOpen, fetchContextTree, tree]);

  // WebSocket event handling
  useEffect(() => {
    if (!contextId) return;

    if (!socketService.isConnected()) {
      socketService.reconnect();
      return;
    }

    console.log(`Subscribing to context events for context ${contextId}`);
    socketService.emit('subscribe', { topic: 'context', id: contextId });

    const handleContextUpdateReceived = (data: { context: Partial<ContextData> }) => {
      if (data.context && data.context.id === contextId) {
        setContext(prev => prev ? { ...prev, ...data.context } as ContextData : null);
        if (data.context.url) {
          setEditableUrl(data.context.url);
          fetchDocuments();
        }
      }
    };

    const handleContextUrlChanged = (data: { id: string; url: string }) => {
      if (data.id === contextId) {
        setContext(prev => prev ? { ...prev, url: data.url } : null);
        setEditableUrl(data.url);
        fetchDocuments();
      }
    };

    const handleContextLockStatusChanged = (data: { id: string; locked: boolean }) => {
      if (data.id === contextId) {
        setContext(prev => prev ? { ...prev, locked: data.locked } : null);
      }
    };

    const handleContextDeleted = (data: { id: string } | { contextId: string }) => {
      const deletedId = ('id' in data) ? data.id : data.contextId;
      if (deletedId === contextId) {
        setContext(null);
        setError('Context has been deleted.');
        showToast({
          title: 'Context Deleted',
          description: 'This context has been deleted.',
          variant: 'destructive'
        });
      }
    };

    const handleContextAclUpdated = (data: { id: string; acl: Record<string, any>; sharedWithUserId?: string; accessLevel?: string }) => {
      if (data.id === contextId) {
        setContext(prev => prev ? { ...prev, acl: data.acl } : null);
        if (data.sharedWithUserId && data.accessLevel) {
          showToast({
            title: 'Access Granted',
            description: `${data.sharedWithUserId} was granted ${data.accessLevel} access to this context.`
          });
        }
      }
    };

    const handleContextAclRevoked = (data: { id: string; acl: Record<string, any>; revokedFromUserId?: string }) => {
      if (data.id === contextId) {
        setContext(prev => prev ? { ...prev, acl: data.acl } : null);
        if (data.revokedFromUserId) {
          showToast({
            title: 'Access Revoked',
            description: `Access was revoked from ${data.revokedFromUserId} for this context.`
          });
        }
      }
    };

    // Handle tree-related events
    const handleTreePathInserted = (data: any) => {
      if (data.contextId === contextId || data.id === contextId) {
        // Refresh tree when paths are inserted
        fetchContextTree();
      }
    };

    const handleTreePathRemoved = (data: any) => {
      if (data.contextId === contextId || data.id === contextId) {
        // Refresh tree when paths are removed
        fetchContextTree();
      }
    };

    const handleTreePathMoved = (data: any) => {
      if (data.contextId === contextId || data.id === contextId) {
        // Refresh tree when paths are moved
        fetchContextTree();
      }
    };

    // Listen for context events
    socketService.on(WS_EVENTS.CONTEXT_UPDATED, handleContextUpdateReceived);
    socketService.on(WS_EVENTS.CONTEXT_URL_CHANGED, handleContextUrlChanged);
    socketService.on(WS_EVENTS.CONTEXT_LOCKED, handleContextLockStatusChanged);
    socketService.on(WS_EVENTS.CONTEXT_UNLOCKED, handleContextLockStatusChanged);
    socketService.on(WS_EVENTS.CONTEXT_DELETED, handleContextDeleted);
    socketService.on(WS_EVENTS.CONTEXT_ACL_UPDATED, handleContextAclUpdated);
    socketService.on(WS_EVENTS.CONTEXT_ACL_REVOKED, handleContextAclRevoked);

    // Listen for tree events
    socketService.on('context:workspace:tree:path:inserted', handleTreePathInserted);
    socketService.on('context:workspace:tree:path:removed', handleTreePathRemoved);
    socketService.on('context:workspace:tree:path:moved', handleTreePathMoved);
    socketService.on('context:workspace:tree:path:copied', handleTreePathMoved); // Same as moved

    return () => {
      socketService.emit('unsubscribe', { topic: 'context', id: contextId });
      socketService.off(WS_EVENTS.CONTEXT_UPDATED, handleContextUpdateReceived);
      socketService.off(WS_EVENTS.CONTEXT_URL_CHANGED, handleContextUrlChanged);
      socketService.off(WS_EVENTS.CONTEXT_LOCKED, handleContextLockStatusChanged);
      socketService.off(WS_EVENTS.CONTEXT_UNLOCKED, handleContextLockStatusChanged);
      socketService.off(WS_EVENTS.CONTEXT_DELETED, handleContextDeleted);
      socketService.off(WS_EVENTS.CONTEXT_ACL_UPDATED, handleContextAclUpdated);
      socketService.off(WS_EVENTS.CONTEXT_ACL_REVOKED, handleContextAclRevoked);

      // Clean up tree event listeners
      socketService.off('context:workspace:tree:path:inserted', handleTreePathInserted);
      socketService.off('context:workspace:tree:path:removed', handleTreePathRemoved);
      socketService.off('context:workspace:tree:path:moved', handleTreePathMoved);
      socketService.off('context:workspace:tree:path:copied', handleTreePathMoved);
    };
  }, [contextId, fetchDocuments]);

  // Handle URL change
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditableUrl(e.target.value);
  };

  // Handle set context URL
  const handleSetContextUrl = async () => {
    if (!context || editableUrl === context.url) return;
    setIsSaving(true);
    try {
      const response = await updateContextUrl(context.id, editableUrl);
      let updatedContextData: ContextData | null = null;

      if ((response as any)?.payload?.context?.id && typeof (response as any)?.payload?.context?.url === 'string') {
        updatedContextData = (response as any).payload.context as ContextData;
      } else if ((response as any)?.payload?.id && typeof (response as any)?.payload?.url === 'string') {
        updatedContextData = (response as any).payload as ContextData;
      } else if ((response as any)?.id && typeof (response as any)?.url === 'string') {
        updatedContextData = response as unknown as ContextData;
      } else if (response && typeof (response as any).url === 'string') {
        const newUpdatedAt = new Date().toISOString();
        updatedContextData = {
          ...(context as unknown as ContextData),
          url: (response as any).url,
          updatedAt: newUpdatedAt
        } as ContextData;
      } else {
        throw new Error('Unexpected response format from server when updating URL.');
      }

      if (updatedContextData) {
        setContext(updatedContextData);
        setEditableUrl(updatedContextData.url);
        await fetchDocuments();
        showToast({
          title: 'Success',
          description: 'Context URL set successfully.'
        });
      } else {
        throw new Error('Failed to process update response or response was empty.');
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set context URL';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      if (context) {
        setEditableUrl(context.url);
      }
    }
    setIsSaving(false);
  };

  // Handle toolbox filter changes
  const handleFilterToggle = (filter: keyof typeof activeFilters) => {
    setActiveFilters(prev => ({
      ...prev,
      [filter]: !prev[filter]
    }));
  };

  // Handle custom bitmap addition
  const handleAddCustomBitmap = () => {
    if (newBitmapInput.trim() && !customBitmaps.includes(newBitmapInput.trim())) {
      setCustomBitmaps(prev => [...prev, newBitmapInput.trim()]);
      setNewBitmapInput('');
    }
  };

  // Handle custom bitmap removal
  const handleRemoveCustomBitmap = (bitmap: string) => {
    setCustomBitmaps(prev => prev.filter(b => b !== bitmap));
  };

  // Handle grant access
  const handleGrantAccess = async () => {
    if (!context || !shareEmail.trim()) return;

    setIsSharing(true);
    try {
      await grantContextAccess(context.userId, context.id, shareEmail.trim(), sharePermission);

      setContext(prev => prev ? {
        ...prev,
        acl: {
          ...prev.acl,
          [shareEmail.trim()]: sharePermission
        }
      } : null);

      setShareEmail('');

      showToast({
        title: 'Success',
        description: `Access granted to ${shareEmail.trim()} with ${sharePermission} permission.`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to grant access';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
    setIsSharing(false);
  };

  // Handle revoke access
  const handleRevokeAccess = async (userEmail: string) => {
    if (!context) return;

    try {
      await revokeContextAccess(context.userId, context.id, userEmail);

      setContext(prev => {
        if (!prev) return null;
        const newAcl = { ...prev.acl };
        delete newAcl[userEmail];
        return {
          ...prev,
          acl: newAcl
        };
      });

      showToast({
        title: 'Success',
        description: `Access revoked from ${userEmail}.`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke access';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
  };

  // Handle document removal from context
  const handleRemoveDocument = async (documentId: number) => {
    if (!context) return;

    try {
      socketService.emit('context:document:remove', {
        contextId: context.id,
        documentId: documentId.toString()
      }, (response: any) => {
        if (response.success) {
          // Refresh documents list
          fetchDocuments();
          showToast({
            title: 'Success',
            description: 'Document removed from context successfully.'
          });
        } else {
          showToast({
            title: 'Error',
            description: 'Failed to remove document from context.',
            variant: 'destructive'
          });
        }
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

  // Handle document deletion from database
  const handleDeleteDocument = async (documentId: number) => {
    if (!context) return;

    try {
      socketService.emit('context:document:delete', {
        contextId: context.id,
        documentId: documentId.toString()
      }, (response: any) => {
        if (response.success) {
          // Refresh documents list
          fetchDocuments();
          showToast({
            title: 'Success',
            description: 'Document deleted from database successfully.'
          });
        } else {
          showToast({
            title: 'Error',
            description: 'Failed to delete document from database.',
            variant: 'destructive'
          });
        }
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

  // Handle show document details
  const handleShowDocumentDetails = (document: Document) => {
    setSelectedDocument(document);
    setIsDocumentModalOpen(true);
  };

  if (isLoading) {
    return <div className="text-center">Loading context details...</div>;
  }

  if (error && !context) {
    return <div className="text-center text-destructive">Error: {error}</div>;
  }

  if (!context) {
    return <div className="text-center">Context not found or has been deleted.</div>;
  }

  const anyRightSidebarOpen = isDetailsOpen || isShareOpen || isToolboxOpen;

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Tree View */}
      {isTreeViewOpen && (
        <div className="w-80 bg-background border-r shadow-lg overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Context Tree</h3>
            <Button
              onClick={() => setIsTreeViewOpen(false)}
              variant="ghost"
              size="sm"
              className="p-1"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-4">
            {isLoadingTree ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center space-y-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  <p className="text-xs text-muted-foreground">Loading tree...</p>
                </div>
              </div>
            ) : tree ? (
              <ContextTreeView
                tree={tree}
                selectedPath={selectedPath}
                onPathSelect={handlePathSelect}
                contextId={context?.id || ''}
                workspaceId={context?.workspaceId || ''}
              />
            ) : (
              <div className="text-center text-muted-foreground text-sm">
                Failed to load context tree
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-1 space-y-6 transition-all duration-300 ${anyRightSidebarOpen ? 'mr-96' : ''}`}>
        {/* Browser-like Toolbar */}
        <div className="flex items-center gap-2 p-2 border rounded-md shadow-sm bg-background">
          {/* Tree View Toggle */}
          <Button
            onClick={() => toggleSidebar('tree')}
            variant={isTreeViewOpen ? "default" : "outline"}
            size="sm"
            className="p-2"
            title="Toggle tree view"
          >
            <Sidebar className="h-4 w-4" />
          </Button>

          {/* Context URL Input */}
          <div className="flex items-center flex-grow">
            <span className="text-sm font-medium text-muted-foreground mr-2">
              ({context.id})
            </span>
            <Input
              id="contextUrlInput"
              type="text"
              value={editableUrl}
              onChange={handleUrlChange}
              className="font-mono h-10 flex-grow border-0 focus-visible:ring-0 focus-visible:ring-offset-0 !shadow-none"
              placeholder="workspaceID:/path/to/context"
              disabled={isSaving || context.locked}
            />
          </div>

          {/* Set Context Button */}
          <Button
            onClick={handleSetContextUrl}
            disabled={isSaving || !context || editableUrl === context.url || context.locked}
            size="sm"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Setting...' : 'Set Context'}
          </Button>

          {/* Context Details Button */}
          <Button
            onClick={() => toggleSidebar('details')}
            variant={isDetailsOpen ? "default" : "outline"}
            size="sm"
            className="p-2"
            title="Show context details"
          >
            <Info className="h-4 w-4" />
          </Button>

          {/* Share Button */}
          {isOwner && (
            <Button
              onClick={() => toggleSidebar('share')}
              variant={isShareOpen ? "default" : "outline"}
              size="sm"
              className="p-2"
              title="Share context"
            >
              <Share className="h-4 w-4" />
            </Button>
          )}

          {/* Toolbox Button */}
          <Button
            onClick={() => toggleSidebar('toolbox')}
            variant={isToolboxOpen ? "default" : "outline"}
            size="sm"
            className="p-2"
            title="Open toolbox"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Page Header */}
        <div className="border-b pb-4">
          <h1 className="text-3xl font-bold tracking-tight">Context: {context.id}</h1>
          <p className="text-muted-foreground mt-2">{context.description || 'No description available'}</p>
        </div>

        {/* Documents Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Documents</h2>
            <div className="text-sm text-muted-foreground">
              {documents.length} documents
              {Object.values(activeFilters).some(Boolean) || customBitmaps.length > 0 ? ' (filtered)' : ''}
            </div>
          </div>

          {/* Documents List */}
          <div className="min-h-[300px]">
            {isLoadingDocuments ? (
              <div className="text-center text-muted-foreground">Loading documents...</div>
            ) : documents.length === 0 ? (
              <div className="text-center text-muted-foreground">
                <p>No documents found</p>
                <p className="text-sm">Documents will appear here when available.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {documents.map((doc) => (
                  <div key={doc.id} className="p-4 border rounded-md bg-background">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold">{doc.data.title || 'Untitled Document'}</h3>
                        <p className="text-sm text-muted-foreground">{doc.schema}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleShowDocumentDetails(doc)}
                          variant="outline"
                          size="sm"
                          className="p-1"
                          title="View document details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => handleRemoveDocument(doc.id)}
                          variant="outline"
                          size="sm"
                          className="p-1"
                          title="Remove document from context (keep in database)"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => handleDeleteDocument(doc.id)}
                          variant="outline"
                          size="sm"
                          className="p-1 text-destructive hover:text-destructive"
                          title="Delete document from database (permanent)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {doc.data.url && (
                      <a
                        href={doc.data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all"
                      >
                        {doc.data.url}
                      </a>
                    )}
                    <div className="mt-2 text-xs text-muted-foreground">
                      <span>Version {doc.versionNumber}</span>
                      <span className="ml-4">{new Date(doc.createdAt).toLocaleString()}</span>
                      {doc.checksumArray && doc.checksumArray.length > 0 && (
                        <span className="ml-4">
                          Checksums: {doc.checksumArray.length}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      {anyRightSidebarOpen && (
        <div className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-lg overflow-y-auto z-50">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">
              {isDetailsOpen && 'Context Details'}
              {isShareOpen && 'Share Context'}
              {isToolboxOpen && 'Toolbox'}
            </h3>
            <Button
              onClick={closeAllRightSidebars}
              variant="ghost"
              size="sm"
              className="p-1"
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
                      <span className="font-medium">Current URL:</span>
                      <span className="ml-2 font-mono text-xs break-all">{context.url}</span>
                    </div>
                    <div>
                      <span className="font-medium">Locked:</span>
                      <span className="ml-2">{context.locked ? 'Yes' : 'No'}</span>
                    </div>
                    <div>
                      <span className="font-medium">Created:</span>
                      <span className="ml-2">{new Date(context.createdAt).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="font-medium">Updated:</span>
                      <span className="ml-2">{new Date(context.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Share Context Content */}
            {isShareOpen && isOwner && (
              <div className="space-y-4">
                {/* Share Form */}
                <div>
                  <h4 className="font-medium mb-3">Share with a user</h4>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="shareEmail" className="block text-sm font-medium mb-1">
                        Email Address
                      </label>
                      <Input
                        id="shareEmail"
                        type="email"
                        value={shareEmail}
                        onChange={(e) => setShareEmail(e.target.value)}
                        placeholder="user@example.com"
                        disabled={isSharing}
                      />
                    </div>
                    <div>
                      <label htmlFor="sharePermission" className="block text-sm font-medium mb-1">
                        Permission Level
                      </label>
                      <select
                        id="sharePermission"
                        value={sharePermission}
                        onChange={(e) => setSharePermission(e.target.value)}
                        disabled={isSharing}
                        className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="documentRead">Read Only</option>
                        <option value="documentWrite">Read + Append</option>
                        <option value="documentReadWrite">Full Access</option>
                      </select>
                    </div>
                    <Button
                      onClick={handleGrantAccess}
                      disabled={!shareEmail.trim() || isSharing}
                      size="sm"
                      className="w-full"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {isSharing ? 'Granting...' : 'Grant Access'}
                    </Button>
                  </div>
                </div>

                {/* Current Shares */}
                <div>
                  <h4 className="font-medium mb-3">Current Access</h4>
                  <div className="space-y-2">
                    {/* Owner */}
                    <div className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-medium">O</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium">{context.userId}</div>
                          <div className="text-xs text-muted-foreground">Owner</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">Full Access</div>
                    </div>

                    {/* Shared Users */}
                    {Object.entries(context.acl || {}).map(([userEmail, permission]) => (
                      <div key={userEmail} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-secondary/10 flex items-center justify-center">
                            <span className="text-xs font-medium">
                              {userEmail.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-medium">{userEmail}</div>
                            <div className="text-xs text-muted-foreground">
                              {permission === 'documentRead' && 'Read Only'}
                              {permission === 'documentWrite' && 'Read + Append'}
                              {permission === 'documentReadWrite' && 'Full Access'}
                            </div>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleRevokeAccess(userEmail)}
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}

                    {(!context.acl || Object.keys(context.acl).length === 0) && (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        No users have been granted access to this context.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Toolbox Content */}
            {isToolboxOpen && (
              <div className="space-y-4">
                {/* Filter Toggles */}
                <div>
                  <h4 className="font-medium mb-3">Data Type Filters</h4>
                  <div className="space-y-2">
                    <Button
                      onClick={() => handleFilterToggle('tabs')}
                      variant={activeFilters.tabs ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start"
                    >
                      Tabs (data/abstraction/tab)
                    </Button>
                    <Button
                      onClick={() => handleFilterToggle('notes')}
                      variant={activeFilters.notes ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start"
                    >
                      Notes (data/abstraction/note)
                    </Button>
                    <Button
                      onClick={() => handleFilterToggle('todo')}
                      variant={activeFilters.todo ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start"
                    >
                      Todo (data/abstraction/todo)
                    </Button>
                  </div>
                </div>

                {/* Custom Bitmap Filters */}
                <div>
                  <h4 className="font-medium mb-3">Custom Bitmap Filters</h4>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={newBitmapInput}
                        onChange={(e) => setNewBitmapInput(e.target.value)}
                        placeholder="Enter bitmap name"
                        className="flex-1"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddCustomBitmap()}
                      />
                      <Button
                        onClick={handleAddCustomBitmap}
                        disabled={!newBitmapInput.trim()}
                        size="sm"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {customBitmaps.map((bitmap) => (
                      <div key={bitmap} className="flex items-center justify-between p-2 border rounded">
                        <span className="text-sm font-mono">{bitmap}</span>
                        <Button
                          onClick={() => handleRemoveCustomBitmap(bitmap)}
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    {customBitmaps.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        No custom bitmap filters added.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Detail Modal */}
      <DocumentDetailModal
        document={selectedDocument}
        isOpen={isDocumentModalOpen}
        onClose={() => {
          setIsDocumentModalOpen(false);
          setSelectedDocument(null);
        }}
      />
    </div>
  );
}

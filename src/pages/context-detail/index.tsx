import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-container';
import { Save, Share, X, Plus } from 'lucide-react';
import { getContext, updateContextUrl, getContextDocuments, grantContextAccess, revokeContextAccess } from '@/services/context';
import socketService from '@/lib/socket';
import { getCurrentUserFromToken } from '@/services/auth';

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
  description?: string | null; // Was in original type, keep if form might use it
}

// WebSocket event types matching server implementation
const WS_EVENTS = {
  CONTEXT_CREATED: 'context:created',
  CONTEXT_UPDATED: 'context:updated', // Expects { context: ContextData } or { context: Partial<ContextData> }
  CONTEXT_DELETED: 'context:deleted', // Expects { id: string } or { contextId: string }
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
  const [documents, setDocuments] = useState<any[]>([]); // Type for documents can be refined if its structure is known
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const { showToast } = useToast();

  // Sharing state
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState<string>('documentRead');
  const [isSharing, setIsSharing] = useState(false);
  const [showShareForm, setShowShareForm] = useState(false);

  // Get current user to check if they're the owner
  const currentUser = getCurrentUserFromToken();
  const isOwner = currentUser && context && currentUser.id === context.userId;

  // Ensure socket is connected
  useEffect(() => {
    if (!socketService.isConnected()) {
      console.log('Socket not connected, attempting to connect...');
      socketService.reconnect();
    }
  }, []);

  const fetchContextDetails = useCallback(async () => {
    if (!contextId) return;
    setIsLoading(true);
    try {
      // getContext service directly returns the Context object (previously ContextData)
      // The service handles unwrapping from response.payload.context
      const fetchedContext = await getContext(contextId) as unknown as ContextData;
      console.log('[ContextDetailPage] Fetched context from getContext service:', fetchedContext);

      if (!fetchedContext) {
        throw new Error('No context data received from getContext service.');
      }

      // Optional: Basic validation of the fetched context data
      if (typeof fetchedContext.id !== 'string' || typeof fetchedContext.url !== 'string') {
        console.error('[ContextDetailPage] Fetched context data is invalid or incomplete:', fetchedContext);
        throw new Error('Fetched context data is invalid, incomplete, or not of the expected type.');
      }

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

  const fetchDocuments = useCallback(async () => {
    if (!contextId) return;
    setIsLoadingDocuments(true);
    try {
      // getContextDocuments returns array directly or { payload: Document[] }
      // Based on its usage, assuming it might return array directly or needs .payload
      const docsResponse = await getContextDocuments(contextId);
      let docsData = [];
      if (Array.isArray(docsResponse)) {
        docsData = docsResponse;
      } else if ((docsResponse as any).payload && Array.isArray((docsResponse as any).payload)) {
        docsData = (docsResponse as any).payload;
      } // Add more checks if service response varies
      setDocuments(docsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      setDocuments([]);
    }
    setIsLoadingDocuments(false);
  }, [contextId]);

  useEffect(() => {
    fetchContextDetails();
  }, [fetchContextDetails]);

  useEffect(() => {
    if (!contextId) return;

    // Ensure socket is connected before subscribing
    if (!socketService.isConnected()) {
      console.log('Socket not connected, attempting to connect...');
      socketService.reconnect();
      return;
    }

    console.log(`Subscribing to context events for context ${contextId}`);
    socketService.emit('subscribe', { topic: 'context', id: contextId });

    const handleContextUpdateReceived = (data: { context: Partial<ContextData> }) => {
      console.log('Received context update (raw socket data):', data);
      if (data.context && data.context.id === contextId) {
        console.log('Applying context update:', data.context);
        setContext(prev => prev ? { ...prev, ...data.context } as ContextData : null);
        if (data.context.url) {
          setEditableUrl(data.context.url);
          fetchDocuments();
        }
      }
    };

    const handleContextUrlChanged = (data: { id: string; url: string; /* other fields if sent */ }) => {
      console.log('Received context URL change (raw socket data):', data);
      if (data.id === contextId) {
        console.log('Applying context URL change:', data.url);
        setContext(prev => prev ? { ...prev, url: data.url } : null);
        setEditableUrl(data.url);
        fetchDocuments();
      }
    };

    const handleContextLockStatusChanged = (data: { id: string; locked: boolean; /* other fields? */ }) => {
      console.log('Received context lock status change (raw socket data):', data);
      if (data.id === contextId) {
        console.log('Applying context lock status:', data.locked);
        setContext(prev => prev ? { ...prev, locked: data.locked } : null);
      }
    };

    const handleContextDeleted = (data: { id: string; /* or contextId: string */ }) => {
      console.log('Received context deletion (raw socket data):', data);
      // Server sends { contextId: string } for delete confirmation usually
      // but handleContextDeleted in contexts/index.tsx listens for { contextId: string }
      // Check if data.id or data.contextId is present
      const deletedId = data.id || (data as any).contextId;
      if (deletedId === contextId) {
        console.log('Context marked as deleted.');
        setContext(null);
        setError('Context has been deleted. You will be redirected or this page will be disabled.');
        showToast({
          title: 'Context Deleted',
          description: 'This context has been deleted.',
          variant: 'destructive'
        });
        // Consider redirecting: navigate('/contexts');
      }
    };

    const handleContextAclUpdated = (data: { id: string; acl: Record<string, any>; sharedWithUserId?: string; accessLevel?: string; }) => {
      console.log('Received context ACL update (raw socket data):', data);
      if (data.id === contextId) {
        console.log('Applying context ACL update:', data.acl);
        setContext(prev => prev ? { ...prev, acl: data.acl } : null);
        if (data.sharedWithUserId && data.accessLevel) {
          showToast({
            title: 'Access Granted',
            description: `${data.sharedWithUserId} was granted ${data.accessLevel} access to this context.`
          });
        }
      }
    };

    const handleContextAclRevoked = (data: { id: string; acl: Record<string, any>; revokedFromUserId?: string; }) => {
      console.log('Received context ACL revocation (raw socket data):', data);
      if (data.id === contextId) {
        console.log('Applying context ACL revocation:', data.acl);
        setContext(prev => prev ? { ...prev, acl: data.acl } : null);
        if (data.revokedFromUserId) {
          showToast({
            title: 'Access Revoked',
            description: `Access was revoked from ${data.revokedFromUserId} for this context.`
          });
        }
      }
    };

    // Listen for all context-related events
    socketService.on(WS_EVENTS.CONTEXT_UPDATED, handleContextUpdateReceived);
    socketService.on(WS_EVENTS.CONTEXT_URL_CHANGED, handleContextUrlChanged);
    socketService.on(WS_EVENTS.CONTEXT_LOCKED, handleContextLockStatusChanged);
    socketService.on(WS_EVENTS.CONTEXT_UNLOCKED, handleContextLockStatusChanged);
    socketService.on(WS_EVENTS.CONTEXT_DELETED, handleContextDeleted);
    socketService.on(WS_EVENTS.CONTEXT_ACL_UPDATED, handleContextAclUpdated);
    socketService.on(WS_EVENTS.CONTEXT_ACL_REVOKED, handleContextAclRevoked);

    return () => {
      console.log(`Unsubscribing from context events for context ${contextId}`);
      socketService.emit('unsubscribe', { topic: 'context', id: contextId });
      socketService.off(WS_EVENTS.CONTEXT_UPDATED, handleContextUpdateReceived);
      socketService.off(WS_EVENTS.CONTEXT_URL_CHANGED, handleContextUrlChanged);
      socketService.off(WS_EVENTS.CONTEXT_LOCKED, handleContextLockStatusChanged);
      socketService.off(WS_EVENTS.CONTEXT_UNLOCKED, handleContextLockStatusChanged);
      socketService.off(WS_EVENTS.CONTEXT_DELETED, handleContextDeleted);
      socketService.off(WS_EVENTS.CONTEXT_ACL_UPDATED, handleContextAclUpdated);
      socketService.off(WS_EVENTS.CONTEXT_ACL_REVOKED, handleContextAclRevoked);
    };
  }, [contextId, fetchDocuments]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditableUrl(e.target.value);
  };

  const handleSetContextUrl = async () => {
    if (!context || editableUrl === context.url) return;
    setIsSaving(true);
    try {
      // updateContextUrl likely returns the updated context or its relevant part.
      // API response for POST /:id/url shows { url: context.url }
      // The service might adapt this or return the full context.
      const response = await updateContextUrl(context.id, editableUrl);
      let updatedContextData: ContextData | null = null;

      // Scenario 1: Service returns full context in response.payload.context
      if ((response as any)?.payload?.context?.id && typeof (response as any)?.payload?.context?.url === 'string') {
        updatedContextData = (response as any).payload.context as ContextData;
      }
      // Scenario 2: Service returns full context in response.payload
      else if ((response as any)?.payload?.id && typeof (response as any)?.payload?.url === 'string') {
        updatedContextData = (response as any).payload as ContextData;
      }
      // Scenario 3: Service returns full context directly
      else if ((response as any)?.id && typeof (response as any)?.url === 'string') {
        updatedContextData = response as unknown as ContextData;
      }
      // Scenario 4: Service returns a partial update like { url: string }
      // This is based on the comment: "// API response for POST /:id/url shows { url: context.url }"
      else if (response && typeof (response as any).url === 'string') {
        // If only URL is returned, merge with existing context and update 'updatedAt'
        // Ensured by the function's initial guard that 'context' is not null here.
        const newUpdatedAt = new Date().toISOString();
        // Force cast through unknown if TypeScript struggles with the direct spread.
        // This assumes 'context' is indeed a valid 'ContextData' at this point.
        updatedContextData = {
          ...(context as unknown as ContextData),
          url: (response as any).url,
          updatedAt: newUpdatedAt
        } as ContextData;
      } else {
        console.error("Unexpected response from updateContextUrl:", response);
        throw new Error('Unexpected response format from server when updating URL.');
      }

      if (updatedContextData) {
        setContext(updatedContextData);
        setEditableUrl(updatedContextData.url); // Ensure editableUrl is also updated from the final source
        await fetchDocuments();
        showToast({
          title: 'Success',
          description: 'Context URL set successfully.'
        });
      } else {
        // This case implies an issue with processing logic or an unexpected empty response.
        // The error thrown in the 'else' block above should ideally cover unexpected formats.
        // If updatedContextData is null here, it means no valid scenario was matched.
        console.error("Failed to derive updated context data from response:", response);
        throw new Error('Failed to process update response or response was empty.');
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set context URL';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
      // Revert editableUrl only if context still exists from before the attempt
      if (context) {
        setEditableUrl(context.url);
      }
    }
    setIsSaving(false);
  };

  // Sharing functions
  const handleGrantAccess = async () => {
    if (!context || !shareEmail.trim()) return;

    setIsSharing(true);
    try {
      await grantContextAccess(context.userId, context.id, shareEmail.trim(), sharePermission);

      // Update context ACL locally for immediate UI feedback
      setContext(prev => prev ? {
        ...prev,
        acl: {
          ...prev.acl,
          [shareEmail.trim()]: sharePermission
        }
      } : null);

      setShareEmail('');
      setShowShareForm(false);

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

  const handleRevokeAccess = async (userEmail: string) => {
    if (!context) return;

    try {
      await revokeContextAccess(context.userId, context.id, userEmail);

      // Update context ACL locally for immediate UI feedback
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

  if (isLoading) {
    return <div className="text-center">Loading context details...</div>;
  }

  if (error && !context) {
    return <div className="text-center text-destructive">Error: {error}</div>;
  }

  if (!context) {
    return <div className="text-center">Context not found or has been deleted.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 p-2 border rounded-md shadow-sm bg-background">
        <Input
          id="contextUrlInput"
          type="text"
          value={editableUrl}
          onChange={handleUrlChange}
          className="font-mono h-10 flex-grow border-0 focus-visible:ring-0 focus-visible:ring-offset-0 !shadow-none"
          placeholder="contextID@workspaceID://context-url"
          disabled={isSaving || context.locked}
        />
        <Button
          onClick={handleSetContextUrl}
          disabled={isSaving || !context || editableUrl === context.url || context.locked}
          size="sm"
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Setting...' : 'Set Context'}
        </Button>
      </div>

      {/* Page Header */}
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Context: {context.id}</h1>
        <p className="text-muted-foreground mt-2">{context.description || 'No description available'}</p>
      </div>

      {/* Context Details */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Basic Information</h2>
          <div className="space-y-3">
            <div>
              <span className="font-medium">ID:</span>
              <span className="ml-2 font-mono text-sm">{context.id}</span>
            </div>
            <div>
              <span className="font-medium">User ID:</span>
              <span className="ml-2 font-mono text-sm">{context.userId}</span>
            </div>
            <div>
              <span className="font-medium">Workspace ID:</span>
              <span className="ml-2 font-mono text-sm">{context.workspaceId}</span>
            </div>
            <div>
              <span className="font-medium">Current URL:</span>
              <span className="ml-2 font-mono text-sm break-all">{context.url}</span>
            </div>
            <div>
              <span className="font-medium">Base URL:</span>
              <span className="ml-2 font-mono text-sm">{context.baseUrl || 'N/A'}</span>
            </div>
            <div>
              <span className="font-medium">Path:</span>
              <span className="ml-2 font-mono text-sm">{context.path || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Status & Metadata</h2>
          <div className="space-y-3">
            <div>
              <span className="font-medium">Locked:</span>
              <span className="ml-2">{context.locked ? 'Yes' : 'No'}</span>
            </div>
            <div>
              <span className="font-medium">Pending URL:</span>
              <span className="ml-2 font-mono text-sm">{context.pendingUrl || 'N/A'}</span>
            </div>
            <div>
              <span className="font-medium">Path Array:</span>
              <span className="ml-2 font-mono text-sm">{context.pathArray.join(', ') || 'N/A'}</span>
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

      {/* Access Control */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Sharing & Access Control</h2>
          {isOwner && (
            <Button
              onClick={() => setShowShareForm(!showShareForm)}
              size="sm"
              variant="outline"
            >
              <Share className="mr-2 h-4 w-4" />
              Share Context
            </Button>
          )}
        </div>

        {/* Share Form - Only for owners */}
        {isOwner && showShareForm && (
          <div className="border rounded-lg p-4 bg-muted/20">
            <h3 className="font-medium mb-3">Share with a user</h3>
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
                  <option value="documentRead">Read Only (documentRead)</option>
                  <option value="documentWrite">Read + Append (documentWrite)</option>
                  <option value="documentReadWrite">Full Access (documentReadWrite)</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleGrantAccess}
                  disabled={!shareEmail.trim() || isSharing}
                  size="sm"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isSharing ? 'Granting...' : 'Grant Access'}
                </Button>
                <Button
                  onClick={() => {
                    setShowShareForm(false);
                    setShareEmail('');
                  }}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Current Shares */}
        <div className="space-y-3">
          <h3 className="font-medium">Current Access</h3>
          <div className="space-y-2">
            {/* Owner (always has full access) */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">O</span>
                </div>
                <div>
                  <div className="font-medium text-sm">{context.userId}</div>
                  <div className="text-xs text-muted-foreground">Owner</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">Full Access</div>
            </div>

            {/* Shared Users */}
            {Object.entries(context.acl || {}).map(([userEmail, permission]) => (
              <div key={userEmail} className="flex items-center justify-between p-3 border rounded-lg bg-background">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-secondary-foreground">
                      {userEmail.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-sm">{userEmail}</div>
                    <div className="text-xs text-muted-foreground">
                      {permission === 'documentRead' && 'Read Only'}
                      {permission === 'documentWrite' && 'Read + Append'}
                      {permission === 'documentReadWrite' && 'Full Access'}
                    </div>
                  </div>
                </div>
                {isOwner && (
                  <Button
                    onClick={() => handleRevokeAccess(userEmail)}
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}

            {(!context.acl || Object.keys(context.acl).length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <Share className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>No users have been granted access to this context.</p>
                <p className="text-sm">Click "Share Context" to invite collaborators.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Documents Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Context Documents</h2>
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
                  <div>
                    <h3 className="font-semibold">{doc.data.title || 'Untitled Document'}</h3>
                    <p className="text-sm text-muted-foreground">{doc.schema}</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleString()}
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
                {doc.data.favicon && (
                  <img
                    src={doc.data.favicon}
                    alt="Favicon"
                    className="w-4 h-4 inline-block ml-2"
                  />
                )}
                <div className="mt-2 text-xs text-muted-foreground">
                  <span>Version {doc.versionNumber}</span>
                  {doc.checksumArray && doc.checksumArray.length > 0 && (
                    <span className="ml-2">
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
  );
}

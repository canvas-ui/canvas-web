import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-container';
import { Save } from 'lucide-react';
import { getContext, updateContextUrl, getContextDocuments } from '@/services/context';
import socketService from '@/lib/socket';

// WebSocket event types matching server implementation
const WS_EVENTS = {
  CONTEXT_CREATED: 'context:created',
  CONTEXT_UPDATED: 'context:updated',
  CONTEXT_DELETED: 'context:deleted',
  CONTEXT_URL_CHANGED: 'context:url:changed',
  CONTEXT_LOCKED: 'context:locked',
  CONTEXT_UNLOCKED: 'context:unlocked'
};

export default function ContextDetailPage() {
  const { contextId } = useParams<{ contextId: string }>();
  const [context, setContext] = useState<Context | null>(null);
  const [editableUrl, setEditableUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const { showToast } = useToast();

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
      const fetchedContext = await getContext(contextId);
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
  }, [contextId, showToast]);

  const fetchDocuments = useCallback(async () => {
    if (!contextId) return;
    setIsLoadingDocuments(true);
    try {
      const docs = await getContextDocuments(contextId);
      setDocuments(docs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch documents';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
    setIsLoadingDocuments(false);
  }, [contextId, showToast]);

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

    const handleContextUpdateReceived = (data: { context: Context }) => {
      console.log('Received context update:', data);
      if (data.context && data.context.id === contextId) {
        setContext(data.context);
        setEditableUrl(data.context.url);
        // Fetch documents when URL changes
        fetchDocuments();
      }
    };

    const handleContextUrlChanged = (data: { id: string; url: string }) => {
      console.log('Received context URL change:', data);
      if (data.id === contextId) {
        setContext(prev => prev ? { ...prev, url: data.url } : null);
        setEditableUrl(data.url);
        // Fetch documents when URL changes
        fetchDocuments();
      }
    };

    const handleContextLocked = (data: { id: string; locked: boolean }) => {
      console.log('Received context lock status change:', data);
      if (data.id === contextId) {
        setContext(prev => prev ? { ...prev, locked: data.locked } : null);
      }
    };

    const handleContextDeleted = (data: { id: string }) => {
      console.log('Received context deletion:', data);
      if (data.id === contextId) {
        setContext(null);
        setError('Context has been deleted');
        showToast({
          title: 'Context Deleted',
          description: 'This context has been deleted.',
          variant: 'destructive'
        });
      }
    };

    // Listen for all context-related events
    socketService.on(WS_EVENTS.CONTEXT_UPDATED, handleContextUpdateReceived);
    socketService.on(WS_EVENTS.CONTEXT_URL_CHANGED, handleContextUrlChanged);
    socketService.on(WS_EVENTS.CONTEXT_LOCKED, handleContextLocked);
    socketService.on(WS_EVENTS.CONTEXT_UNLOCKED, handleContextLocked);
    socketService.on(WS_EVENTS.CONTEXT_DELETED, handleContextDeleted);

    return () => {
      console.log(`Unsubscribing from context events for context ${contextId}`);
      socketService.emit('unsubscribe', { topic: 'context', id: contextId });
      socketService.off(WS_EVENTS.CONTEXT_UPDATED, handleContextUpdateReceived);
      socketService.off(WS_EVENTS.CONTEXT_URL_CHANGED, handleContextUrlChanged);
      socketService.off(WS_EVENTS.CONTEXT_LOCKED, handleContextLocked);
      socketService.off(WS_EVENTS.CONTEXT_UNLOCKED, handleContextLocked);
      socketService.off(WS_EVENTS.CONTEXT_DELETED, handleContextDeleted);
    };
  }, [contextId, showToast, fetchDocuments]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditableUrl(e.target.value);
  };

  const handleSetContextUrl = async () => {
    if (!context || editableUrl === context.url) return;
    setIsSaving(true);
    try {
      const updatedContext = await updateContextUrl(context.id, editableUrl);
      setContext(updatedContext);
      setEditableUrl(updatedContext.url);
      // Fetch documents after URL update
      await fetchDocuments();
      showToast({
        title: 'Success',
        description: 'Context URL set successfully.'
      });
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

  if (isLoading) {
    return <div className="container mx-auto p-4 text-center">Loading context details...</div>;
  }

  if (error && !context) {
    return <div className="container mx-auto p-4 text-center text-destructive">Error: {error}</div>;
  }

  if (!context) {
    return <div className="container mx-auto p-4 text-center">Context not found.</div>;
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center gap-2 p-2 border rounded-md shadow-sm bg-background">
        <Input
          id="contextUrl"
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

      <div className="p-4 border rounded-md bg-card text-card-foreground mt-4 space-y-2 shadow-sm">
        <h2 className="text-xl font-semibold mb-3">Context Information</h2>
        <p><strong>ID:</strong> {context.id}</p>
        <p><strong>Current URL:</strong> {context.url}</p>
        <p><strong>Workspace ID:</strong> {context.workspace}</p>
        <p><strong>User ID:</strong> {context.userId}</p>
        <p><strong>Base URL:</strong> {context.baseUrl || 'N/A'}</p>
        <p><strong>Path:</strong> {context.path || 'N/A'}</p>
        <p><strong>Locked:</strong> {context.locked ? 'Yes' : 'No'}</p>
        <p><strong>Created At:</strong> {new Date(context.createdAt).toLocaleString()}</p>
        <p><strong>Updated At:</strong> {new Date(context.updatedAt).toLocaleString()}</p>
        {context.description && <p><strong>Description:</strong> {context.description}</p>}
      </div>

      <div className="mt-6 p-4 border rounded-md min-h-[300px] bg-muted/40">
        <h2 className="text-xl font-semibold mb-4">Context Documents</h2>
        {isLoadingDocuments ? (
          <div className="text-center text-muted-foreground">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="text-center text-muted-foreground">
            <p>No documents found</p>
            <p className="text-sm">Documents will appear here when available.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {documents.map((doc, index) => (
              <div key={index} className="p-4 border rounded-md bg-background">
                <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                  {JSON.stringify(doc, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

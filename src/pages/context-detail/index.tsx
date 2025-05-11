import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-container';
import { Save } from 'lucide-react';
import { getContext, updateContextUrl } from '@/services/context';
import socketService from '@/lib/socket';

export default function ContextDetailPage() {
  const { contextId } = useParams<{ contextId: string }>();
  const [context, setContext] = useState<Context | null>(null);
  const [editableUrl, setEditableUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

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

  useEffect(() => {
    fetchContextDetails();
  }, [fetchContextDetails]);

  useEffect(() => {
    if (!contextId || !socketService.isConnected()) return;

    socketService.emit('subscribe', { topic: 'context' });

    const handleContextUpdateReceived = (data: { context: Context }) => {
      if (data.context && data.context.id === contextId) {
        setContext(data.context);
        setEditableUrl(data.context.url);
      }
    };

    socketService.on('context:updated', handleContextUpdateReceived);
    socketService.on('context:url:changed', handleContextUpdateReceived);

    return () => {
      socketService.emit('unsubscribe', { topic: 'context' });
      socketService.off('context:updated', handleContextUpdateReceived);
      socketService.off('context:url:changed', handleContextUpdateReceived);
    };
  }, [contextId, showToast]);

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
          disabled={isSaving}
        />
        <Button onClick={handleSetContextUrl} disabled={isSaving || !context || editableUrl === context.url} size="sm">
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

      <div className="mt-6 p-4 border rounded-md min-h-[300px] bg-muted/40 text-center text-muted-foreground">
        <p>Context Content Area (Placeholder)</p>
        <p className="text-sm">This is where the visual representation of the context would be displayed.</p>
      </div>
    </div>
  );
}

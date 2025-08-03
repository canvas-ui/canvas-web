import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast-container"
import { Plus, Trash, DoorOpen, Edit } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import socketService from "@/lib/socket"
import { listContexts, createContext, deleteContext } from "@/services/context"
import { listWorkspaces } from "@/services/workspace"
import { getCurrentUserFromToken } from "@/services/auth"
import { logAndExtractError } from "@/lib/error-utils"

// Using global Workspace type from types/api.d.ts

// Updated ContextEntry based on API payload
interface ContextEntry {
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
  description?: string | null; // Kept as optional if used by create form/logic
}

export default function ContextsPage() {
  const navigate = useNavigate()
  const [contexts, setContexts] = useState<ContextEntry[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newContextId, setNewContextId] = useState("")
  const [newContextUrl, setNewContextUrl] = useState("")
  const [newContextDescription, setNewContextDescription] = useState("")
  const [newContextBaseUrl, setNewContextBaseUrl] = useState("")
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("")
  const [isCreating, setIsCreating] = useState(false)
  const [editingContext, setEditingContext] = useState<ContextEntry | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    if (!socketService.isConnected()) {
      console.log('Socket not connected, attempting to connect...');
      socketService.reconnect();
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      // Fetch both contexts and workspaces
      const [fetchedContexts, workspacesApiResponse] = await Promise.all([
        listContexts(),
        listWorkspaces()
      ]);

      // Filter out any null/undefined contexts and validate structure
      const validContexts = (fetchedContexts as unknown as ContextEntry[])?.filter(ctx =>
        ctx && typeof ctx === 'object' && ctx.id && ctx.userId
      ) || [];

      setContexts(validContexts);

      // The listWorkspaces service returns the global Workspace[] type
      const workspacesData = (workspacesApiResponse as unknown as Workspace[]) || [];
      setWorkspaces(workspacesData);

      if (workspacesData.length > 0) {
        const currentSelectionIsValid = workspacesData.some(ws => ws.id === selectedWorkspaceId);
        if (!selectedWorkspaceId || !currentSelectionIsValid) {
            setSelectedWorkspaceId(workspacesData[0].id);
        }
      } else {
        setSelectedWorkspaceId("");
      }
      setError(null);
    } catch (err) {
      console.error('Data fetch error:', err);

      // Set empty arrays to prevent "A.map is not a function" errors
      setContexts([]);
      setWorkspaces([]);

      // Extract the most detailed error message available
      let errorMessage = 'Failed to fetch data';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const errorObj = err as any;
        // Try to extract from various possible error structures
        errorMessage = errorObj.message ||
                     errorObj.error ||
                     errorObj.payload?.message ||
                     errorObj.payload?.error ||
                     errorObj.statusText ||
                     'Failed to fetch data';
      }

      setError(errorMessage);
      showToast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-populate the Context URL field when the workspace selection changes, but only if the user hasn't typed anything yet
  useEffect(() => {
    if (!selectedWorkspaceId) return;
    const ws = workspaces.find(w => w.id === selectedWorkspaceId);
    if (!ws) return;

    // Only set a default if the field is empty or still has the initial placeholder value
    if (!newContextUrl.trim() || newContextUrl.trim() === 'universe://') {
      const defaultUrl = `workspace://${ws.name || ws.id}`;
      setNewContextUrl(defaultUrl);
    }
  }, [selectedWorkspaceId, workspaces, newContextUrl]);

  useEffect(() => {
    if (!socketService.isConnected()) {
      console.log('Socket not connected, attempting to connect...');
      socketService.reconnect();
      return;
    }
    console.log('Subscribing to context events');
    socketService.emit('subscribe', { topic: 'context' })

    const handleContextCreated = (data: ContextEntry) => {
      console.log('Received context created:', data);
      // The backend sends the context data directly, not nested under 'context' property
      // Validate the context data before adding
      if (!data || !data.id || !data.userId) {
        console.error('Invalid context data received in context:created event:', data);
        return;
      }

      // Only add if not already in the list (prevent duplicates from API call)
      setContexts(prev => {
        const exists = prev.some(ctx => ctx && ctx.id === data.id && ctx.userId === data.userId);
        if (exists) {
          console.log(`Context ${data.id} already exists, skipping duplicate add`);
          return prev;
        }
        return [...prev, data];
      });
    }
    const handleContextUpdated = (data: ContextEntry) => {
      console.log('Received context update:', data);
      // Validate the context data before updating
      if (!data || !data.id || !data.userId) {
        console.error('Invalid context data received in context:updated event:', data);
        return;
      }

      // The backend sends the context data directly
      setContexts(prev => prev.map(ctx =>
        (ctx && ctx.id === data.id && ctx.userId === data.userId) ? { ...ctx, ...data } : ctx
      ))
    }
    const handleContextDeleted = (data: { contextId: string }) => {
      console.log('Received context deletion:', data);
      if (!data || !data.contextId) {
        console.error('Invalid context deletion data received:', data);
        return;
      }
      setContexts(prev => prev.filter(ctx => ctx && ctx.id !== data.contextId))
    }
    const handleContextUrlChanged = (data: ContextEntry) => {
      console.log('Received context URL change:', data);
      // Validate the context data before updating
      if (!data || !data.id || !data.userId) {
        console.error('Invalid context data received in context:url:changed event:', data);
        return;
      }

      // The backend sends the context data directly
      setContexts(prev => prev.map(ctx =>
        (ctx && ctx.id === data.id && ctx.userId === data.userId) ? { ...ctx, ...data } : ctx
      ))
    }

    socketService.on('context:created', handleContextCreated)
    socketService.on('context:updated', handleContextUpdated)
    socketService.on('context:deleted', handleContextDeleted)
    socketService.on('context:url:changed', handleContextUrlChanged)

    return () => {
      console.log('Unsubscribing from context events');
      socketService.emit('unsubscribe', { topic: 'context' })
      socketService.off('context:created', handleContextCreated)
      socketService.off('context:updated', handleContextUpdated)
      socketService.off('context:deleted', handleContextDeleted)
      socketService.off('context:url:changed', handleContextUrlChanged)
    }
  }, [])

  const handleCreateContext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContextUrl.trim() || !selectedWorkspaceId || !newContextId.trim()) {
      showToast({
        title: 'Missing Fields',
        description: 'Context ID, Context URL and Workspace are required.',
        variant: 'destructive'
      });
      return;
    }
    setIsCreating(true);
    try {
      const newContextPayload = {
        id: newContextId,
        url: newContextUrl,
        description: newContextDescription || undefined,
        workspaceId: selectedWorkspaceId,
        baseUrl: newContextBaseUrl || undefined
      };
      // Create the context - the socket event will add it to the state
      const newContext = await createContext(newContextPayload);
      setNewContextId("");
      setNewContextUrl("");
      setNewContextDescription("");
      setNewContextBaseUrl("");
      showToast({
        title: 'Success',
        description: 'Context created successfully'
      });
      // Navigate to the newly created context
      navigate(`/contexts/${newContext.id}`);
        } catch (err) {
      const errorMessage = logAndExtractError(err, 'Context creation error:', 'Failed to create context');

      showToast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteContext = async (contextId: string) => {
    if (!confirm('Are you sure you want to delete this context? This action cannot be undone.')) {
      return
    }
    try {
      await deleteContext(contextId)
      setContexts(prev => prev.filter(ctx => ctx.id !== contextId))
      showToast({
        title: 'Success',
        description: 'Context deleted successfully'
      })
    } catch (err) {
      console.error('Context deletion error:', err);

      // Extract the most detailed error message available
      let errorMessage = 'Failed to delete context';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const errorObj = err as any;
        // Try to extract from various possible error structures
        errorMessage = errorObj.message ||
                     errorObj.error ||
                     errorObj.payload?.message ||
                     errorObj.payload?.error ||
                     errorObj.statusText ||
                     'Failed to delete context';
      }

      showToast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    }
  }

  const handleOpenContext = (context: ContextEntry) => {
    const currentUser = getCurrentUserFromToken()
    const isSharedContext = currentUser && context.userId !== currentUser.id

    if (isSharedContext) {
      navigate(`/users/${context.userId}/contexts/${context.id}`)
    } else {
      navigate(`/contexts/${context.id}`)
    }
  }

  const handleEditContext = (context: ContextEntry) => {
    setEditingContext(context)
  }

  const handleSaveContextEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingContext) return

    try {
      // TODO: Implement context update API call
      // For now, just update local state
      setContexts(prev => prev.map(ctx => 
        ctx.id === editingContext.id && ctx.userId === editingContext.userId 
          ? editingContext 
          : ctx
      ))
      
      showToast({
        title: 'Success',
        description: 'Context updated successfully (mock update)'
      })
      setEditingContext(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update context'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Contexts</h1>
        <p className="text-muted-foreground mt-2">Create and manage contexts in your workspaces</p>
      </div>

      {/* Create New Context Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Create New Context</h2>
        <form onSubmit={handleCreateContext} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="workspace" className="block text-sm font-medium mb-1">
                Workspace
              </label>
              <select
                id="workspace"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                disabled={isCreating || workspaces.length === 0}
              >
                {workspaces.length === 0 && (
                  <option value="">No workspaces available. Create one first.</option>
                )}
                {workspaces.map((ws) => (
                  <option key={`${ws.owner}-${ws.id}`} value={ws.id}>
                    {ws.label || ws.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="newContextId" className="block text-sm font-medium mb-1">
                Context ID
              </label>
              <Input
                id="newContextId"
                value={newContextId}
                onChange={(e) => setNewContextId(e.target.value)}
                placeholder="e.g., my-new-context"
                disabled={isCreating}
              />
            </div>
          </div>
          <div>
            <label htmlFor="url" className="block text-sm font-medium mb-1">
              Context URL
            </label>
            <Input
              id="url"
              value={newContextUrl}
              onChange={(e) => setNewContextUrl(e.target.value)}
              placeholder="e.g., user@host://project/path/resource"
              disabled={isCreating}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="baseUrl" className="block text-sm font-medium mb-1">
                Base URL (Optional)
              </label>
              <Input
                id="baseUrl"
                value={newContextBaseUrl}
                onChange={(e) => setNewContextBaseUrl(e.target.value)}
                placeholder="e.g., /project/path"
                disabled={isCreating}
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-1">
                Description (Optional)
              </label>
              <Input
                id="description"
                value={newContextDescription}
                onChange={(e) => setNewContextDescription(e.target.value)}
                placeholder="Description"
                disabled={isCreating}
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={isCreating || !newContextUrl.trim() || !selectedWorkspaceId || !newContextId.trim()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Context
          </Button>
        </form>
      </div>

      {/* Your Contexts Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Contexts</h2>

        {isLoading && <p className="text-center text-muted-foreground">Loading contexts...</p>}

        {error && (
          <div className="text-center text-destructive">
            <p>{error}</p>
          </div>
        )}

        {!isLoading && !error && contexts.length === 0 && (
          <p className="text-center text-muted-foreground">No contexts found. Create one above.</p>
        )}

        {contexts.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Context URL</TableHead>
                  <TableHead>Workspace ID</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Locked</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contexts.filter(context => context != null).map((context) => {
                  // Safety checks to prevent errors with undefined properties
                  if (!context) {
                    console.warn('Found null/undefined context in contexts array, skipping');
                    return null;
                  }

                  const createdAtDisplay = context.createdAt ? new Date(context.createdAt).toLocaleDateString() : '-';
                  const updatedAtDisplay = context.updatedAt ? new Date(context.updatedAt).toLocaleDateString() : '-';
                  return (
                    <TableRow key={`${context.userId}-${context.id}`}>
                      <TableCell className="font-mono text-sm">{context.id || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{context.userId || '-'}</TableCell>
                      <TableCell className="font-mono text-sm max-w-xs truncate" title={context.url || '-'}>
                        {context.url || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{context.workspaceId || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{context.baseUrl || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{context.path || '-'}</TableCell>
                      <TableCell>{context.locked ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{createdAtDisplay}</TableCell>
                      <TableCell>{updatedAtDisplay}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditContext(context)}
                            title="Edit Context"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenContext(context)}
                            title="Open Context Details"
                          >
                            <DoorOpen className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteContext(context.id)}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Delete Context"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Context Section */}
      {editingContext && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Edit Context</h2>
          <form onSubmit={handleSaveContextEdit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="edit-context-id" className="block text-sm font-medium mb-1">
                  Context ID (read-only)
                </label>
                <Input
                  id="edit-context-id"
                  value={editingContext.id}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div>
                <label htmlFor="edit-context-url" className="block text-sm font-medium mb-1">
                  Context URL
                </label>
                <Input
                  id="edit-context-url"
                  value={editingContext.url}
                  onChange={(e) => setEditingContext(prev => prev ? {...prev, url: e.target.value} : null)}
                  placeholder="https://example.com/path"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="edit-base-url" className="block text-sm font-medium mb-1">
                  Base URL (optional)
                </label>
                <Input
                  id="edit-base-url"
                  value={editingContext.baseUrl || ''}
                  onChange={(e) => setEditingContext(prev => prev ? {...prev, baseUrl: e.target.value || null} : null)}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label htmlFor="edit-path" className="block text-sm font-medium mb-1">
                  Path (optional)
                </label>
                <Input
                  id="edit-path"
                  value={editingContext.path || ''}
                  onChange={(e) => setEditingContext(prev => prev ? {...prev, path: e.target.value || null} : null)}
                  placeholder="/path"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">
                Save Changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingContext(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast-container"
import { Plus, Trash, DoorOpen } from "lucide-react"
import socketService from "@/lib/socket"
import { listContexts, createContext, deleteContext } from "@/services/context"
import { listWorkspaces } from "@/services/workspace"
import { getCurrentUserFromToken } from "@/services/auth"

// ApiWorkspaceEntry (ideally shared)
type WorkspaceStatus = 'error' | 'available' | 'not_found' | 'active' | 'inactive' | 'removed' | 'destroyed';
interface ApiWorkspaceEntry {
  id: string;
  owner: string;
  type: string;
  label: string;
  name?: string;
  color: string | null;
  description: string;
  acl: Record<string, any>; // Replaced specific acl with Record<string, any> for broader compatibility
  created: string;
  updated: string;
  rootPath: string;
  configPath: string;
  status: WorkspaceStatus;
  lastAccessed: string | null;
}

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
  const [workspaces, setWorkspaces] = useState<ApiWorkspaceEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newContextId, setNewContextId] = useState("")
  const [newContextUrl, setNewContextUrl] = useState("")
  const [newContextDescription, setNewContextDescription] = useState("")
  const [newContextBaseUrl, setNewContextBaseUrl] = useState("")
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("")
  const [isCreating, setIsCreating] = useState(false)
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
      // Assuming listContexts() service returns ContextEntry[] directly
      // Assuming listWorkspaces() service returns { payload: ApiWorkspaceEntry[] }
      const [fetchedContexts, workspacesApiResponse] = await Promise.all([
        listContexts(),
        listWorkspaces()
      ]);

      setContexts(fetchedContexts as unknown as ContextEntry[]); // Use the result of listContexts directly

      const workspacesData = (workspacesApiResponse as any).payload as unknown as ApiWorkspaceEntry[] || [];
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
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!socketService.isConnected()) {
      console.log('Socket not connected, attempting to connect...');
      socketService.reconnect();
      return;
    }
    console.log('Subscribing to context events');
    socketService.emit('subscribe', { topic: 'context' })

    const handleContextCreated = (data: { context: ContextEntry }) => {
      console.log('Received context created:', data);
      setContexts(prev => [...prev, data.context as unknown as ContextEntry])
    }
    const handleContextUpdated = (data: { context: ContextEntry }) => {
      console.log('Received context update:', data);
      const updatedContext = data.context as unknown as ContextEntry;
      setContexts(prev => prev.map(ctx =>
        ctx.id === updatedContext.id ? { ...ctx, ...updatedContext } : ctx
      ))
    }
    const handleContextDeleted = (data: { contextId: string }) => {
      console.log('Received context deletion:', data);
      setContexts(prev => prev.filter(ctx => ctx.id !== data.contextId))
    }
    const handleContextUrlChanged = (data: { context: ContextEntry }) => {
      console.log('Received context URL change:', data);
      const changedContext = data.context as unknown as ContextEntry;
      setContexts(prev => prev.map(ctx =>
        ctx.id === changedContext.id ? { ...ctx, ...changedContext } : ctx
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
      // Assuming createContext service returns the new ContextEntry directly
      const newContext = await createContext(newContextPayload);
      setContexts(prev => [...prev, newContext as unknown as ContextEntry]);
      setNewContextId("");
      setNewContextUrl("");
      setNewContextDescription("");
      setNewContextBaseUrl("");
      showToast({
        title: 'Success',
        // If createContext service returns a message property, use it, e.g., (newContext as any).message
        description: 'Context created successfully'
      });
      // Navigate to the newly created context
      navigate(`/contexts/${newContext.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create context';
      showToast({
        title: 'Error',
        description: message,
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
      const message = err instanceof Error ? err.message : 'Failed to delete context'
      showToast({
        title: 'Error',
        description: message,
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
                    {ws.label || ws.name || ws.id}
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
          <div className="border rounded-md">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 font-medium">ID</th>
                    <th className="text-left p-3 font-medium">User ID</th>
                    <th className="text-left p-3 font-medium">Context URL</th>
                    <th className="text-left p-3 font-medium">Workspace ID</th>
                    <th className="text-left p-3 font-medium">Base URL</th>
                    <th className="text-left p-3 font-medium">Path</th>
                    <th className="text-left p-3 font-medium">Locked</th>
                    <th className="text-left p-3 font-medium">Created</th>
                    <th className="text-left p-3 font-medium">Updated</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contexts.map((context) => {
                    const createdAtDisplay = context.createdAt ? new Date(context.createdAt).toLocaleDateString() : '-';
                    const updatedAtDisplay = context.updatedAt ? new Date(context.updatedAt).toLocaleDateString() : '-';
                    return (
                      <tr key={`${context.userId}-${context.id}`} className="border-t">
                        <td className="p-3 font-mono text-sm">{context.id}</td>
                        <td className="p-3 font-mono text-sm">{context.userId}</td>
                        <td className="p-3 font-mono text-sm">{context.url}</td>
                        <td className="p-3 font-mono text-sm">{context.workspaceId}</td>
                        <td className="p-3 font-mono text-sm">{context.baseUrl || '-'}</td>
                        <td className="p-3 font-mono text-sm">{context.path || '-'}</td>
                        <td className="p-3">{context.locked ? 'Yes' : 'No'}</td>
                        <td className="p-3">{createdAtDisplay}</td>
                        <td className="p-3">{updatedAtDisplay}</td>
                        <td className="p-3 text-right space-x-2">
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

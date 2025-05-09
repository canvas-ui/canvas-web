import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { API_ROUTES } from "@/config/api"
import { api } from "@/lib/api"
import { useToast } from "@/components/ui/toast-container"
import { Plus } from "lucide-react"
import { WorkspaceCard } from "@/components/ui/workspace-card"
import { useNavigate } from "react-router-dom"
import { useSocket } from "@/hooks/useSocket"

interface Workspace {
  id: string;
  name: string;
  description: string;
  color: string;
  type: string;
  status: 'available' | 'not_found' | 'error' | 'active' | 'inactive' | 'removed' | 'destroyed';
  created: string;
  updated: string;
}

interface ResponseObject<T> {
  status: 'success' | 'error';
  statusCode: number;
  message: string;
  payload: T;
  count?: number;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const socket = useSocket()

  useEffect(() => {
    fetchWorkspaces()

    // Subscribe to workspace events
    if (socket) {
      socket.emit('subscribe', { topic: 'workspace' })

      socket.on('workspace:status:changed', (data) => {
        setWorkspaces(prev => prev.map(ws =>
          ws.id === data.workspaceId ? { ...ws, status: data.status } : ws
        ))
      })

      socket.on('workspace:created', (data) => {
        // Add the new workspace to state instead of fetching all workspaces
        setWorkspaces(prev => [...prev, data.workspace])
      })

      socket.on('workspace:deleted', (data) => {
        setWorkspaces(prev => prev.filter(ws => ws.id !== data.workspaceId))
      })
    }

    return () => {
      if (socket) {
        socket.emit('unsubscribe', { topic: 'workspace' })
        socket.off('workspace:status:changed')
        socket.off('workspace:created')
        socket.off('workspace:deleted')
      }
    }
  }, [socket])

  const fetchWorkspaces = async () => {
    try {
      setIsLoading(true)
      const response = await api.get<ResponseObject<Workspace[]>>(API_ROUTES.workspaces)
      setWorkspaces(response.payload)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch workspaces'
      setError(message)
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkspaceName.trim()) return

    setIsCreating(true)
    try {
      const response = await api.post<ResponseObject<Workspace>>(API_ROUTES.workspaces, {
        name: newWorkspaceName,
        description: newWorkspaceDescription
      })
      await fetchWorkspaces()
      setNewWorkspaceName("")
      setNewWorkspaceDescription("")
      showToast({
        title: 'Success',
        description: response.message
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workspace'
      setError(message)
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingWorkspace) return

    try {
      const response = await api.put<ResponseObject<Workspace>>(`${API_ROUTES.workspaces}/${editingWorkspace.id}`, {
        name: editingWorkspace.name,
        description: editingWorkspace.description
      })
      await fetchWorkspaces()
      setEditingWorkspace(null)
      showToast({
        title: 'Success',
        description: response.message
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update workspace'
      setError(message)
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleStartWorkspace = async (workspaceId: string) => {
    try {
      const response = await api.post<ResponseObject<Workspace>>(`${API_ROUTES.workspaces}/${workspaceId}/start`)
      await fetchWorkspaces()
      showToast({
        title: 'Success',
        description: response.message
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start workspace'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleStopWorkspace = async (workspaceId: string) => {
    try {
      const response = await api.post<ResponseObject<Workspace>>(`${API_ROUTES.workspaces}/${workspaceId}/stop`)
      await fetchWorkspaces()
      showToast({
        title: 'Success',
        description: response.message
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop workspace'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleEnterWorkspace = (workspaceId: string) => {
    navigate(`/workspaces/${workspaceId}`)
  }

  return (
    <div className="container mx-auto p-4">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Create New Workspace</CardTitle>
            <CardDescription>Create a new workspace to organize your contexts</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div className="grid gap-2">
                <Input
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="Workspace Name"
                  disabled={isCreating}
                />
                <Input
                  value={newWorkspaceDescription}
                  onChange={(e) => setNewWorkspaceDescription(e.target.value)}
                  placeholder="Description (optional)"
                  disabled={isCreating}
                />
                <Button type="submit" disabled={isCreating || !newWorkspaceName.trim()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Workspace
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Workspaces</CardTitle>
            <CardDescription>Manage your workspaces</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-center text-muted-foreground">Loading workspaces...</p>}

            {error && (
              <div className="text-center text-destructive">
                <p>{error}</p>
              </div>
            )}

            {!isLoading && !error && workspaces.length === 0 && (
              <p className="text-center text-muted-foreground">No workspaces found</p>
            )}

            {workspaces.length > 0 && (
              <div className="grid gap-4">
                {workspaces.map((workspace) => (
                  <WorkspaceCard
                    key={workspace.id}
                    workspace={workspace}
                    onStart={handleStartWorkspace}
                    onStop={handleStopWorkspace}
                    onEnter={handleEnterWorkspace}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {editingWorkspace && (
          <Card>
            <CardHeader>
              <CardTitle>Edit Workspace</CardTitle>
              <CardDescription>Update workspace details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateWorkspace} className="space-y-4">
                <div className="grid gap-2">
                  <Input
                    value={editingWorkspace.name}
                    onChange={(e) => setEditingWorkspace({...editingWorkspace, name: e.target.value})}
                    placeholder="Workspace Name"
                  />
                  <Input
                    value={editingWorkspace.description || ''}
                    onChange={(e) => setEditingWorkspace({...editingWorkspace, description: e.target.value})}
                    placeholder="Description (optional)"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={!editingWorkspace.name.trim()}>
                      Update Workspace
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingWorkspace(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

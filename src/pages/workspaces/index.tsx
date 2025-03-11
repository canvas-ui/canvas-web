import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { API_ROUTES } from "@/config/api"
import { api } from "@/lib/api"
import { useToast } from "@/components/ui/toast-container"
import { Plus } from "lucide-react"
import { WorkspaceCard } from "@/components/ui/workspace-card"

interface Workspace {
  id: string;
  name: string;
  description: string;
  color: string;
  status: 'initialized' | 'active' | 'inactive' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  message: string;
  payload: T;
  status: "success" | "error";
  statusCode: number;
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

  useEffect(() => {
    fetchWorkspaces()
  }, [])

  const fetchWorkspaces = async () => {
    try {
      setIsLoading(true)
      const data = await api.get<ApiResponse<Workspace[] | { workspaces: Workspace[] }>>(API_ROUTES.workspaces)

      // Handle both response formats
      const workspacesData = Array.isArray(data.payload)
        ? data.payload
        : (data.payload as { workspaces: Workspace[] }).workspaces || [];

      setWorkspaces(workspacesData)
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
      await api.post(API_ROUTES.workspaces, {
        name: newWorkspaceName,
        description: newWorkspaceDescription
      })
      await fetchWorkspaces()
      setNewWorkspaceName("")
      setNewWorkspaceDescription("")
      showToast({
        title: 'Success',
        description: 'Workspace created successfully'
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
      await api.put(`${API_ROUTES.workspaces}/${editingWorkspace.id}`, {
        name: editingWorkspace.name,
        description: editingWorkspace.description
      })
      await fetchWorkspaces()
      setEditingWorkspace(null)
      showToast({
        title: 'Success',
        description: 'Workspace updated successfully'
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

  const handleOpenWorkspace = async (workspaceId: string) => {
    try {
      await api.post(`${API_ROUTES.workspaces}/${workspaceId}/open`)
      await fetchWorkspaces()
      showToast({
        title: 'Success',
        description: 'Workspace opened successfully'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open workspace'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleCloseWorkspace = async (workspaceId: string) => {
    try {
      await api.post(`${API_ROUTES.workspaces}/${workspaceId}/close`)
      await fetchWorkspaces()
      showToast({
        title: 'Success',
        description: 'Workspace closed successfully'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to close workspace'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleRemoveWorkspace = async (workspaceId: string) => {
    if (!confirm('Are you sure you want to remove this workspace? This action cannot be undone.')) {
      return
    }

    try {
      await api.delete(`${API_ROUTES.workspaces}/${workspaceId}`)
      await fetchWorkspaces()
      showToast({
        title: 'Success',
        description: 'Workspace removed successfully'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove workspace'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handlePurgeWorkspace = async (workspaceId: string) => {
    if (!confirm('Are you sure you want to purge this workspace? This will permanently delete all data. This action cannot be undone.')) {
      return
    }

    try {
      await api.delete(`${API_ROUTES.workspaces}/${workspaceId}/purge`)
      await fetchWorkspaces()
      showToast({
        title: 'Success',
        description: 'Workspace purged successfully'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to purge workspace'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
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
                    onOpen={handleOpenWorkspace}
                    onClose={handleCloseWorkspace}
                    onRemove={handleRemoveWorkspace}
                    onPurge={handlePurgeWorkspace}
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

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
  const [newWorkspaceColor, setNewWorkspaceColor] = useState(generateNiceRandomHexColor())
  const [newWorkspaceLabel, setNewWorkspaceLabel] = useState("")
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
        description: newWorkspaceDescription,
        color: newWorkspaceColor,
        label: newWorkspaceLabel
      })
      await fetchWorkspaces()
      setNewWorkspaceName("")
      setNewWorkspaceDescription("")
      setNewWorkspaceColor(generateNiceRandomHexColor())
      setNewWorkspaceLabel("")
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
            <CardDescription>Divide your Universe into self-contained workspaces</CardDescription>
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
                <Input
                  value={newWorkspaceLabel}
                  onChange={(e) => setNewWorkspaceLabel(e.target.value)}
                  placeholder="Workspace Label (optional)"
                  disabled={isCreating}
                />
                <p className="text-sm text-muted-foreground">Set Workspace Label</p>
                <div className="flex items-center gap-2">
                  <label htmlFor="workspace-color" className="text-sm font-medium">Workspace Color</label>
                  <Input
                    id="workspace-color"
                    type="color"
                    value={newWorkspaceColor}
                    onChange={(e) => setNewWorkspaceColor(e.target.value)}
                    className="h-10 w-16 p-1"
                    disabled={isCreating}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewWorkspaceColor(generateNiceRandomHexColor())}
                    disabled={isCreating}
                  >
                    Randomize
                  </Button>
                </div>
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

// Color Utility Functions
// From https://gist.github.com/bendc/76c48ce53299e6078a76
const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const generateRandomHsl = (): { h: number, s: number, l: number } => {
  const h = randomInt(0, 360);
  const s = randomInt(42, 98); // Saturation between 42% and 98%
  const l = randomInt(40, 90); // Lightness between 40% and 90%
  return { h, s, l };
};

// From https://css-tricks.com/converting-color-spaces-in-javascript/
const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;

  let c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs((h / 60) % 2 - 1)),
    m = l - c / 2,
    r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  const toHex = (val: number): string => {
    const hex = val.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const generateNiceRandomHexColor = (): string => {
  const { h, s, l } = generateRandomHsl();
  return hslToHex(h, s, l);
};

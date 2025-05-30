import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast-container"
import { Plus } from "lucide-react"
import { WorkspaceCard } from "@/components/ui/workspace-card"
import { useNavigate } from "react-router-dom"
import { useSocket } from "@/hooks/useSocket"
import {
  listWorkspaces,
  createWorkspace,
  closeWorkspace,
  startWorkspace,
} from "@/services/workspace"

// Specific status type based on linter feedback for WorkspaceCard compatibility
type WorkspaceStatus = 'error' | 'available' | 'not_found' | 'active' | 'inactive' | 'removed' | 'destroyed';

interface ApiWorkspaceEntry {
  id: string;
  owner: string;
  type: string;
  label: string;
  color: string | null;
  description: string;
  acl: {
    rw: string[];
    ro: string[];
  };
  created: string;
  updated: string;
  rootPath: string;
  configPath: string;
  status: WorkspaceStatus;
  lastAccessed: string | null;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<ApiWorkspaceEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("")
  const [newWorkspaceColor, setNewWorkspaceColor] = useState(generateNiceRandomHexColor())
  const [newWorkspaceLabel, setNewWorkspaceLabel] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<ApiWorkspaceEntry | null>(null)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const socket = useSocket()

  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        setIsLoading(true)
        const response = await listWorkspaces()
        // Assuming runtime data from listWorkspaces() matches ApiWorkspaceEntry structure
        setWorkspaces(response.payload as unknown as ApiWorkspaceEntry[])
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
    loadWorkspaces()

    if (socket) {
      socket.emit('subscribe', { topic: 'workspace' })

      // Assuming socket data.status also matches WorkspaceStatus
      socket.on('workspace:status:changed', (data: { workspaceId: string; status: WorkspaceStatus }) => {
        setWorkspaces(prev => prev.map(ws =>
          ws.id === data.workspaceId ? { ...ws, status: data.status } : ws
        ))
      })

      socket.on('workspace:created', (data: { workspace: ApiWorkspaceEntry }) => {
        // Assuming runtime data from socket matches ApiWorkspaceEntry structure
        setWorkspaces(prev => [...prev, data.workspace as unknown as ApiWorkspaceEntry])
      })

      socket.on('workspace:deleted', (data: { workspaceId: string }) => {
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

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkspaceName.trim()) return

    setIsCreating(true)
    try {
      const response = await createWorkspace({
        name: newWorkspaceName,
        description: newWorkspaceDescription || undefined,
        color: newWorkspaceColor,
        label: newWorkspaceLabel || newWorkspaceName,
      })
      // Assuming runtime data from createWorkspace() matches ApiWorkspaceEntry structure
      setWorkspaces(prev => [...prev, response.payload as unknown as ApiWorkspaceEntry])
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
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleSaveWorkspaceDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingWorkspace) return

    try {
      const payloadToUpdate = {
        label: editingWorkspace.label,
        description: editingWorkspace.description,
        color: editingWorkspace.color,
      };

      // TODO: Implement actual API call to PATCH /workspaces/:id
      // const apiResponse = await updateWorkspaceService(editingWorkspace.id, payloadToUpdate);
      // const updatedWorkspaceFromApi = apiResponse.payload as unknown as ApiWorkspaceEntry;

      // Mocking the update for now:
      const updatedMockedWorkspace: ApiWorkspaceEntry = {
        ...editingWorkspace,
        ...payloadToUpdate
      };

      setWorkspaces(prev => prev.map(ws =>
        ws.id === updatedMockedWorkspace.id ? updatedMockedWorkspace : ws
      ))

      showToast({
        title: 'Success (Mocked Update)',
        description: `Workspace '${updatedMockedWorkspace.label}' details updated. Implement actual API call.`
      })
      setEditingWorkspace(null)

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update workspace'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleStartWorkspace = async (workspaceId: string) => {
    try {
      const response = await startWorkspace(workspaceId)
      // Assuming runtime data from startWorkspace() matches ApiWorkspaceEntry structure
      setWorkspaces(prev => prev.map(ws => ws.id === response.payload.id ? (response.payload as unknown as ApiWorkspaceEntry) : ws))
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
      const response = await closeWorkspace(workspaceId)
      // Now closeWorkspace API returns the full workspace object like startWorkspace does
      setWorkspaces(prev => prev.map(ws => ws.id === response.payload.id ? (response.payload as unknown as ApiWorkspaceEntry) : ws))
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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Workspaces</h1>
        <p className="text-muted-foreground mt-2">Divide your Universe into self-contained workspaces</p>
      </div>

      {/* Create New Workspace Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Create New Workspace</h2>
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              placeholder="Workspace Name (becomes ID)"
              disabled={isCreating}
            />
            <Input
              value={newWorkspaceLabel}
              onChange={(e) => setNewWorkspaceLabel(e.target.value)}
              placeholder="Workspace Label (display name, optional)"
              disabled={isCreating}
            />
          </div>
          <Input
            value={newWorkspaceDescription}
            onChange={(e) => setNewWorkspaceDescription(e.target.value)}
            placeholder="Description (optional)"
            disabled={isCreating}
          />
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
        </form>
      </div>

      {/* Your Workspaces Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Workspaces</h2>

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
            {workspaces.map((ws) => {
              const workspaceCardProps = {
                ...ws,
                name: ws.label,
                createdAt: ws.created,
                updatedAt: ws.updated,
                color: ws.color === null ? undefined : ws.color,
              };
              return (
                <WorkspaceCard
                  key={ws.id}
                  workspace={workspaceCardProps}
                  onStart={handleStartWorkspace}
                  onStop={handleStopWorkspace}
                  onEnter={handleEnterWorkspace}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Workspace Section */}
      {editingWorkspace && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Edit Workspace: {editingWorkspace.label}</h2>
          <form onSubmit={handleSaveWorkspaceDetails} className="space-y-4">
            <div>
              <label htmlFor="edit-label" className="text-sm font-medium">Label</label>
              <Input
                id="edit-label"
                value={editingWorkspace.label}
                onChange={(e) => setEditingWorkspace(prev => prev ? {...prev, label: e.target.value} : null)}
                placeholder="Workspace Label"
              />
            </div>
            <div>
              <label htmlFor="edit-description" className="text-sm font-medium">Description</label>
              <Input
                id="edit-description"
                value={editingWorkspace.description || ''}
                onChange={(e) => setEditingWorkspace(prev => prev ? {...prev, description: e.target.value} : null)}
                placeholder="Description (optional)"
              />
            </div>
            <div>
              <label htmlFor="edit-color" className="text-sm font-medium">Color</label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-workspace-color"
                  type="color"
                  value={editingWorkspace.color || '#FFFFFF'}
                  onChange={(e) => setEditingWorkspace(prev => prev ? {...prev, color: e.target.value} : null)}
                  className="h-10 w-16 p-1"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingWorkspace(prev => prev ? {...prev, color: generateNiceRandomHexColor()} : null)}
                  >
                    Randomize Color
                  </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!editingWorkspace.label.trim()}>
                Save Changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingWorkspace(null)}
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

// Color Utility Functions (Restored)
const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const generateRandomHsl = (): { h: number, s: number, l: number } => {
  const h = randomInt(0, 360);
  const s = randomInt(42, 98);
  const l = randomInt(40, 90);
  return { h, s, l };
};

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

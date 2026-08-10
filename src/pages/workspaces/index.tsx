import { PageHeader } from '@/components/common/page-header'
import { useEffect, useState } from "react"
import { Icon } from "@iconify/react"
import { generateNiceRandomHexColor, visibleAccentColor, onAccentTextClass } from "@/utils/color"
import { LayerIconPicker } from "@/components/menu/shared/LayerIconPicker"
import { DEFAULT_WORKSPACE_ICON, type LayerStyle } from "@/lib/layer-style"
import { useSocketSubscription } from "@/hooks/useSocketSubscription"
import { FormPanel } from '@/components/common/form-panel';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast-container"
import { Plus, GripVertical } from "lucide-react"
import { WorkspaceCard } from "@/components/ui/workspace-card"
import { useNavigate } from "react-router-dom"
import { useCreatePanel } from "@/hooks/use-create-panel"
import { useSocket } from "@/hooks/useSocket"
import {
  listWorkspaces,
  createWorkspace,
  importWorkspaceFromRemote,
  startWorkspace,
  stopWorkspace,
  updateWorkspace,
  removeWorkspace,
} from "@/services/workspace"
import { DefaultFoldersPicker, createDefaultFolders, useFolderSelection } from '@/components/workspaces/DefaultFoldersPicker'
import { WorkspaceLayoutPicker } from '@/components/workspaces/WorkspaceLayoutPicker'
import { useDefaultWorkspaceLayout } from '@/hooks/useDefaultWorkspaceLayout'
import { sortByOrder, moveItem, persistSequentialOrder, useListReorder } from '@/lib/list-order'


// Using global Workspace interface from types/api.d.ts
// Specific status type based on linter feedback for WorkspaceCard compatibility
type WorkspaceStatus = 'error' | 'available' | 'not_found' | 'active' | 'inactive' | 'removed' | 'destroyed';

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("")
  const [newWorkspaceColor, setNewWorkspaceColor] = useState(generateNiceRandomHexColor())
  const [newWorkspaceIcon, setNewWorkspaceIcon] = useState<string | null>(null)
  const [newWorkspaceLabel, setNewWorkspaceLabel] = useState("")
  const [newWorkspaceLayout, setNewWorkspaceLayout] = useDefaultWorkspaceLayout()
  const [createPickerPos, setCreatePickerPos] = useState<{ x: number; y: number } | null>(null)
  const [editPickerPos, setEditPickerPos] = useState<{ x: number; y: number } | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreate, setShowCreate] = useCreatePanel();
  const folderPick = useFolderSelection();
  const [showShared, setShowShared] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const socket = useSocket()

  // WebSocket live updates
  useSocketSubscription(socket, 'workspace', {
    'workspace:status:changed': (data: { workspaceId: string; status: WorkspaceStatus }) =>
      setWorkspaces(prev => prev.map(ws => ws.id === data.workspaceId ? { ...ws, status: data.status } : ws)),
    'workspace:created': (data: { workspace: Workspace }) =>
      setWorkspaces(prev => [...prev, data.workspace as unknown as Workspace]),
    'workspace:deleted': (data: { workspaceId: string }) =>
      setWorkspaces(prev => prev.filter(ws => ws.id !== data.workspaceId))
  })

  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        setIsLoading(true)
        const workspacesData = await listWorkspaces()
        // The service now returns the array directly
        setWorkspaces(sortByOrder(workspacesData as Workspace[]))
        setError(null)
      } catch (err) {
        console.error('Workspace fetch error:', err);

        // Extract the most detailed error message available
        let errorMessage = 'Failed to fetch workspaces';

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
                       'Failed to fetch workspaces';
        }

        setError(errorMessage)
        showToast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive'
        })
      } finally {
        setIsLoading(false)
      }
    }
    loadWorkspaces()


  }, [socket])

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkspaceName.trim()) return

    setIsCreating(true)
    try {
      const newWorkspace = await createWorkspace({
        name: newWorkspaceName,
        description: newWorkspaceDescription || undefined,
        color: newWorkspaceColor,
        icon: newWorkspaceIcon,
        label: newWorkspaceLabel || newWorkspaceName,
        layout: newWorkspaceLayout,
      })
      // The service now returns the new workspace object directly
      setWorkspaces(prev => [...prev, newWorkspace as Workspace])
      // Starter folders: tree writes need the workspace running, so start it
      // first (cheap if the server auto-started it already).
      if (folderPick.selected.size > 0) {
        try {
          await startWorkspace(newWorkspace.name)
          const { ok, failed } = await createDefaultFolders(newWorkspace.name, Array.from(folderPick.selected), folderPick.tree)
          if (failed) showToast({ title: 'Folders', description: `${ok} folder(s) created, ${failed} failed`, variant: 'destructive' })
        } catch (folderErr) {
          console.error('Default folder creation failed:', folderErr)
          showToast({ title: 'Folders', description: 'Workspace created, but default folders failed', variant: 'destructive' })
        }
        folderPick.setSelected(new Set())
      }
      setNewWorkspaceName("")
      setNewWorkspaceDescription("")
      setNewWorkspaceColor(generateNiceRandomHexColor())
      setNewWorkspaceIcon(null)
      setNewWorkspaceLabel("")
      showToast({
        title: 'Success',
        description: `Workspace '${newWorkspace.label || newWorkspace.name}' created.`
      })
      setShowCreate(false)
    } catch (err) {
      console.error('Workspace creation error:', err);

      // Extract the most detailed error message available
      let errorMessage = 'Failed to create workspace';

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
                     'Failed to create workspace';
      }

      showToast({
        title: 'Error',
        description: errorMessage,
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
        icon: editingWorkspace.icon ?? null,
      };

      // PATCH returns success(true), not the workspace — merge locally.
      await updateWorkspace(editingWorkspace.name, payloadToUpdate);

      setWorkspaces(prev => prev.map(ws =>
        ws.id === editingWorkspace.id ? { ...ws, ...payloadToUpdate } : ws
      ))
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))

      showToast({
        title: 'Success',
        description: `Workspace '${editingWorkspace.label}' details updated.`
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

  const handleEditWorkspace = (workspace: Workspace) => {
    setEditingWorkspace(workspace)
  }

  const handleDestroyWorkspace = async (workspace: Workspace) => {
    try {
      // Remove the workspace (backend handles data destruction)
      await removeWorkspace(workspace.name)

      setWorkspaces(prev => prev.filter(ws => ws.id !== workspace.id))
      showToast({
        title: 'Success',
        description: `Workspace '${workspace.label || workspace.name}' has been destroyed.`
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to destroy workspace'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleStartWorkspace = async (workspaceName: string) => {
    try {
      const updatedWorkspace = await startWorkspace(workspaceName)
      // The service now returns the updated workspace object directly
      setWorkspaces(prev => prev.map(ws => ws.name === updatedWorkspace.name ? (updatedWorkspace as Workspace) : ws))
      showToast({
        title: 'Success',
        description: `Workspace '${updatedWorkspace.label || updatedWorkspace.name}' started.`
      })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
    } catch (err) {
      console.error('Workspace start error:', err);

      // Extract the most detailed error message available
      let errorMessage = 'Failed to start workspace';

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
                     'Failed to start workspace';
      }

      showToast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    }
  }

  const handleStopWorkspace = async (workspaceName: string) => {
    try {
      const updatedWorkspace = await stopWorkspace(workspaceName)
      // The service now returns the updated workspace object directly
      setWorkspaces(prev => prev.map(ws => ws.name === updatedWorkspace.name ? (updatedWorkspace as Workspace) : ws))
      showToast({
        title: 'Success',
        description: `Workspace '${updatedWorkspace.label || updatedWorkspace.name}' stopped.`
      })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
    } catch (err) {
      console.error('Workspace stop error:', err);

      // Extract the most detailed error message available
      let errorMessage = 'Failed to stop workspace';

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
                     'Failed to stop workspace';
      }

      showToast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    }
  }

  const handleEnterWorkspace = (workspaceName: string) => {
    navigate(`/workspaces/${workspaceName}`)
  }

  // Drag a card to reorder; sequential order values are persisted for the
  // rows that moved and mirrored to the sidebar via workspaces:refresh.
  const { rowProps, handleProps, draggingIndex, insertLineClass } = useListReorder((from, to) => {
    const next = moveItem(workspaces, from, to)
    setWorkspaces(next)
    persistSequentialOrder(next, (ws, order) => updateWorkspace(ws.name, { order }))
      .then(({ failed }) => {
        window.dispatchEvent(new CustomEvent('workspaces:refresh'))
        if (failed) showToast({ title: 'Partial reorder', description: `${failed} workspace(s) could not be reordered`, variant: 'destructive' })
      })
  })


  return (
    <div className="space-y-6">
      {/* List first; creation lives behind the button */}
      <PageHeader
        title="Workspaces"
        description="Divide your Universe into self-contained workspaces"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowShared(o => !o)} className="max-sm:hidden">
              Open Shared…
            </Button>
            <Button variant="outline" onClick={() => setShowRemote(o => !o)} className="max-sm:hidden">
              Add Remote…
            </Button>
            {!showCreate && (
              <Button onClick={() => setShowCreate(true)} className="max-sm:h-9 max-sm:w-9 max-sm:p-0" aria-label="Create workspace" title="Create workspace">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="max-sm:hidden">Create Workspace</span>
              </Button>
            )}
          </>
        }
      />

      {/* Create New Workspace Section */}
      {showCreate && (
      <FormPanel title="Create New Workspace" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              placeholder="Workspace Name (e.g., 'my-project')"
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
            <label htmlFor="workspace-color" className="text-sm font-medium">Icon &amp; Color</label>
            <button
              type="button"
              title="Pick icon &amp; color"
              disabled={isCreating}
              onClick={(e) => setCreatePickerPos({ x: Math.min(e.clientX, window.innerWidth - 290), y: Math.min(e.clientY, window.innerHeight - 360) })}
              className="flex h-10 w-10 items-center justify-center rounded-md border hover:bg-accent"
            >
              <Icon icon={newWorkspaceIcon || DEFAULT_WORKSPACE_ICON} width={22} height={22} color={visibleAccentColor(newWorkspaceColor)} />
            </button>
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
          {createPickerPos && (
            <LayerIconPicker
              x={createPickerPos.x}
              y={createPickerPos.y}
              current={{ icon: newWorkspaceIcon ?? undefined, color: newWorkspaceColor }}
              onChange={(change: LayerStyle) => {
                if ('icon' in change) setNewWorkspaceIcon(change.icon ?? null)
                if ('color' in change && change.color) setNewWorkspaceColor(change.color)
              }}
              onClose={() => setCreatePickerPos(null)}
            />
          )}
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Folder structure</p>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">How the workspace directory is laid out on disk. Fixed once created.</p>
            <WorkspaceLayoutPicker
              value={newWorkspaceLayout}
              onChange={setNewWorkspaceLayout}
              disabled={isCreating}
              idPrefix="create-workspace-layout"
            />
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Default folders <span className="font-normal text-muted-foreground">(optional)</span></p>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Ticked folders are created right after the workspace, with matching icons and colors.</p>
            <DefaultFoldersPicker
              selected={folderPick.selected}
              onToggle={folderPick.toggle}
              tree={folderPick.tree}
              onTreeChange={folderPick.setTree}
              disabled={isCreating}
              idPrefix="create-default-folders"
            />
          </div>
          <Button type="submit" disabled={isCreating || !newWorkspaceName.trim()}>
            <Plus className="mr-2 h-4 w-4" />
            Create Workspace
          </Button>
        </form>
      </FormPanel>
      )}

      {/* Open Shared Resource — behind the header toggle */}
      {showShared && <OpenSharedResource />}

      {/* Add Remote Workspace — pulls a copy from another canvas-server */}
      {showRemote && (
        <AddRemoteWorkspace
          onImported={(ws) => {
            setWorkspaces(prev => prev.some(w => w.id === ws.id) ? prev : [...prev, ws])
            window.dispatchEvent(new CustomEvent('workspaces:refresh'))
            setShowRemote(false)
          }}
          onClose={() => setShowRemote(false)}
        />
      )}

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
            {workspaces.map((ws, index) => {
              const workspaceCardProps = {
                ...ws,
                createdAt: ws.createdAt,
                updatedAt: ws.updatedAt,
                color: ws.color === null ? undefined : ws.color,
              };
              const accent = visibleAccentColor(ws.color);
              return (
                <div
                  key={ws.id}
                  {...rowProps(index)}
                  className={`flex items-stretch rounded-lg ${insertLineClass(index, workspaces.length) || ''} ${draggingIndex === index ? 'opacity-60' : ''}`}
                >
                  {/* Widened color strip doubles as the drag handle, sitting on
                      the card's accent (left) edge. */}
                  <button
                    type="button"
                    {...handleProps(index)}
                    title="Drag to reorder"
                    aria-label="Drag to reorder"
                    className={`hidden w-5 shrink-0 cursor-grab items-center justify-center rounded-l-lg active:cursor-grabbing md:flex ${accent ? '' : 'bg-muted'}`}
                    style={accent ? { backgroundColor: accent } : undefined}
                  >
                    <GripVertical className={`h-4 w-4 ${onAccentTextClass(accent)}`} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <WorkspaceCard
                      workspace={workspaceCardProps}
                      onStart={handleStartWorkspace}
                      onStop={handleStopWorkspace}
                      onEnter={handleEnterWorkspace}
                      onEdit={handleEditWorkspace}
                      onSettings={(w) => navigate(`/workspaces/${w.name}/settings/general`)}
                      onDestroy={handleDestroyWorkspace}
                    />
                  </div>
                </div>
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
              <label htmlFor="edit-color" className="text-sm font-medium">Icon &amp; Color</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Pick icon &amp; color"
                  onClick={(e) => setEditPickerPos({ x: Math.min(e.clientX, window.innerWidth - 290), y: Math.min(e.clientY, window.innerHeight - 360) })}
                  className="flex h-10 w-10 items-center justify-center rounded-md border hover:bg-accent"
                >
                  <Icon icon={editingWorkspace.icon || DEFAULT_WORKSPACE_ICON} width={22} height={22} color={visibleAccentColor(editingWorkspace.color)} />
                </button>
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
              <Button type="submit" disabled={!editingWorkspace.label?.trim()}>
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
          {editPickerPos && (
            <LayerIconPicker
              x={editPickerPos.x}
              y={editPickerPos.y}
              current={{ icon: editingWorkspace.icon ?? undefined, color: editingWorkspace.color ?? undefined }}
              onChange={(change: LayerStyle) => {
                setEditingWorkspace(prev => {
                  if (!prev) return null
                  const next = { ...prev }
                  if ('icon' in change) next.icon = change.icon ?? null
                  if ('color' in change && change.color) next.color = change.color
                  return next
                })
              }}
              onClose={() => setEditPickerPos(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// Pull a workspace from another canvas-server using a workspace share token.
// The server does the heavy lifting (token-info, remote export, download,
// local import); we only collect {url, token} and show the outcome.
function AddRemoteWorkspace({ onImported, onClose }: { onImported: (ws: Workspace) => void; onClose: () => void }) {
  const { showToast } = useToast()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    let base: string
    try {
      base = new URL(url.trim()).origin
    } catch {
      showToast({ title: 'Error', description: 'Invalid server URL', variant: 'destructive' })
      return
    }
    if (!token.trim().startsWith('canvas-')) {
      showToast({ title: 'Error', description: 'Invalid access token (expected canvas-...)', variant: 'destructive' })
      return
    }

    setIsImporting(true)
    try {
      const ws = await importWorkspaceFromRemote(base, token.trim())
      showToast({
        title: 'Success',
        description: `Workspace '${ws.label || ws.name}' imported from ${base}.`
      })
      onImported(ws as Workspace)
    } catch (err) {
      const errorObj = err as any
      const message = errorObj?.message || errorObj?.payload?.message || 'Failed to import remote workspace'
      showToast({ title: 'Error', description: message, variant: 'destructive' })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <FormPanel title="Add Remote Workspace" onClose={onClose}>
      <form onSubmit={handleImport} className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <Input
            placeholder="Server URL (e.g., https://my.canvas-server.tld)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isImporting}
          />
          <Input
            placeholder="Workspace share token (canvas-...)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={isImporting}
          />
          <Button type="submit" disabled={isImporting || !url.trim() || !token.trim()}>
            {isImporting ? 'Importing…' : 'Import Workspace'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Pulls a full copy of the shared workspace from the remote canvas-server into this one.
          The source workspace must be stopped on the remote side; large workspaces can take a while.
        </p>
      </form>
    </FormPanel>
  )
}

function OpenSharedResource() {
  const { showToast } = useToast()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [isOpening, setIsOpening] = useState(false)

  const parse = (input: string) => {
    try {
      const u = new URL(input)
      return u
    } catch {
      return null
    }
  }

  const handleOpen = async () => {
    const u = parse(url.trim())
    if (!u) {
      showToast({ title: 'Error', description: 'Invalid URL', variant: 'destructive' })
      return
    }
    if (!token.trim().startsWith('canvas-')) {
      showToast({ title: 'Error', description: 'Invalid access token', variant: 'destructive' })
      return
    }

    setIsOpening(true)
    try {
      // Navigate to shared viewer to keep UI minimal and reusable
      sessionStorage.setItem('sharedToken:last', token.trim())
      const q = new URLSearchParams({ url: url.trim() }).toString()
      window.location.href = `/shared?${q}`
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to open shared resource', variant: 'destructive' })
    } finally {
      setIsOpening(false)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Open Shared Resource</h2>
      <div className="grid gap-2 md:grid-cols-3">
        <Input placeholder="Shared URL (e.g., https://host/rest/v2/pub/workspaces/ID)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input placeholder="Access token (canvas-...)" value={token} onChange={(e) => setToken(e.target.value)} />
        <Button onClick={handleOpen} disabled={isOpening || !url.trim() || !token.trim()}>Open</Button>
      </div>
      <p className="text-sm text-muted-foreground">We use your provided URL and token to fetch via the remote's public API.</p>
    </div>
  )
}




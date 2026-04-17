import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { generateNiceRandomHexColor } from '@/utils/color'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { listWorkspaces, updateWorkspace, removeWorkspace } from '@/services/workspace'

export default function WorkspaceSettingsPage() {
  const { workspaceName } = useParams<{ workspaceName: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDestroying, setIsDestroying] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#FFFFFF')

  useEffect(() => {
    async function load() {
      try {
        const workspaces = await listWorkspaces()
        const ws = workspaces.find(w => w.name === workspaceName)
        if (ws) {
          setWorkspace(ws)
          setLabel(ws.label || '')
          setDescription(ws.description || '')
          setColor(ws.color || '#FFFFFF')
        }
      } catch (err) {
        showToast({ title: 'Error', description: 'Failed to load workspace', variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [workspaceName])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspace) return
    setIsSaving(true)
    try {
      await updateWorkspace(workspace.name, { label: label.trim(), description: description.trim(), color })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
      showToast({ title: 'Saved', description: 'Workspace settings updated' })
      navigate(`/workspaces/${workspaceName}`)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDestroy = async () => {
    if (!workspace) return
    if (!window.confirm(`Destroy workspace "${workspace.label || workspace.name}"? This cannot be undone.`)) return
    setIsDestroying(true)
    try {
      await removeWorkspace(workspace.name)
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
      showToast({ title: 'Destroyed', description: `${workspace.label || workspace.name} has been removed` })
      navigate('/workspaces')
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Destroy failed', variant: 'destructive' })
    } finally {
      setIsDestroying(false)
    }
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  }

  if (!workspace) {
    return <div className="p-6 text-sm text-muted-foreground">Workspace not found</div>
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(`/workspaces/${workspaceName}`)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold">Settings — {workspace.label || workspace.name}</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="ws-label" className="text-sm font-medium">Label</label>
          <Input id="ws-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="Workspace Label" />
        </div>
        <div>
          <label htmlFor="ws-description" className="text-sm font-medium">Description</label>
          <Input id="ws-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" />
        </div>
        <div>
          <label htmlFor="ws-color" className="text-sm font-medium">Color</label>
          <div className="flex items-center gap-2">
            <Input id="ws-color" type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-16 p-1" />
            <Button type="button" variant="outline" size="sm" onClick={() => setColor(generateNiceRandomHexColor())}>
              Randomize
            </Button>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isSaving || !label.trim()}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/workspaces/${workspaceName}`)}>
            Cancel
          </Button>
        </div>
      </form>

      <div className="border-t pt-6 space-y-3">
        <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
        <Button variant="destructive" disabled={isDestroying} onClick={handleDestroy}>
          <Trash2 className="w-4 h-4 mr-2" />
          {isDestroying ? 'Destroying...' : 'Destroy Workspace'}
        </Button>
      </div>
    </div>
  )
}

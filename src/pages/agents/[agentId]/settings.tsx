import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { generateNiceRandomHexColor } from '@/utils/color'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { getAgent, updateAgent, deleteAgent, type Agent } from '@/services/agent'

export default function AgentSettingsPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#FFFFFF')

  useEffect(() => {
    async function load() {
      if (!agentId) return
      try {
        const a = await getAgent(agentId)
        setAgent(a)
        setLabel(a.label || a.name || '')
        setDescription(a.description || '')
        setColor(a.color || '#FFFFFF')
      } catch (err) {
        showToast({ title: 'Error', description: 'Failed to load agent', variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [agentId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentId) return
    setIsSaving(true)
    try {
      await updateAgent(agentId, { label: label.trim(), description: description.trim(), color })
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Saved', description: 'Agent settings updated' })
      navigate(`/agents/${agentId}`)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!agentId || !agent) return
    if (!window.confirm(`Delete agent "${agent.label || agent.name}"? This cannot be undone.`)) return
    setIsDeleting(true)
    try {
      await deleteAgent(agentId)
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Deleted', description: `${agent.label || agent.name} has been removed` })
      navigate('/agents')
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  }

  if (!agent) {
    return <div className="p-6 text-sm text-muted-foreground">Agent not found</div>
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(`/agents/${agentId}`)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold">Settings — {agent.label || agent.name}</h1>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <div>Provider: {agent.llmProvider} / {agent.model}</div>
        <div>Status: {agent.status}</div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="agent-label" className="text-sm font-medium">Label</label>
          <Input id="agent-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="Agent Label" />
        </div>
        <div>
          <label htmlFor="agent-description" className="text-sm font-medium">Description</label>
          <Input id="agent-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" />
        </div>
        <div>
          <label htmlFor="agent-color" className="text-sm font-medium">Color</label>
          <div className="flex items-center gap-2">
            <Input id="agent-color" type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-16 p-1" />
            <Button type="button" variant="outline" size="sm" onClick={() => setColor(generateNiceRandomHexColor())}>
              Randomize
            </Button>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isSaving || !label.trim()}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/agents/${agentId}`)}>
            Cancel
          </Button>
        </div>
      </form>

      <div className="border-t pt-6 space-y-3">
        <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
        <Button variant="destructive" disabled={isDeleting} onClick={handleDelete}>
          <Trash2 className="w-4 h-4 mr-2" />
          {isDeleting ? 'Deleting...' : 'Delete Agent'}
        </Button>
      </div>
    </div>
  )
}

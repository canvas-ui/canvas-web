import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { M2Header } from '@/components/menu/shared/M2Header'
import { useMenu } from '@/components/shell/menu-context'
import { generateNiceRandomHexColor } from '@/utils/color'
import { listWorkspaces, createWorkspace, updateWorkspace, removeWorkspace } from '@/services/workspace'

export function WorkspaceM2Form() {
  const { state, closeM2 } = useMenu()
  const entityId = state.selectedEntityId  // null = create, string = edit (workspace name)
  const { showToast } = useToast()
  const isCreate = !entityId

  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(generateNiceRandomHexColor())
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDestroying, setIsDestroying] = useState(false)

  useEffect(() => {
    if (isCreate) return
    async function load() {
      try {
        const all = await listWorkspaces()
        const ws = all.find(w => w.name === entityId)
        if (ws) {
          setWorkspace(ws)
          setLabel(ws.label || '')
          setDescription(ws.description || '')
          setColor(ws.color || '#FFFFFF')
        }
      } catch {
        showToast({ title: 'Error', description: 'Failed to load workspace', variant: 'destructive' })
      }
    }
    load()
  }, [entityId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsSaving(true)
    try {
      await createWorkspace({ name: name.trim(), label: label.trim() || name.trim(), description: description.trim() || undefined, color })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
      showToast({ title: 'Created', description: `Workspace "${label || name}" created` })
      closeM2()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Create failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entityId) return
    setIsSaving(true)
    try {
      await updateWorkspace(entityId, { label: label.trim(), description: description.trim(), color })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
      showToast({ title: 'Saved', description: 'Workspace updated' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDestroy = async () => {
    if (!entityId) return
    if (!window.confirm(`Destroy workspace "${workspace?.label || entityId}"? This cannot be undone.`)) return
    setIsDestroying(true)
    try {
      await removeWorkspace(entityId)
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
      showToast({ title: 'Destroyed', description: `Workspace "${entityId}" removed` })
      closeM2()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Destroy failed', variant: 'destructive' })
    } finally {
      setIsDestroying(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <M2Header
        title={isCreate ? 'New Workspace' : `Edit — ${workspace?.label || entityId}`}
        onBack={closeM2}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <form onSubmit={isCreate ? handleCreate : handleSave} className="space-y-3">
          {isCreate && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="my-workspace"
                className="mt-1 h-8 text-sm"
              />
            </div>
          )}
          {!isCreate && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <div className="mt-1 h-8 px-2 flex items-center text-sm text-muted-foreground bg-muted rounded-md">
                {entityId}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Label</label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Display name" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Color</label>
            <div className="mt-1 flex gap-2">
              <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-14 p-1" />
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setColor(generateNiceRandomHexColor())}>
                Random
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full h-8 text-sm" disabled={isSaving || (isCreate && !name.trim())}>
            {isSaving ? (isCreate ? 'Creating…' : 'Saving…') : (isCreate ? 'Create Workspace' : 'Save Changes')}
          </Button>
        </form>

        {!isCreate && (
          <div className="border-t pt-4 space-y-2">
            <div className="text-xs font-medium text-destructive">Danger Zone</div>
            <Button type="button" variant="destructive" className="w-full h-8 text-sm" disabled={isDestroying} onClick={handleDestroy}>
              {isDestroying ? 'Destroying…' : 'Destroy Workspace'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

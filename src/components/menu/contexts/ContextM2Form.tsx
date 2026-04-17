import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { M2Header } from '@/components/menu/shared/M2Header'
import { useMenu } from '@/components/shell/menu-context'
import { getContext, createContext, updateContext, updateContextUrl, deleteContext } from '@/services/context'
import { listWorkspaces } from '@/services/workspace'

export function ContextM2Form() {
  const { state, closeM2 } = useMenu()
  const entityId = state.selectedEntityId  // null = create, string = edit
  const { showToast } = useToast()
  const isCreate = !entityId

  // Create mode state
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('/')
  const [newBaseUrl, setNewBaseUrl] = useState('')
  const [newWorkspaceId, setNewWorkspaceId] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  // Edit mode state
  const [context, setContext] = useState<Context | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (isCreate) {
      listWorkspaces().then(ws => {
        setWorkspaces(ws)
        if (ws.length > 0) setNewWorkspaceId(ws[0].id)
      }).catch(() => {})
      return
    }
    async function load() {
      try {
        const ctx = await getContext(entityId!)
        setContext(ctx)
        setEditName(ctx.name || '')
        setEditUrl(ctx.url || '')
      } catch {
        showToast({ title: 'Error', description: 'Failed to load context', variant: 'destructive' })
      }
    }
    load()
  }, [entityId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newId.trim() || !newWorkspaceId) return
    setIsSaving(true)
    try {
      await createContext({
        id: newId.trim(),
        name: newName.trim() || undefined,
        url: newUrl.trim() || '/',
        baseUrl: newBaseUrl.trim() || undefined,
        workspaceId: newWorkspaceId,
      })
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      showToast({ title: 'Created', description: `Context "${newId}" created` })
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
      await Promise.all([
        updateContextUrl(entityId, editUrl),
        updateContext(entityId, { name: editName.trim() || null }),
      ])
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      showToast({ title: 'Saved', description: 'Context updated' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!entityId) return
    if (!window.confirm(`Delete context "${entityId}"? This cannot be undone.`)) return
    setIsDeleting(true)
    try {
      await deleteContext(entityId)
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      showToast({ title: 'Deleted', description: `Context "${entityId}" removed` })
      closeM2()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <M2Header
        title={isCreate ? 'New Context' : `Edit — ${context?.name || entityId}`}
        onBack={closeM2}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isCreate ? (
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Context ID</label>
              <Input
                value={newId}
                onChange={e => setNewId(e.target.value)}
                placeholder="my-context"
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name <span className="text-muted-foreground/60">(optional)</span></label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="My Context"
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Initial URL</label>
              <Input
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                placeholder="workspace://path"
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Base URL <span className="text-muted-foreground/60">(optional)</span></label>
              <Input
                value={newBaseUrl}
                onChange={e => setNewBaseUrl(e.target.value)}
                placeholder="workspace://base/path"
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Workspace</label>
              <select
                value={newWorkspaceId}
                onChange={e => setNewWorkspaceId(e.target.value)}
                className="mt-1 w-full h-8 px-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.label || ws.name}</option>
                ))}
              </select>
            </div>
            <Button type="submit" className="w-full h-8 text-sm" disabled={isSaving || !newId.trim()}>
              {isSaving ? 'Creating…' : 'Create Context'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Context ID</label>
              <div className="mt-1 h-8 px-2 flex items-center text-sm text-muted-foreground bg-muted rounded-md font-mono">
                {entityId}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name <span className="text-muted-foreground/60">(optional)</span></label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="My Context"
                className="mt-1 h-8 text-sm"
              />
            </div>
            {context?.workspaceName && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Workspace</label>
                <div className="mt-1 h-8 px-2 flex items-center text-sm text-muted-foreground bg-muted rounded-md">
                  {context.workspaceName}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">URL</label>
              <Input
                value={editUrl}
                onChange={e => setEditUrl(e.target.value)}
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <Button type="submit" className="w-full h-8 text-sm" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </form>
        )}

        {!isCreate && (
          <div className="border-t pt-4 space-y-2">
            <div className="text-xs font-medium text-destructive">Danger Zone</div>
            <Button
              type="button"
              variant="destructive"
              className="w-full h-8 text-sm"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? 'Deleting…' : 'Delete Context'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

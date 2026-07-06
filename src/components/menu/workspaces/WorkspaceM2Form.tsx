import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { M2Header } from '@/components/menu/shared/M2Header'
import { useMenu } from '@/components/shell/menu-context'
import { generateNiceRandomHexColor } from '@/utils/color'
import { Copy, ExternalLink, RefreshCw, Unlink } from 'lucide-react'
import {
  listWorkspaces,
  createWorkspace,
  startWorkspace,
  updateWorkspace,
  removeWorkspace,
  listWorkspaceShares,
  revokeWorkspacePublicCanvasShare,
} from '@/services/workspace'
import type { WorkspacePublicCanvasShare } from '@/services/workspace'
import { DefaultFoldersPicker, createDefaultFolders, useFolderSelection } from '@/components/workspaces/DefaultFoldersPicker'

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
  const [shares, setShares] = useState<WorkspacePublicCanvasShare[]>([])
  const [isLoadingShares, setIsLoadingShares] = useState(false)
  const [revokingCode, setRevokingCode] = useState<string | null>(null)
  const folderPick = useFolderSelection()

  const loadShares = async (workspaceId = entityId) => {
    if (!workspaceId) return
    setIsLoadingShares(true)
    try {
      const result = await listWorkspaceShares(workspaceId)
      setShares(result.publicCanvasShares)
    } catch {
      setShares([])
    } finally {
      setIsLoadingShares(false)
    }
  }

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
        await loadShares(entityId!)
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
      const ws = await createWorkspace({ name: name.trim(), label: label.trim() || name.trim(), description: description.trim() || undefined, color })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
      if (folderPick.selected.size > 0) {
        try {
          await startWorkspace(ws.name)
          const { ok, failed } = await createDefaultFolders(ws.name, Array.from(folderPick.selected), folderPick.tree)
          if (failed) showToast({ title: 'Folders', description: `${ok} created, ${failed} failed`, variant: 'destructive' })
        } catch {
          showToast({ title: 'Folders', description: 'Workspace created, but default folders failed', variant: 'destructive' })
        }
      }
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

  const copyShareUrl = async (share: WorkspacePublicCanvasShare) => {
    const url = `${window.location.origin}${share.url}`
    await navigator.clipboard?.writeText(url)
    showToast({ title: 'Copied', description: url })
  }

  const revokeShare = async (share: WorkspacePublicCanvasShare) => {
    if (!entityId) return
    if (!window.confirm(`Revoke public share for "${share.path}"?`)) return
    setRevokingCode(share.code)
    try {
      await revokeWorkspacePublicCanvasShare(entityId, share.code)
      await loadShares(entityId)
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName: entityId } }))
      showToast({ title: 'Revoked', description: 'Public canvas link no longer works' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to revoke share', variant: 'destructive' })
    } finally {
      setRevokingCode(null)
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
          {isCreate && (
            <div className="rounded-md border p-3">
              <div className="text-xs font-medium">Default folders <span className="font-normal text-muted-foreground">(optional)</span></div>
              <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">Created right after the workspace, with icons and colors.</p>
              <DefaultFoldersPicker
                selected={folderPick.selected}
                onToggle={folderPick.toggle}
                tree={folderPick.tree}
                onTreeChange={folderPick.setTree}
                disabled={isSaving}
                idPrefix="m2-default-folders"
                stacked
              />
            </div>
          )}
          <Button type="submit" className="w-full h-8 text-sm" disabled={isSaving || (isCreate && !name.trim())}>
            {isSaving ? (isCreate ? 'Creating…' : 'Saving…') : (isCreate ? 'Create Workspace' : 'Save Changes')}
          </Button>
        </form>

        {!isCreate && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Shares</div>
                <div className="text-[10px] text-muted-foreground">Public canvas links in this workspace</div>
              </div>
              <button
                type="button"
                onClick={() => loadShares()}
                disabled={isLoadingShares}
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Refresh shares"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingShares ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {shares.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                No public canvas shares.
              </div>
            ) : (
              <div className="space-y-2">
                {shares.map(share => {
                  const url = `${window.location.origin}${share.url}`
                  return (
                    <div key={share.code} className="rounded-md border p-2 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs">{share.path}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {new Date(share.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${share.locked ? 'text-green-700 bg-green-50 border-green-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                          {share.locked ? 'Locked' : 'Unlocked'}
                        </span>
                      </div>
                      <div className="truncate rounded bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                        {url}
                      </div>
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => copyShareUrl(share)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => window.open(url, '_blank', 'noreferrer')}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          disabled={revokingCode === share.code}
                          onClick={() => revokeShare(share)}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

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

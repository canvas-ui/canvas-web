import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Database, ExternalLink, RefreshCw, Server, Trash2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HooksPanel } from '@/components/workspace/hooks-panel'
import { ImapMailboxesPanel } from '@/components/workspace/imap-mailboxes-panel'
import { TokenManager } from '@/components/workspace/token-manager'
import { useToast } from '@/components/ui/toast-container'
import { generateNiceRandomHexColor } from '@/utils/color'
import {
  disableWorkspaceService,
  enableWorkspaceService,
  getWorkspaceDataBackends,
  getWorkspaceServicesStatus,
  listWorkspaceShares,
  listWorkspaces,
  removeWorkspace,
  resyncWorkspaceDataBackend,
  revokeWorkspacePublicCanvasShare,
  updateWorkspace,
  updateWorkspaceDataBackends,
  type WorkspaceDataBackendStatus,
  type WorkspacePublicCanvasShare,
  type WorkspaceServicesStatus,
} from '@/services/workspace'

type SettingsTab = 'general' | 'data' | 'services' | 'shares' | 'hooks'
type ServiceId = 'dotfiles' | 'git' | 'home' | 'webdav' | 'imap' | 'imapSync'

const DATA_BACKEND_LABELS: Record<string, { title: string; description: string }> = {
  'fs:home': {
    title: 'Local FS: Home',
    description: 'User-managed roaming home folder, exported through WebDAV and watched for changes.',
  },
  'fs:data': {
    title: 'Local FS: Data',
    description: 'Stored-managed workspace data. Humans poking here directly are asking for a boring afternoon.',
  },
  'stored.cache': {
    title: 'Stored Cache',
    description: 'Local cacache used for content-addressed blobs and public resource serving.',
  },
  s3: {
    title: 'S3',
    description: 'Remote object storage. Placeholder until Stored gets a real S3 driver.',
  },
  imap: {
    title: 'IMAP',
    description: 'Mailbox data source; incoming mail lands in the virtual .incoming tree.',
  },
}

const SERVICE_ITEMS: Array<{ id: ServiceId; title: string; description: string }> = [
  { id: 'git', title: 'Git', description: 'Git-backed dotfile access.' },
  { id: 'webdav', title: 'WebDAV', description: 'Mountable access to the workspace home backend.' },
  { id: 'imapSync', title: 'IMAP Sync Worker', description: 'Background mailbox polling and ingestion.' },
]

function Toggle({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

export default function WorkspaceSettingsPage() {
  const { workspaceName } = useParams<{ workspaceName: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDestroying, setIsDestroying] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#FFFFFF')
  const [shares, setShares] = useState<WorkspacePublicCanvasShare[]>([])
  const [services, setServices] = useState<WorkspaceServicesStatus | null>(null)
  const [dataBackends, setDataBackends] = useState<Record<string, WorkspaceDataBackendStatus>>({})
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const workspaceId = workspace?.name || workspaceName || ''

  const loadShares = async (id = workspaceId) => {
    if (!id) return
    try {
      const result = await listWorkspaceShares(id)
      setShares(result.publicCanvasShares)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load shares', variant: 'destructive' })
    }
  }

  const loadRuntimeSettings = async (id = workspaceId) => {
    if (!id) return
    const [nextServices, nextBackends] = await Promise.all([
      getWorkspaceServicesStatus(id).catch(() => null),
      getWorkspaceDataBackends(id).catch(() => ({})),
    ])
    setServices(nextServices)
    setDataBackends(nextBackends)
  }

  useEffect(() => {
    async function load() {
      try {
        const workspaces = await listWorkspaces()
        const ws = workspaces.find(w => w.name === workspaceName || w.id === workspaceName)
        if (ws) {
          setWorkspace(ws)
          setLabel(ws.label || '')
          setDescription(ws.description || '')
          setColor(ws.color || '#FFFFFF')
          await Promise.all([loadShares(ws.name), loadRuntimeSettings(ws.name)])
        }
      } catch {
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

  const toggleDataBackend = async (backendId: string) => {
    const backend = dataBackends[backendId]
    if (!backend || backend.supported === false) return
    setBusyAction(`backend:${backendId}`)
    try {
      const next = await updateWorkspaceDataBackends(workspaceId, { [backendId]: { enabled: !backend.enabled } })
      setDataBackends(next)
      showToast({ title: 'Saved', description: `${backendId} ${backend.enabled ? 'disabled' : 'enabled'}` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update backend', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  const patchDataBackend = async (backendId: string, patch: Partial<WorkspaceDataBackendStatus>, action: string) => {
    setBusyAction(`${action}:${backendId}`)
    try {
      const next = await updateWorkspaceDataBackends(workspaceId, { [backendId]: patch })
      setDataBackends(next)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update backend', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  const resyncBackend = async (backendId: string) => {
    setBusyAction(`resync:${backendId}`)
    try {
      const result = await resyncWorkspaceDataBackend(workspaceId, backendId)
      await loadRuntimeSettings()
      showToast({ title: 'Re-synced', description: `${result.count} file(s) indexed from ${backendId}` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Re-sync failed', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  const toggleService = async (serviceId: ServiceId, enabled: boolean) => {
    setBusyAction(`service:${serviceId}`)
    try {
      if (enabled) {
        await disableWorkspaceService(workspaceId, serviceId)
      } else {
        await enableWorkspaceService(workspaceId, serviceId)
      }
      await loadRuntimeSettings()
      showToast({ title: enabled ? 'Disabled' : 'Enabled', description: `${serviceId} ${enabled ? 'disabled' : 'enabled'}` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to toggle service', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  const copyShareUrl = async (share: WorkspacePublicCanvasShare) => {
    const url = `${window.location.origin}${share.url}`
    await navigator.clipboard?.writeText(url)
    showToast({ title: 'Copied', description: url })
  }

  const revokeShare = async (share: WorkspacePublicCanvasShare) => {
    if (!workspace) return
    if (!window.confirm(`Revoke public share for "${share.path}"?`)) return
    setBusyAction(`share:${share.code}`)
    try {
      await revokeWorkspacePublicCanvasShare(workspace.name, share.code)
      await loadShares(workspace.name)
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName: workspace.name } }))
      showToast({ title: 'Revoked', description: 'Public canvas link no longer works' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to revoke share', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  if (!workspace) return <div className="p-6 text-sm text-muted-foreground">Workspace not found</div>

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl p-6 pb-12">
      <div className="mb-5 flex items-center gap-3">
        <button type="button" onClick={() => navigate(`/workspaces/${workspaceName}`)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold">Settings - {workspace.label || workspace.name}</h1>
          <p className="text-xs text-muted-foreground">{workspace.rootPath}</p>
        </div>
      </div>

      <div className="mb-6 flex gap-2 border-b">
        {[
          ['general', 'General'],
          ['data', 'Data Backends'],
          ['services', 'Services'],
          ['shares', 'Shares / ACL'],
          ['hooks', 'Hooks'],
        ].map(([id, title]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id as SettingsTab)}
            className={`px-3 py-2 text-sm font-medium ${activeTab === id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {title}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="space-y-6">
          <form onSubmit={handleSave} className="space-y-4 rounded-lg border p-4">
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
                <Button type="button" variant="outline" size="sm" onClick={() => setColor(generateNiceRandomHexColor())}>Randomize</Button>
              </div>
            </div>
            <Button type="submit" disabled={isSaving || !label.trim()}>{isSaving ? 'Saving...' : 'Save Changes'}</Button>
          </form>

          <section className="rounded-lg border border-destructive/30 p-4">
            <h2 className="mb-3 text-sm font-semibold text-destructive">Danger Zone</h2>
            <Button variant="destructive" disabled={isDestroying} onClick={handleDestroy}>
              <Trash2 className="mr-2 h-4 w-4" />
              {isDestroying ? 'Destroying...' : 'Destroy Workspace'}
            </Button>
          </section>
        </div>
      )}

      {activeTab === 'shares' && (
        <div className="space-y-4">
          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Public Canvas Shares</h2>
                <p className="text-xs text-muted-foreground">Active public canvas links for this workspace.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => loadShares()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
            {shares.length === 0 ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">No public canvas shares. Good.</div>
            ) : shares.map(share => {
              const url = `${window.location.origin}${share.url}`
              return (
                <div key={share.code} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm">{share.path}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{share.treeName} / {share.treeType} - created {new Date(share.createdAt).toLocaleString()}</div>
                      {share.lockedBy?.length > 0 && (
                        <div className="mt-1 text-[11px] text-muted-foreground">locks: {share.lockedBy.join(', ')}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => copyShareUrl(share)}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => window.open(url, '_blank', 'noreferrer')}><ExternalLink className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="outline" size="sm" disabled={busyAction === `share:${share.code}`} onClick={() => revokeShare(share)} className="text-destructive hover:text-destructive"><Unlink className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="mt-2 truncate rounded bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground">{url}</div>
                </div>
              )
            })}
          </section>

          <section className="rounded-lg border p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Workspace ACL Tokens</h2>
              <p className="text-xs text-muted-foreground">Generate token-based workspace access for devices, scripts, and other users.</p>
            </div>
            <TokenManager workspaceId={workspaceId} />
          </section>
        </div>
      )}

      {activeTab === 'data' && (
        <div className="space-y-3">
          {Object.entries(dataBackends).map(([backendId, backend]) => {
            const copy = DATA_BACKEND_LABELS[backendId] || { title: backendId, description: 'Workspace data backend.' }
            const canToggle = backend.supported !== false && backendId !== 'stored.cache'
            return (
              <section key={backendId} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold">{copy.title}</h2>
                      {backend.supported === false && <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">unsupported</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
                    {backend.root && <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{backend.root}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>running: {backend.running ? 'true' : 'false'}</span>
                      <span>watching: {backend.watching ? 'true' : 'false'}</span>
                      <span>incoming: {backend.indexIncoming ? 'true' : 'false'}</span>
                      {backend.lastScanAt && <span>last scan: {new Date(backend.lastScanAt).toLocaleString()}</span>}
                    </div>
                    {backend.lastError && <p className="mt-2 text-xs text-destructive">{backend.lastError}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {backend.driver === 'file' && canToggle && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        watch
                        <Toggle
                          checked={!!backend.watch}
                          disabled={!backend.enabled || busyAction === `watch:${backendId}`}
                          onClick={() => patchDataBackend(backendId, { watch: !backend.watch }, 'watch')}
                        />
                      </label>
                    )}
                    {backend.indexIncoming !== undefined && canToggle && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        incoming
                        <Toggle
                          checked={!!backend.indexIncoming}
                          disabled={!backend.enabled || busyAction === `incoming:${backendId}`}
                          onClick={() => patchDataBackend(backendId, { indexIncoming: !backend.indexIncoming }, 'incoming')}
                        />
                      </label>
                    )}
                    {backend.resync && (
                      <Button type="button" variant="outline" size="sm" disabled={busyAction === `resync:${backendId}`} onClick={() => resyncBackend(backendId)}>
                        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busyAction === `resync:${backendId}` ? 'animate-spin' : ''}`} />
                        Re-sync
                      </Button>
                    )}
                    <Toggle checked={!!backend.enabled} disabled={!canToggle || busyAction === `backend:${backendId}`} onClick={() => toggleDataBackend(backendId)} />
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="space-y-3">
            {SERVICE_ITEMS.map(service => {
              const status = services?.[service.id] || services?.[service.id === 'git' ? 'dotfiles' : service.id === 'webdav' ? 'home' : 'imap']
              const enabled = !!status?.enabled
              return (
                <section key={service.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-semibold">{service.title}</h2>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{service.description}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">initialized: {status?.initialized ? 'true' : 'false'}</p>
                    </div>
                    <Toggle checked={enabled} disabled={busyAction === `service:${service.id}`} onClick={() => toggleService(service.id, enabled)} />
                  </div>
                </section>
              )
            })}
          </div>

          <section className="rounded-lg border p-4">
            <ImapMailboxesPanel workspaceId={workspaceId} enabled={!!(services?.imap?.enabled || services?.imapSync?.enabled)} />
          </section>
        </div>
      )}

      {activeTab === 'hooks' && (
        <section className="rounded-lg border p-4">
          <HooksPanel workspaceId={workspaceId} />
        </section>
      )}
      </div>
    </div>
  )
}

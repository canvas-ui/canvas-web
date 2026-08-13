import { useMenu } from '@/components/shell/menu-context'
import { useIsMobile } from '@/hooks/use-mobile'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, Database, ExternalLink, FolderPlus, HardDrive, RefreshCw, Server, Square, Trash2, Unlink, Activity, Monitor, Link2, Check, X as XIcon, Pencil } from 'lucide-react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LayerIconPicker } from '@/components/menu/shared/LayerIconPicker'
import { DEFAULT_WORKSPACE_ICON, getBackendStyle, type LayerStyle } from '@/lib/layer-style'
import { DefaultFoldersPicker, createDefaultFolders, useFolderSelection } from '@/components/workspaces/DefaultFoldersPicker'
import { adminReindexTimelines, adminReindexSearch, adminOptimize, adminReindexMime } from '@/services/admin'
import { PageHeader } from '@/components/common/page-header'
import { WORKSPACE_SETTINGS_SECTIONS, resolveWorkspaceSettingsTab, type WorkspaceSettingsTab } from '@/lib/settings-sections'
import { InferdSettingsPanel } from '@/components/workspace/inferd-settings-panel'
import { HooksPanel } from '@/components/workspace/hooks-panel'
import { TrashPanel } from '@/components/workspace/trash-panel'
import { ImapMailboxesPanel } from '@/components/workspace/imap-mailboxes-panel'
import { TokenManager } from '@/components/workspace/token-manager'
import { useToast } from '@/components/ui/toast-container'
import { isQueryDebugEnabled, setQueryDebugEnabled } from '@/lib/query-debug'
import { generateNiceRandomHexColor, visibleAccentColor } from '@/utils/color'
import {
  disableWorkspaceService,
  enableWorkspaceService,
  listBackends,
  addBackend,
  removeBackend,
  updateBackend,
  syncBackend,
  cancelBackendSync,
  getWorkspaceDbStats,
  setWorkspaceSearchTuning,
  getWorkspaceServicesStatus,
  listWorkspaceShares,
  listWorkspaces,
  removeWorkspace,
  revokeWorkspacePublicCanvasShare,
  updateWorkspace,
  getBackendDiskUsage,
  getWorkspaceDiskUsage,
  clearThumbnailCache,
  invalidateWorkspaceTreeCache,
  formatBytes,
  type Backend,
  type BackendDiskUsage,
  type WorkspaceDiskUsage,
  type WorkspaceDbStats,
  type WorkspacePublicCanvasShare,
  type WorkspaceServicesStatus,
} from '@/services/workspace'
import {
  listDevices,
  listWorkspaceDevices,
  linkWorkspaceDevice,
  unlinkWorkspaceDevice,
  updateDevice,
  type Device,
  type WorkspaceDevice,
} from '@/services/devices'

type SettingsTab = WorkspaceSettingsTab
type ServiceId = 'dotfiles' | 'git' | 'home' | 'webdav' | 'imap' | 'imapSync'

const DATA_BACKEND_LABELS: Record<string, { title: string; description: string }> = {
  'workspace:home': {
    title: 'Workspace Home',
    description: 'User-managed roaming home folder, exported through WebDAV and watched for changes. Mirrored into the backends tree.',
  },
  'workspace:data': {
    title: 'Workspace Data',
    description: 'Managed content-addressable blob store (deduped, checksum-keyed). Opaque by design — the tree is the navigation; not meant for direct edits or export.',
  },
  s3: {
    title: 'S3',
    description: 'Remote object storage. Placeholder until Stored gets a real S3 driver.',
  },
  imap: {
    title: 'IMAP',
    description: 'Mailbox data source; ingested mail lands in the backends tree.',
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

// Mount an arbitrary server-local folder as an fs data backend. The name is
// the human handle (its slug becomes the backend address and the
// /device/<device>/<mount> node in the backends tree); the path must be an
// absolute, readable directory on the server host.
function AddLocalFolderForm({ workspaceId, onAdded }: { workspaceId: string; onAdded: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [watch, setWatch] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  const reset = () => { setName(''); setPath(''); setWatch(false); setReadOnly(false) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !path.trim()) return
    setBusy(true)
    try {
      await addBackend(workspaceId, 'file', { name: name.trim(), path: path.trim(), watch, readOnly })
      showToast({ title: 'Added', description: `${name.trim()} mounted — initial scan running in the background` })
      reset()
      setOpen(false)
      await onAdded()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to add folder backend', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderPlus className="mr-2 h-3.5 w-3.5" />
        Add local folder
      </Button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <FolderPlus className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Add local folder</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Index a folder on the server host as a data source. Files stay in place; the index records them as
        device-scoped locations, so they remain addressable if the workspace moves to another server.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Financial Reports" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Absolute path on server</label>
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/mnt/data/reports" required className="font-mono" />
        </div>
      </div>
      <div className="flex items-center gap-6 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1.5">
          watch
          <Toggle checked={watch} onClick={() => setWatch((v) => !v)} />
        </label>
        <label className="flex items-center gap-1.5" title="Never delete bytes in this folder — Destroy degrades to a reference drop. Recommended for folders managed outside Canvas.">
          read-only
          <Toggle checked={readOnly} onClick={() => setReadOnly((v) => !v)} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !name.trim() || !path.trim()}>
          {busy ? 'Adding…' : 'Add folder'}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { reset(); setOpen(false) }}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// On-demand on-disk size for a local backend. Never computed automatically —
// the server walks the whole backend root (slow on a large home dir).
function BackendSizeButton({ workspaceId, backend }: { workspaceId: string; backend: Backend }) {
  const [usage, setUsage] = useState<BackendDiskUsage | null>(backend.usage ?? null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  const compute = async () => {
    setBusy(true)
    try {
      setUsage(await getBackendDiskUsage(workspaceId, backend.driver, backend.address))
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to compute size', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={compute}
      disabled={busy}
      className="flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      title={usage ? `Computed ${new Date(usage.computedAt).toLocaleString()} — click to refresh` : 'Compute on-disk size (walks the backend folder — may take a while)'}
    >
      <HardDrive className={`h-3 w-3 ${busy ? 'animate-pulse' : ''}`} />
      {busy ? 'Calculating…' : usage ? formatBytes(usage.bytes) : 'Size'}
    </button>
  )
}

// Wipe the on-demand thumbnail cache (thumb:* entries in the stored cache).
// Thumbnails are derived artifacts regenerated on demand — always safe.
function ClearThumbnailsButton({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  const clear = async () => {
    setBusy(true)
    try {
      const { removed } = await clearThumbnailCache(workspaceId)
      showToast({ title: 'Thumbnail cache cleared', description: `${removed} cached thumbnail(s) removed` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to clear thumbnail cache', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={clear} title="Remove all cached thumbnails — they regenerate on demand">
      <Trash2 className={`mr-2 h-3.5 w-3.5 ${busy ? 'animate-pulse' : ''}`} />
      {busy ? 'Clearing…' : 'Clear thumbnails'}
    </Button>
  )
}

// On-demand on-disk size of the whole workspace root with a per-directory
// breakdown — the number a future export/sync needs to plan around.
function WorkspaceUsageSection({ workspaceId }: { workspaceId: string }) {
  const [usage, setUsage] = useState<WorkspaceDiskUsage | null>(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  const compute = async () => {
    setBusy(true)
    try {
      setUsage(await getWorkspaceDiskUsage(workspaceId))
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to compute workspace size', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Disk usage</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Total on-disk size of this workspace (index, blobs, home, cache) — what an export or sync would move.
            Computed on demand; may take a while on large workspaces.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {usage && <span className="text-sm font-semibold">{formatBytes(usage.bytes)}</span>}
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={compute}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Calculating…' : usage ? 'Recalculate' : 'Calculate size'}
          </Button>
        </div>
      </div>
      {usage && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t pt-3 sm:grid-cols-3">
          {Object.entries(usage.breakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([dir, bytes]) => (
              <div key={dir} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-mono text-muted-foreground">{dir}</span>
                <span>{formatBytes(bytes)}</span>
              </div>
            ))}
        </div>
      )}
    </section>
  )
}

// Per-backend sync exclusions (glob patterns) for enumerable file backends.
// Server-side defaults (dotfiles, node_modules, __pycache__, caches, …) always
// apply; the user list here is merged on top. Patterns apply to the live
// watcher immediately and to list/scan on the next re-sync (which also unlinks
// already-mirrored entries that are now excluded — blobs untouched).
function BackendExclusionsEditor({
  backend,
  busy,
  onSave,
}: {
  backend: Backend
  busy: boolean
  onSave: (patterns: string[]) => void | Promise<void>
}) {
  const cfg = (backend.config || {}) as Record<string, unknown>
  const userPatterns = Array.isArray(cfg.exclude) ? (cfg.exclude as string[]) : []
  const effective = Array.isArray(cfg.effectiveExclusions) ? (cfg.effectiveExclusions as string[]) : []
  const defaultCount = Math.max(effective.length - userPatterns.length, 0)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(userPatterns.join('\n'))
  const [showDefaults, setShowDefaults] = useState(false)

  // Re-seed the draft when the backend's saved patterns change (state
  // adjustment during render, not an effect).
  const userPatternsKey = userPatterns.join('\n')
  const [prevUserPatternsKey, setPrevUserPatternsKey] = useState(userPatternsKey)
  if (prevUserPatternsKey !== userPatternsKey) {
    setPrevUserPatternsKey(userPatternsKey)
    setDraft(userPatternsKey)
  }

  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        Sync exclusions {userPatterns.length > 0 ? `(${userPatterns.length} custom` : `(defaults only`}{defaultCount > 0 ? `, ${defaultCount} default)` : ')'} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            One glob pattern per line, e.g. <code className="font-mono">**/node_modules/**</code> or <code className="font-mono">**/target/**</code>.
            Defaults (dotfiles, node_modules, __pycache__, caches, …) always apply. Changes take effect immediately for
            the watcher; run Re-sync to also unlink already-mirrored entries.
          </p>
          <textarea
            className="w-full min-h-[80px] rounded-md border bg-background p-2 font-mono text-xs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'**/node_modules/**\n**/dist/**'}
            spellCheck={false}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || draft.split('\n').map(s => s.trim()).filter(Boolean).join('\n') === userPatterns.join('\n')}
              onClick={() => onSave(draft.split('\n').map(s => s.trim()).filter(Boolean))}
            >
              Save exclusions
            </Button>
            {defaultCount > 0 && (
              <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setShowDefaults(!showDefaults)}>
                {showDefaults ? 'Hide' : 'Show'} default patterns
              </button>
            )}
          </div>
          {showDefaults && (
            <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] text-muted-foreground">
              {effective.filter(p => !userPatterns.includes(p)).join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function DeviceRow({
  device,
  linked,
  busy,
  onLink,
  onUnlink,
  onUpdate,
}: {
  device: Device
  linked: boolean
  busy: boolean
  onLink: () => void
  onUnlink: () => void
  onUpdate: (patch: { name?: string; description?: string }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(device.name)
  const [editDesc, setEditDesc] = useState(device.description ?? '')

  const commitEdit = () => {
    if (editName.trim() && (editName !== device.name || editDesc !== (device.description ?? ''))) {
      onUpdate({ name: editName.trim(), description: editDesc.trim() || undefined })
    }
    setEditing(false)
  }

  const cancelEdit = () => {
    setEditName(device.name)
    setEditDesc(device.description ?? '')
    setEditing(false)
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Monitor className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            {editing ? (
              <div className="space-y-2">
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="h-7 text-sm"
                  placeholder="Device name"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                />
                <Input
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="h-7 text-xs"
                  placeholder="Description (optional)"
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                />
              </div>
            ) : (
              <>
                <div className="text-sm font-medium">{device.name}</div>
                {device.description && <div className="text-xs text-muted-foreground mt-0.5">{device.description}</div>}
              </>
            )}
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground font-mono">
              <span>{device.deviceId}</span>
              {device.platform && <span>{device.platform}</span>}
              {device.arch && <span>{device.arch}</span>}
              {device.type && <span>{device.type}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={commitEdit} disabled={!editName.trim()}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} title="Edit name/description">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {linked ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onUnlink}
              className="text-destructive hover:text-destructive"
              title="Remove from workspace"
            >
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onLink}
              title="Link to workspace"
            >
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {linked && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">linked</span>
          )}
        </div>
      </div>
    </section>
  )
}

function DevicesTab({
  allDevices,
  linkedDevices,
  isLoading,
  deviceBusy,
  onRefresh,
  onLink,
  onUnlink,
  onUpdate,
}: {
  allDevices: Device[]
  linkedDevices: WorkspaceDevice[]
  isLoading: boolean
  deviceBusy: string | null
  onRefresh: () => void
  onLink: (deviceId: string) => void
  onUnlink: (deviceId: string) => void
  onUpdate: (deviceId: string, patch: { name?: string; description?: string }) => void
}) {
  const linkedIds = new Set(linkedDevices.map(d => d.deviceId))

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading devices…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {linkedIds.size} of {allDevices.length} registered device{allDevices.length !== 1 ? 's' : ''} linked to this workspace.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {allDevices.length === 0 ? (
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          No devices registered. Devices register themselves on first connection via <span className="font-mono">POST /auth/devices/register</span>.
        </div>
      ) : (
        <div className="space-y-2">
          {allDevices.map(device => (
            <DeviceRow
              key={device.deviceId}
              device={device}
              linked={linkedIds.has(device.deviceId)}
              busy={deviceBusy === device.deviceId}
              onLink={() => onLink(device.deviceId)}
              onUnlink={() => onUnlink(device.deviceId)}
              onUpdate={(patch) => onUpdate(device.deviceId, patch)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StatRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-right ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  )
}

// Live search tuning (applied without restart, persisted to workspace.json):
// - Image relevance floor: cosine distance cap (0=identical, smaller=stricter).
//   Lower it if unrelated photos leak into results; raise it if relevant photos
//   are missing. Empty = no floor (legacy top-K).
// - Fusion weights: how much each signal counts in hybrid ranking (RRF).
//   fts = lexical (filenames/content), dense = text semantics, image = photo
//   matches. Equal fts/image treats a matching photo like a matching document.
function SearchTuning({ workspaceName, current, weights, floorMode: initialFloorMode, relativeMargin, onDone }: {
  workspaceName: string
  current: number | null | undefined
  weights: { fts?: number; dense?: number; image?: number } | undefined
  floorMode: 'relative' | 'absolute' | undefined
  relativeMargin: number | undefined
  onDone: () => void
}) {
  const [value, setValue] = useState<string>(current == null ? '' : String(current))
  const [floorMode, setFloorMode] = useState<'relative' | 'absolute'>(initialFloorMode ?? 'relative')
  const [margin, setMargin] = useState<string>(relativeMargin == null ? '0.035' : String(relativeMargin))
  const [wFts, setWFts] = useState<string>(weights?.fts == null ? '2' : String(weights.fts))
  const [wDense, setWDense] = useState<string>(weights?.dense == null ? '1' : String(weights.dense))
  const [wImage, setWImage] = useState<string>(weights?.image == null ? '2' : String(weights.image))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [debugQueries, setDebugQueries] = useState(isQueryDebugEnabled)
  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const trimmed = value.trim()
      const imageMaxDistance = trimmed === '' ? null : Number(trimmed)
      if (imageMaxDistance !== null && !Number.isFinite(imageMaxDistance)) { setMessage('Enter a number (e.g. 0.95) or leave empty'); return }
      const parsedWeights = { fts: Number(wFts), dense: Number(wDense), image: Number(wImage) }
      if (Object.values(parsedWeights).some((v) => !Number.isFinite(v) || v < 0)) { setMessage('Weights must be numbers ≥ 0'); return }
      const parsedMargin = Number(margin.trim())
      if (floorMode === 'relative' && (!Number.isFinite(parsedMargin) || parsedMargin <= 0)) {
        setMessage('Window width must be a positive number (e.g. 0.035)'); return
      }
      await setWorkspaceSearchTuning(workspaceName, {
        imageMaxDistance,
        imageFloorMode: floorMode,
        ...(floorMode === 'relative' ? { imageRelativeMargin: parsedMargin } : {}),
        searchWeights: parsedWeights,
      })
      setMessage('Saved')
      onDone()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">How photo relevance is decided</label>
        <select
          value={floorMode}
          onChange={(e) => setFloorMode(e.target.value as 'relative' | 'absolute')}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
        >
          <option value="relative">Relative to the best match (recommended)</option>
          <option value="absolute">Absolute distance cutoff</option>
        </select>
        <p className="text-[11px] text-muted-foreground">
          Photo-vs-text distances shift with every query and every model, so one fixed cutoff
          travels badly — a value tuned for one model keeps everything (or nothing) on the next.
          Relative anchors on the best match for THIS query and survives a re-embed.
        </p>
      </div>
      {floorMode === 'relative' && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Window width (distance from the best match)</label>
          <Input value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="0.035" className="h-8 w-28 font-mono text-xs" inputMode="decimal" />
          <p className="text-[11px] text-muted-foreground">
            Wider keeps photos that match your query only partly — which is what a photo matching
            TWO things (a snowy window) looks like, since it sits further from each one than a pure
            example does. Too wide and everything gets in.
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">
          {floorMode === 'relative' ? 'Hard ceiling (cosine distance, 0–2; blank = off)' : 'Image relevance floor (cosine distance, 0–2; blank = off)'}
        </label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.95" className="h-8 w-28 font-mono text-xs" inputMode="decimal" />
        <p className="text-[11px] text-muted-foreground">
          {floorMode === 'relative'
            ? 'Nothing beyond this counts as a match however close it is to the best one. This is what lets a search of something you have no photos of come back empty — without it, a relative window always returns its nearest photo.'
            : 'Lower = stricter (fewer, more-relevant photos); raise if relevant photos are missing.'}
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Hybrid fusion weights (0 disables a signal)</label>
        {/* Three labelled numbers side by side overflowed a phone card, clipping
            the last one. Stack the label over the field and let them wrap. */}
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          {([['lexical', wFts, setWFts], ['text semantic', wDense, setWDense], ['image', wImage, setWImage]] as const).map(([label, v, set]) => (
            <div key={label} className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">{label}</span>
              <Input value={v} onChange={(e) => set(e.target.value)} className="h-8 w-16 font-mono text-xs" inputMode="decimal" />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Ranking mix: lexical (filenames/content) · text semantics · photo matches. Equal lexical/image ranks a matching photo like a matching document.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>
      <div className="space-y-1.5 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={debugQueries}
            onChange={(e) => { setQueryDebugEnabled(e.target.checked); setDebugQueries(e.target.checked) }}
          />
          <span>Debug query</span>
        </label>
        <p className="text-[11px] text-muted-foreground">
          Attaches the raw (unfloored) image distances to each search and shows them above the
          document list — the numbers this floor should be picked from. Local to this browser;
          costs a little extra work per query, so leave it off day to day.
        </p>
      </div>
    </div>
  )
}

// This workspace's inferd queue readout + pause/resume. Each workspace owns its
// own queue, so the pending count is genuinely this workspace's work and pausing
// leaves the others draining. Pausing quiets the CPU-heavy inference after the
// in-flight batch — the escape hatch while a big photo mount indexes. Enqueues
// keep accumulating; nothing is lost, and the durable gap ledger re-drives
// anything missed after a restart.
function DbStatsTab({
  stats,
  isLoading,
  onRefresh,
  workspaceName,
}: {
  stats: WorkspaceDbStats | null
  isLoading: boolean
  onRefresh: () => void
  workspaceName: string
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading stats…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Live snapshot from synapsd. Click refresh for updated counts.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <ReindexSection
        workspaceName={workspaceName}
        vectorSpaces={Object.keys(stats?.semantic?.vectorSpaces || {})}
        onDone={onRefresh}
      />

      {!stats ? (
        <div className="rounded-md border p-4 text-sm text-muted-foreground">No stats available.</div>
      ) : (
        <>
          <section className="rounded-lg border p-4">
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Core Index</h2>
            </div>
            <StatRow label="Backend" value={stats.dbBackend} mono />
            <StatRow label="Status" value={stats.status} />
            <StatRow label="Path" value={stats.dbPath} mono />
            <StatRow label="Documents" value={stats.documentCount?.toLocaleString()} />
            <StatRow label="Metadata entries" value={stats.metadataCount?.toLocaleString()} />
            <StatRow label="Checksum index" value={stats.checksumIndexSize?.toLocaleString()} />
            <StatRow label="Bitmap store" value={stats.bitmapStoreSize?.toLocaleString()} />
            <StatRow label="Bitmap cache" value={stats.bitmapCacheSize?.toLocaleString()} />
            <StatRow label="Deleted (pending GC)" value={stats.deletedDocumentsCount?.toLocaleString()} />
          </section>

          {stats.fts && (
            <section className="rounded-lg border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Full-Text Search (LanceDB)</h2>
              </div>
              {'ready' in stats.fts && (
                <StatRow label="Ready" value={String((stats.fts as { ready?: boolean; rowCount?: number; error?: string }).ready)} />
              )}
              {(stats.fts as { ready?: boolean; rowCount?: number; error?: string }).rowCount !== undefined && (
                <StatRow label="Row count" value={(stats.fts as { ready?: boolean; rowCount?: number; error?: string }).rowCount?.toLocaleString()} />
              )}
              {(stats.fts as { ready?: boolean; rowCount?: number; error?: string }).error && (
                <StatRow label="Error" value={<span className="text-destructive">{(stats.fts as { ready?: boolean; rowCount?: number; error?: string }).error}</span>} />
              )}
            </section>
          )}

          {stats.semantic && (
            <section className="rounded-lg border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Semantic / Vector Search</h2>
              </div>
              <StatRow label="Enabled" value={String(stats.semantic.enabled)} />
              {stats.semantic.enabled && (
                <>
                  {/* What actually embeds where — from the inferd router rules
                      (server-wide, read-only for now): notes/emails + text-file
                      blobs → text; image/* → image. Falls back to synapsd's gap
                      default only if the inferd routing isn't available. */}
                  {stats.inferd?.routing
                    ? Object.entries(stats.inferd.routing).map(([space, matchers]) => (
                        <StatRow key={`route-${space}`} label={`Embeds → ${space}`} value={<span className="font-mono text-[11px]">{matchers.join(', ')}</span>} />
                      ))
                    : <StatRow label="Text-embeddable (gap default)" value={stats.semantic.embeddableSchemas?.join(', ')} />}
                  {/* Per-space STORAGE stats — row/doc counts, so a re-embed's
                      progress is visible. Which model/backend fills each space
                      (and the queue driving it) is in Embeddings, above. */}
                  {stats.semantic.vectorSpaces && Object.entries(stats.semantic.vectorSpaces).map(([name, sp]) => (
                    <StatRow
                      key={name}
                      label={`Space: ${name} (${sp.dim ?? '?'}-d)`}
                      value={sp.error
                        ? <span className="text-destructive">{sp.error}</span>
                        : `${(sp.embeddedDocs ?? 0).toLocaleString()} docs · ${(sp.chunkRows ?? 0).toLocaleString()} vectors`}
                    />
                  ))}
                  <StatRow label="Photo relevance" value={stats.semantic.imageFloorMode === 'absolute' ? 'absolute cutoff' : `relative ±${stats.semantic.imageRelativeMargin ?? 0.035}`} mono />
                  <StatRow label={stats.semantic.imageFloorMode === 'absolute' ? 'Image relevance floor' : 'Hard ceiling'} value={stats.semantic.imageMaxDistance == null ? 'off' : stats.semantic.imageMaxDistance} mono />
                  <StatRow
                    label="Fusion weights (lexical · text · image)"
                    value={`${stats.semantic.searchWeights?.fts ?? 2} · ${stats.semantic.searchWeights?.dense ?? 1} · ${stats.semantic.searchWeights?.image ?? 2}`}
                    mono
                  />
                  <SearchTuning workspaceName={workspaceName} current={stats.semantic.imageMaxDistance} weights={stats.semantic.searchWeights} floorMode={stats.semantic.imageFloorMode} relativeMargin={stats.semantic.imageRelativeMargin} onDone={onRefresh} />
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default function WorkspaceSettingsPage() {
  const { workspaceName, tab } = useParams<{ workspaceName: string; tab?: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  // Tab is URL-driven (/workspaces/:name/settings/:tab); bare or invalid tab
  // segments normalize to /settings/general below.
  // Bare, invalid and retired tab segments (embedding, trash) normalize to the
  // section that now owns them.
  const isMobile = useIsMobile()
  const { openM2Drawer } = useMenu()
  const activeTab: SettingsTab = resolveWorkspaceSettingsTab(tab)
  useEffect(() => {
    if (tab !== activeTab) navigate(`/workspaces/${workspaceName}/settings/${activeTab}`, { replace: true })
  }, [tab, activeTab, workspaceName, navigate])
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDestroying, setIsDestroying] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#FFFFFF')
  const [icon, setIcon] = useState<string | null>(null)
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null)
  const [shares, setShares] = useState<WorkspacePublicCanvasShare[]>([])
  const [services, setServices] = useState<WorkspaceServicesStatus | null>(null)
  const [dataBackends, setDataBackends] = useState<Backend[]>([])
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [dbStats, setDbStats] = useState<WorkspaceDbStats | null>(null)
  const [isLoadingDbStats, setIsLoadingDbStats] = useState(false)
  const [allDevices, setAllDevices] = useState<Device[]>([])
  const [linkedDevices, setLinkedDevices] = useState<WorkspaceDevice[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [deviceBusy, setDeviceBusy] = useState<string | null>(null)

  const workspaceId = workspace?.name || workspaceName || ''
  // Latest id for the loaders below: keeping them identity-stable (deps only on
  // the stable showToast) lets effects depend on them without re-running when
  // the workspace object loads.
  const workspaceIdRef = useRef(workspaceId)
  useEffect(() => { workspaceIdRef.current = workspaceId })

  const loadShares = useCallback(async (id?: string) => {
    const target = id ?? workspaceIdRef.current
    if (!target) return
    try {
      const result = await listWorkspaceShares(target)
      setShares(result.publicCanvasShares)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load shares', variant: 'destructive' })
    }
  }, [showToast])

  const loadDbStats = useCallback(async (id?: string) => {
    const target = id ?? workspaceIdRef.current
    if (!target) return
    setIsLoadingDbStats(true)
    try {
      const stats = await getWorkspaceDbStats(target)
      setDbStats(stats)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load DB stats', variant: 'destructive' })
    } finally {
      setIsLoadingDbStats(false)
    }
  }, [showToast])

  const loadDevices = useCallback(async (id?: string) => {
    const target = id ?? workspaceIdRef.current
    if (!target) return
    setIsLoadingDevices(true)
    try {
      const [all, linked] = await Promise.all([listDevices(), listWorkspaceDevices(target)])
      setAllDevices(all)
      setLinkedDevices(linked)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load devices', variant: 'destructive' })
    } finally {
      setIsLoadingDevices(false)
    }
  }, [showToast])

  const handleLinkDevice = async (deviceId: string) => {
    setDeviceBusy(deviceId)
    try {
      await linkWorkspaceDevice(workspaceId, deviceId)
      await loadDevices()
      showToast({ title: 'Linked', description: `Device linked to workspace` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to link device', variant: 'destructive' })
    } finally {
      setDeviceBusy(null)
    }
  }

  const handleUnlinkDevice = async (deviceId: string) => {
    setDeviceBusy(deviceId)
    try {
      await unlinkWorkspaceDevice(workspaceId, deviceId)
      setLinkedDevices(prev => prev.filter(d => d.deviceId !== deviceId))
      showToast({ title: 'Unlinked', description: `Device removed from workspace` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to unlink device', variant: 'destructive' })
    } finally {
      setDeviceBusy(null)
    }
  }

  const handleUpdateDevice = async (deviceId: string, patch: { name?: string; description?: string }) => {
    setDeviceBusy(`edit:${deviceId}`)
    try {
      const updated = await updateDevice(deviceId, patch)
      setAllDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, ...updated } : d))
      showToast({ title: 'Saved', description: 'Device updated' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update device', variant: 'destructive' })
    } finally {
      setDeviceBusy(null)
    }
  }

  const loadRuntimeSettings = useCallback(async (id?: string) => {
    const target = id ?? workspaceIdRef.current
    if (!target) return
    const [nextServices, nextBackends] = await Promise.all([
      getWorkspaceServicesStatus(target).catch(() => null),
      listBackends(target).catch(() => [] as Backend[]),
    ])
    setServices(nextServices)
    // The Data tab manages storage backends; imap accounts have their own panel.
    setDataBackends(nextBackends.filter((b) => b.kind === 'storage'))
  }, [])

  // Keep the "indexing m / n" readout live while any backend scan is running.
  const anyResyncing = dataBackends.some((b) => b.resyncing)
  useEffect(() => {
    if (!anyResyncing || !workspaceId) return
    const timer = setInterval(() => { loadRuntimeSettings() }, 4000)
    return () => clearInterval(timer)
  }, [anyResyncing, workspaceId, loadRuntimeSettings])

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
          setIcon(ws.icon ?? null)
          await Promise.all([loadShares(ws.name), loadRuntimeSettings(ws.name)])
        }
      } catch {
        showToast({ title: 'Error', description: 'Failed to load workspace', variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [workspaceName, loadShares, loadRuntimeSettings, showToast])

  // Mirror "already loaded / in flight" into refs so the lazy tab loader below
  // keeps its run-once-per-visit semantics without depending on the very state
  // its fetches mutate (which would retrigger it).
  const dbTabSatisfiedRef = useRef(false)
  const devicesTabSatisfiedRef = useRef(false)
  useEffect(() => {
    dbTabSatisfiedRef.current = Boolean(dbStats) || isLoadingDbStats
    devicesTabSatisfiedRef.current = isLoadingDevices || allDevices.length > 0
  })

  useEffect(() => {
    if (activeTab === 'db' && workspaceId && !dbTabSatisfiedRef.current) {
      loadDbStats()
    }
    if (activeTab === 'devices' && workspaceId && !devicesTabSatisfiedRef.current) {
      loadDevices()
    }
  }, [activeTab, workspaceId, loadDbStats, loadDevices])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspace) return
    setIsSaving(true)
    try {
      await updateWorkspace(workspace.name, { label: label.trim(), description: description.trim(), color, icon })
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

  // Backend mutations change the backends tree (mount nodes come and go) but
  // the menu tree caches per workspace — drop the cache and poke any mounted
  // tree view so the change shows without a manual reload.
  const refreshBackendsTree = () => {
    for (const id of [workspaceName, workspace?.name, workspace?.id]) {
      if (id) invalidateWorkspaceTreeCache(id, 'backends')
    }
    window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName: workspace?.name || workspaceName } }))
  }

  const toggleDataBackend = async (backend: Backend) => {
    if (backend.config?.supported === false) return
    setBusyAction(`backend:${backend.address}`)
    try {
      await updateBackend(workspaceId, backend.driver, backend.address, { enabled: !backend.enabled })
      await loadRuntimeSettings()
      refreshBackendsTree()
      showToast({ title: 'Saved', description: `${backend.address} ${backend.enabled ? 'disabled' : 'enabled'}` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update backend', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  const patchDataBackend = async (backend: Backend, patch: Record<string, unknown>, action: string) => {
    setBusyAction(`${action}:${backend.address}`)
    try {
      await updateBackend(workspaceId, backend.driver, backend.address, patch)
      await loadRuntimeSettings()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update backend', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  const removeDataBackend = async (backend: Backend) => {
    const label = (typeof backend.config?.label === 'string' && backend.config.label) || backend.address
    if (!window.confirm(`Remove backend "${label}"? No files are deleted; indexed entries remain until purged from the backends tree.`)) return
    setBusyAction(`remove:${backend.address}`)
    try {
      await removeBackend(workspaceId, backend.driver, backend.address)
      await loadRuntimeSettings()
      refreshBackendsTree()
      showToast({ title: 'Removed', description: `${label} unmounted` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to remove backend', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  const resyncBackend = async (backend: Backend) => {
    setBusyAction(`resync:${backend.address}`)
    try {
      await syncBackend(workspaceId, backend.driver, backend.address)
      await loadRuntimeSettings()
      showToast({ title: 'Re-syncing', description: `${backend.address} scan started` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Re-sync failed', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  // Stop an in-flight resync. Indexed files stay; a later Re-sync resumes
  // cheaply via the checksum cache, so stop + re-sync ≈ pause/resume.
  const stopResync = async (backend: Backend) => {
    setBusyAction(`stopsync:${backend.address}`)
    try {
      await cancelBackendSync(workspaceId, backend.driver, backend.address)
      await loadRuntimeSettings()
      showToast({ title: 'Sync stopped', description: `${backend.address} — indexed files are kept; Re-sync resumes where it left off` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to stop sync', variant: 'destructive' })
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

  const section = WORKSPACE_SETTINGS_SECTIONS.find(sec => sec.id === activeTab)!

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  if (!workspace) return <div className="p-6 text-sm text-muted-foreground">Workspace not found</div>

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl p-6 pb-12 max-md:px-4 max-md:pb-rail-stack">
      {/* One section at a time — the section list lives in M2, so this page
          never grows a tab strip. */}
      <PageHeader
        compact
        className="mb-6 border-b pb-4"
        title={`${section.label} - ${workspace.label || workspace.name}`}
        description={activeTab === 'general' ? workspace.rootPath : section.description}
        backTo={`/workspaces/${workspaceName}`}
        // Mobile has no room for the M2 panel beside the content, so Back
        // reopens it at the section list rather than leaving settings — the
        // step the tab strip used to stand in for. On desktop M2 is already
        // visible, so Back means "leave settings".
        onBack={isMobile ? () => openM2Drawer('workspaces', 'settings', workspaceName ?? null) : undefined}
      />

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
              <label className="text-sm font-medium">Icon &amp; color</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Pick icon &amp; color"
                  onClick={(e) => setPickerPos({ x: Math.min(e.clientX, window.innerWidth - 290), y: Math.min(e.clientY, window.innerHeight - 360) })}
                  className="flex h-10 w-10 items-center justify-center rounded-md border hover:bg-accent"
                >
                  <Icon icon={icon || DEFAULT_WORKSPACE_ICON} width={22} height={22} color={visibleAccentColor(color)} />
                </button>
                <Input id="ws-color" type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-16 p-1" />
                <Button type="button" variant="outline" size="sm" onClick={() => setColor(generateNiceRandomHexColor())}>Randomize</Button>
              </div>
            </div>
            <Button type="submit" disabled={isSaving || !label.trim()}>{isSaving ? 'Saving...' : 'Save Changes'}</Button>
          </form>

          {pickerPos && (
            <LayerIconPicker
              x={pickerPos.x}
              y={pickerPos.y}
              current={{ icon: icon ?? undefined, color }}
              onChange={(change: LayerStyle) => {
                if ('icon' in change) setIcon(change.icon ?? null)
                if ('color' in change && change.color) setColor(change.color)
              }}
              onClose={() => setPickerPos(null)}
            />
          )}

          <DefaultFoldersSection workspaceName={workspaceName!} />

          <WorkspaceUsageSection workspaceId={workspaceId} />

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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
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
          {dataBackends.map((backend) => {
            const cfg = (backend.config || {}) as Record<string, unknown>
            const backendId = backend.address
            const device = (cfg.device || null) as { id?: string; name?: string } | null
            // User-added local-folder mount: labelled, device-scoped, removable.
            const isUserMount = backend.driver === 'file' && cfg.managed !== true && !DATA_BACKEND_LABELS[backendId]
            const copy = DATA_BACKEND_LABELS[backendId] || {
              title: (typeof cfg.label === 'string' && cfg.label) || backendId,
              description: isUserMount
                ? `Local folder${device?.name ? ` on ${device.name}` : ''}, indexed in place${backend.treePath ? ` and mirrored at ${backend.treePath}` : ''}.`
                : 'Workspace data backend.',
            }
            const supported = cfg.supported !== false
            // Structural local store: workspace:data (managed blob target) can
            // never be disabled; as a managed, non-exported store the
            // read-only knob doesn't apply to it either.
            const alwaysOn = backendId === 'workspace:data'
            const canToggle = supported && !alwaysOn
            const hasReadOnly = canToggle && cfg.managed !== true
            // Distinct default glyph per store/driver (workspace:home → house,
            // workspace:data → database, mounts → folder, …) so the built-in
            // stores don't all read as the same database icon.
            const style = getBackendStyle(backend)
            return (
              <section key={backendId} className="rounded-lg border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon icon={style.icon} width={16} height={16} color={style.color} className="shrink-0" />
                      <h2 className="text-sm font-semibold">{copy.title}</h2>
                      {!supported && <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">unsupported</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
                    {typeof cfg.root === 'string' && cfg.root && <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{cfg.root}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>status: {backend.status}</span>
                      {backend.resyncing && (
                        <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          indexing{backend.progress ? ` ${backend.progress.scanned}${backend.progress.total != null ? ` / ${backend.progress.total}` : ''}` : ''}
                        </span>
                      )}
                      <span>watch: {cfg.watch ? 'true' : 'false'}</span>
                      {device?.name && <span title={device.id}>device: {device.name}</span>}
                      {cfg.readOnly === true && <span className="rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning">read-only</span>}
                      {backend.lastSyncAt && <span>last scan: {new Date(backend.lastSyncAt).toLocaleString()}</span>}
                    </div>
                    {backend.lastError && <p className="mt-2 text-xs text-destructive">{backend.lastError}</p>}
                    {cfg.readOnly === true && (
                      <p className="mt-1 text-[11px] text-warning">
                        Read-only: the web UI / REST API never deletes bytes on this backend — Destroy degrades to a reference drop.
                        Recommended when the folder is exported elsewhere (e.g. via Samba).
                      </p>
                    )}
                  </div>
                  {/* Two toggles and up to two buttons — on a phone they wrap
                      onto their own lines rather than crushing the title. */}
                  <div className="flex shrink-0 items-center gap-3 max-sm:w-full max-sm:flex-wrap">
                    {backend.driver === 'file' && canToggle && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        watch
                        <Toggle
                          checked={!!cfg.watch}
                          disabled={!backend.enabled || busyAction === `watch:${backendId}`}
                          onClick={() => patchDataBackend(backend, { watch: !cfg.watch }, 'watch')}
                        />
                      </label>
                    )}
                    {hasReadOnly && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Read-only: Destroy never deletes bytes on this backend (references are dropped instead). Important when the folder is exported via Samba or shared otherwise.">
                        read-only
                        <Toggle
                          checked={cfg.readOnly === true}
                          disabled={busyAction === `readonly:${backendId}`}
                          onClick={() => patchDataBackend(backend, { readOnly: cfg.readOnly !== true }, 'readonly')}
                        />
                      </label>
                    )}
                    {(backend.driver === 'file' || backend.driver === 'cacache') && supported && (
                      <BackendSizeButton workspaceId={workspaceId} backend={backend} />
                    )}
                    {backend.capabilities?.sync && (backend.resyncing ? (
                      <Button
                        type="button" variant="outline" size="sm"
                        disabled={busyAction === `stopsync:${backendId}`}
                        onClick={() => stopResync(backend)}
                        title="Stop the running scan. Files indexed so far are kept; Re-sync later resumes where it left off (unchanged files are skipped)."
                      >
                        <Square className="mr-2 h-3.5 w-3.5 fill-current" />
                        {busyAction === `stopsync:${backendId}` ? 'Stopping…' : 'Stop sync'}
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" disabled={busyAction === `resync:${backendId}`} onClick={() => resyncBackend(backend)}>
                        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busyAction === `resync:${backendId}` ? 'animate-spin' : ''}`} />
                        Re-sync
                      </Button>
                    ))}
                    {alwaysOn ? (
                      <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title="Structural workspace store — cannot be disabled">always on</span>
                    ) : (
                      <Toggle checked={!!backend.enabled} disabled={!canToggle || busyAction === `backend:${backendId}`} onClick={() => toggleDataBackend(backend)} />
                    )}
                    {isUserMount && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={busyAction === `remove:${backendId}`}
                        title="Unmount this folder (no files are deleted)"
                        onClick={() => removeDataBackend(backend)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {/* Sync exclusions only apply to enumerable/synced backends —
                    the internal cache is not synced or mirrored. */}
                {backend.driver === 'file' && supported && !alwaysOn && (
                  <BackendExclusionsEditor
                    backend={backend}
                    busy={busyAction === `exclude:${backendId}`}
                    onSave={(patterns) => patchDataBackend(backend, { exclude: patterns }, 'exclude')}
                  />
                )}
              </section>
            )
          })}
          {/* Stored cache — stored's internal working store, not a data
              backend: local copies of remote resources + derived artifacts
              (thumbnails). Rendered as its own control, not a backend row. */}
          <section className="rounded-lg border p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Icon icon="ph:lightning-fill" width={16} height={16} className="shrink-0 text-warning" />
                  <h2 className="text-sm font-semibold">Stored Cache</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Internal working store: local copies of remote resources and derived artifacts (thumbnails).
                  Regenerable — safe to clear.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 max-sm:w-full max-sm:flex-wrap">
                <ClearThumbnailsButton workspaceId={workspaceId} />
              </div>
            </div>
          </section>
          <AddLocalFolderForm workspaceId={workspaceId} onAdded={async () => { await loadRuntimeSettings(); refreshBackendsTree() }} />

          {/* Trash is where deleted documents are held before they are purged
              from these same backends — it reads as one story with them. */}
          {workspaceName && (
            <section className="border-t pt-4">
              <TrashPanel workspaceName={workspaceName} />
            </section>
          )}
        </div>
      )}

      {activeTab === 'db' && (
        <div className="space-y-8">
          {/* Embeddings lead: this is the part people come here to change.
              Index maintenance and raw counts are the rarer, mechanical half. */}
          {workspaceId && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">Embeddings</h2>
                <p className="text-xs text-muted-foreground">
                  Which model turns this workspace's content into vectors, and where those vectors live.
                </p>
              </div>
              <InferdSettingsPanel workspaceId={workspaceId} workspaceName={workspaceName!} />
            </section>
          )}
          <DbStatsTab
            stats={dbStats}
            isLoading={isLoadingDbStats}
            onRefresh={() => loadDbStats()}
            workspaceName={workspaceName!}
          />
        </div>
      )}

      {activeTab === 'devices' && (
        <DevicesTab
          allDevices={allDevices}
          linkedDevices={linkedDevices}
          isLoading={isLoadingDevices}
          deviceBusy={deviceBusy}
          onRefresh={() => loadDevices()}
          onLink={handleLinkDevice}
          onUnlink={handleUnlinkDevice}
          onUpdate={handleUpdateDevice}
        />
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

// Settings → General: create the starter folder set in this workspace.
function DefaultFoldersSection({ workspaceName }: { workspaceName: string }) {
  const { selected, setSelected, tree, setTree, toggle } = useFolderSelection()
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const create = async () => {
    setCreating(true)
    setResult(null)
    const { ok, failed } = await createDefaultFolders(workspaceName, Array.from(selected), tree)
    setCreating(false)
    setResult(failed ? `${ok} created, ${failed} failed` : `${ok} folder(s) created`)
    setSelected(new Set())
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Default folders</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Create a set of common folders with matching icons and colors.
      </p>
      <div className="mt-3">
        <DefaultFoldersPicker selected={selected} onToggle={toggle} tree={tree} onTreeChange={setTree} disabled={creating} idPrefix="settings-default-folders" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" size="sm" disabled={creating || selected.size === 0} onClick={create}>
          {creating ? 'Creating…' : `Create ${selected.size || ''} folder(s)`}
        </Button>
        {result && <span className="text-xs text-muted-foreground">{result}</span>}
      </div>
    </section>
  )
}

// ── DB maintenance (admin reindex endpoints) ─────────────────────────────────
// STORAGE-level ops only (bitmaps, FTS, Lance table compaction); every op shows
// its description inline (tooltips are useless on touch). Destructive variants
// (rebuild) sit behind a confirm. All idempotent server-side. Embedding-level
// work — backfill/re-embed, model choice, the queue — lives on the Embedding
// tab, which has the scoped reindex control.
function ReindexSection({ workspaceName, vectorSpaces, onDone }: { workspaceName: string; vectorSpaces: string[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<{ message: string }>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(key)
    setMessage(null)
    try {
      const res = await fn()
      setMessage(res.message)
      onDone()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reindex failed')
    } finally {
      setBusy(null)
    }
  }

  interface Op { key: string; label: string; description: string; confirm?: string; fn: () => Promise<{ message: string }> }
  const groups: { title: string; ops: Op[] }[] = [
    {
      title: 'Bitmaps',
      ops: [
        { key: 'timelines', label: 'Reindex timelines', description: 'Rebuild the created/updated timelines from document data.', fn: () => adminReindexTimelines(workspaceName) },
        { key: 'mime', label: 'Reindex MIME types', description: 'Rebuild the per-MIME-type presence bitmaps (data/mime/*) from stored docs — backfills blobs indexed before mime bitmaps existed.', fn: () => adminReindexMime(workspaceName) },
      ],
    },
    {
      title: 'Full-text (BM25)',
      ops: [
        { key: 'fts', label: 'Backfill', description: 'Index documents missing from the full-text table. Fast, skips already-indexed.', fn: () => adminReindexSearch(workspaceName) },
        { key: 'fts-rebuild', label: 'Rebuild', description: 'Wipe the full-text table and rebuild from scratch — use when counts drift.', confirm: 'Wipe the FTS index and rebuild it from scratch?', fn: () => adminReindexSearch(workspaceName, true) },
        { key: 'fts-optimize', label: 'Optimize', description: 'Compact fragments + prune old versions of the full-text table.', fn: () => adminOptimize(workspaceName, 'fts') },
      ],
    },
    // Lance table compaction per LIVE vector space — enumerated from what the
    // workspace actually runs, never a hardcoded pair with stale dims.
    ...(vectorSpaces.length > 0 ? [{
      title: 'Vector tables (LanceDB)',
      ops: vectorSpaces.map((space): Op => ({
        key: `${space}-optimize`,
        label: `Optimize ${space}`,
        description: `Compact fragments + prune old versions of the '${space}' vector table and rebuild its ANN index.`,
        fn: () => adminOptimize(workspaceName, space),
      })),
    }] : []),
  ]

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-1 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Index maintenance</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Runs against this workspace. Reindex operations are idempotent.</p>
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
            <div className="space-y-2">
              {group.ops.map((op) => (
                <div key={op.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-44 justify-start"
                    disabled={busy !== null}
                    onClick={() => run(op.key, op.fn, op.confirm)}
                  >
                    {busy === op.key && <RefreshCw className="mr-2 h-3 w-3 animate-spin" />}
                    {op.label}
                  </Button>
                  <span className="min-w-0 flex-1 basis-52 text-xs text-muted-foreground">{op.description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
    </section>
  )
}

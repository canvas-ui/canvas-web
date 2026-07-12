import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Database, ExternalLink, HardDrive, RefreshCw, Server, Trash2, Unlink, Activity, Monitor, Link2, Check, X as XIcon, Pencil } from 'lucide-react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LayerIconPicker } from '@/components/menu/shared/LayerIconPicker'
import { DEFAULT_WORKSPACE_ICON, type LayerStyle } from '@/lib/layer-style'
import { DefaultFoldersPicker, createDefaultFolders, useFolderSelection } from '@/components/workspaces/DefaultFoldersPicker'
import { adminReindexTimelines, adminReindexSearch, adminReindexEmbeddings, adminOptimize, adminReindexMime } from '@/services/admin'
import { HooksPanel } from '@/components/workspace/hooks-panel'
import { ImapMailboxesPanel } from '@/components/workspace/imap-mailboxes-panel'
import { TokenManager } from '@/components/workspace/token-manager'
import { useToast } from '@/components/ui/toast-container'
import { generateNiceRandomHexColor, visibleAccentColor } from '@/utils/color'
import {
  disableWorkspaceService,
  enableWorkspaceService,
  listBackends,
  updateBackend,
  syncBackend,
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

type SettingsTab = 'general' | 'data' | 'db' | 'devices' | 'services' | 'shares' | 'hooks'
const SETTINGS_TABS: readonly SettingsTab[] = ['general', 'data', 'db', 'devices', 'services', 'shares', 'hooks']
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
  'stored.cache': {
    title: 'Stored Cache',
    description: 'Internal cache: local copies of remote resources and derived artifacts (thumbnails). Regenerable — safe to clear.',
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

// Wipe the on-demand thumbnail cache (thumb:* entries in stored.cache).
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

  useEffect(() => { setDraft(userPatterns.join('\n')) }, [userPatterns.join('\n')]) // eslint-disable-line react-hooks/exhaustive-deps

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

// Image-search relevance floor: cosine distance cap (0=identical, smaller=stricter).
// Lower it if unrelated photos leak into results; raise it if relevant photos are
// missing. Empty = no floor (legacy top-K). Applied live, no restart.
function SearchTuning({ workspaceName, current, onDone }: { workspaceName: string; current: number | null | undefined; onDone: () => void }) {
  const [value, setValue] = useState<string>(current == null ? '' : String(current))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const trimmed = value.trim()
      const imageMaxDistance = trimmed === '' ? null : Number(trimmed)
      if (imageMaxDistance !== null && !Number.isFinite(imageMaxDistance)) { setMessage('Enter a number (e.g. 0.97) or leave empty'); return }
      await setWorkspaceSearchTuning(workspaceName, { imageMaxDistance })
      setMessage('Saved')
      onDone()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="mt-3 space-y-1.5">
      <label className="text-xs text-muted-foreground">Image relevance floor (cosine distance, 0–2; blank = off)</label>
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.97" className="h-8 w-28 font-mono text-xs" inputMode="decimal" />
        <Button size="sm" variant="outline" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">Lower = stricter (fewer, more-relevant photos); raise if relevant photos are missing.</p>
    </div>
  )
}

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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Live snapshot from synapsd. Click refresh for updated counts.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <ReindexSection workspaceName={workspaceName} onDone={onRefresh} />

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
                <StatRow label="Ready" value={String((stats.fts as any).ready)} />
              )}
              {(stats.fts as any).rowCount !== undefined && (
                <StatRow label="Row count" value={(stats.fts as any).rowCount?.toLocaleString()} />
              )}
              {(stats.fts as any).error && (
                <StatRow label="Error" value={<span className="text-destructive">{(stats.fts as any).error}</span>} />
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
                  {/* What actually embeds where — from the embedd router rules
                      (server-wide, read-only for now): notes/emails + text-file
                      blobs → text; image/* → image. Falls back to synapsd's gap
                      default only if the embedd routing isn't available. */}
                  {stats.embedder?.routing
                    ? Object.entries(stats.embedder.routing).map(([space, matchers]) => (
                        <StatRow key={`route-${space}`} label={`Embeds → ${space}`} value={<span className="font-mono text-[11px]">{matchers.join(', ')}</span>} />
                      ))
                    : <StatRow label="Text-embeddable (gap default)" value={stats.semantic.embeddableSchemas?.join(', ')} />}
                  {/* Per-space vector stats (text 384-d, image/CLIP 768-d) — shows
                      embedded-doc counts so a re-embed's progress is visible. */}
                  {stats.semantic.vectorSpaces && Object.entries(stats.semantic.vectorSpaces).map(([name, sp]) => (
                    <StatRow
                      key={name}
                      label={`Space: ${name} (${sp.dim ?? '?'}-d)`}
                      value={sp.error
                        ? <span className="text-destructive">{sp.error}</span>
                        : `${(sp.embeddedDocs ?? 0).toLocaleString()} docs · ${(sp.chunkRows ?? 0).toLocaleString()} vectors`}
                    />
                  ))}
                  {stats.embedder?.queue && (
                    <StatRow
                      label="Embedding queue (server-wide)"
                      value={stats.embedder.queue.pending > 0
                        ? <span>{stats.embedder.queue.pending.toLocaleString()} pending{stats.embedder.queue.draining ? ' · running' : ''} <span className="text-muted-foreground">· all workspaces</span></span>
                        : 'idle'}
                    />
                  )}
                  <StatRow label="Image relevance floor" value={stats.semantic.imageMaxDistance == null ? 'off' : stats.semantic.imageMaxDistance} mono />
                  <SearchTuning workspaceName={workspaceName} current={stats.semantic.imageMaxDistance} onDone={onRefresh} />
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
  const activeTab: SettingsTab = SETTINGS_TABS.includes(tab as SettingsTab) ? (tab as SettingsTab) : 'general'
  useEffect(() => {
    if (tab !== activeTab) navigate(`/workspaces/${workspaceName}/settings/${activeTab}`, { replace: true })
  }, [tab, activeTab, workspaceName, navigate])
  const setActiveTab = (next: SettingsTab) => navigate(`/workspaces/${workspaceName}/settings/${next}`)
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

  const loadShares = async (id = workspaceId) => {
    if (!id) return
    try {
      const result = await listWorkspaceShares(id)
      setShares(result.publicCanvasShares)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load shares', variant: 'destructive' })
    }
  }

  const loadDbStats = async (id = workspaceId) => {
    if (!id) return
    setIsLoadingDbStats(true)
    try {
      const stats = await getWorkspaceDbStats(id)
      setDbStats(stats)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load DB stats', variant: 'destructive' })
    } finally {
      setIsLoadingDbStats(false)
    }
  }

  const loadDevices = async (id = workspaceId) => {
    if (!id) return
    setIsLoadingDevices(true)
    try {
      const [all, linked] = await Promise.all([listDevices(), listWorkspaceDevices(id)])
      setAllDevices(all)
      setLinkedDevices(linked)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load devices', variant: 'destructive' })
    } finally {
      setIsLoadingDevices(false)
    }
  }

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

  const loadRuntimeSettings = async (id = workspaceId) => {
    if (!id) return
    const [nextServices, nextBackends] = await Promise.all([
      getWorkspaceServicesStatus(id).catch(() => null),
      listBackends(id).catch(() => [] as Backend[]),
    ])
    setServices(nextServices)
    // The Data tab manages storage backends; imap accounts have their own panel.
    setDataBackends(nextBackends.filter((b) => b.kind === 'storage'))
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
  }, [workspaceName])

  useEffect(() => {
    if (activeTab === 'db' && workspaceId && !dbStats && !isLoadingDbStats) {
      loadDbStats()
    }
    if (activeTab === 'devices' && workspaceId && !isLoadingDevices && allDevices.length === 0) {
      loadDevices()
    }
  }, [activeTab, workspaceId])

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

  const toggleDataBackend = async (backend: Backend) => {
    if (backend.config?.supported === false) return
    setBusyAction(`backend:${backend.address}`)
    try {
      await updateBackend(workspaceId, backend.driver, backend.address, { enabled: !backend.enabled })
      await loadRuntimeSettings()
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
          ['db', 'Database'],
          ['devices', 'Devices'],
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
          {dataBackends.map((backend) => {
            const cfg = (backend.config || {}) as Record<string, unknown>
            const backendId = backend.address
            const copy = DATA_BACKEND_LABELS[backendId] || { title: backendId, description: 'Workspace data backend.' }
            const supported = cfg.supported !== false
            // Structural local stores: workspace:data (managed blob target) and
            // stored.cache can never be disabled; as managed, non-exported
            // stores the read-only knob doesn't apply to them either.
            const alwaysOn = backendId === 'workspace:data' || backendId === 'stored.cache'
            const canToggle = supported && !alwaysOn
            const hasReadOnly = canToggle && cfg.managed !== true
            return (
              <section key={backendId} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold">{copy.title}</h2>
                      {!supported && <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">unsupported</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
                    {typeof cfg.root === 'string' && cfg.root && <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{cfg.root}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>status: {backend.status}</span>
                      <span>watch: {cfg.watch ? 'true' : 'false'}</span>
                      {cfg.readOnly === true && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600">read-only</span>}
                      {backend.lastSyncAt && <span>last scan: {new Date(backend.lastSyncAt).toLocaleString()}</span>}
                    </div>
                    {backend.lastError && <p className="mt-2 text-xs text-destructive">{backend.lastError}</p>}
                    {cfg.readOnly === true && (
                      <p className="mt-1 text-[11px] text-amber-600">
                        Read-only: the web UI / REST API never deletes bytes on this backend — Destroy degrades to a reference drop.
                        Recommended when the folder is exported elsewhere (e.g. via Samba).
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
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
                    {backendId === 'stored.cache' && (
                      <ClearThumbnailsButton workspaceId={workspaceId} />
                    )}
                    {backend.capabilities?.sync && (
                      <Button type="button" variant="outline" size="sm" disabled={busyAction === `resync:${backendId}`} onClick={() => resyncBackend(backend)}>
                        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busyAction === `resync:${backendId}` ? 'animate-spin' : ''}`} />
                        Re-sync
                      </Button>
                    )}
                    {alwaysOn ? (
                      <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title="Structural workspace store — cannot be disabled">always on</span>
                    ) : (
                      <Toggle checked={!!backend.enabled} disabled={!canToggle || busyAction === `backend:${backendId}`} onClick={() => toggleDataBackend(backend)} />
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
        </div>
      )}

      {activeTab === 'db' && (
        <DbStatsTab
          stats={dbStats}
          isLoading={isLoadingDbStats}
          onRefresh={() => loadDbStats()}
          workspaceName={workspaceName!}
        />
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
// Grouped per index (Timelines / FTS / Embeddings); every op shows its
// description inline (tooltips are useless on touch). Destructive variants
// (rebuild / full re-embed) sit behind a confirm. All idempotent server-side.
function ReindexSection({ workspaceName, onDone }: { workspaceName: string; onDone: () => void }) {
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
    {
      title: 'Text embeddings (384-d)',
      ops: [
        { key: 'text-backfill', label: 'Backfill', description: 'Enqueue text docs (notes, emails, text files) without a vector. Async, off-thread.', fn: () => adminReindexEmbeddings(workspaceName, { space: 'text' }) },
        { key: 'text-reembed', label: 'Re-embed', description: 'Wipe the text vectors and re-embed every text doc. Async; can take a while.', confirm: 'Wipe the TEXT vectors and re-embed every text document?', fn: () => adminReindexEmbeddings(workspaceName, { space: 'text', reindex: true }) },
        { key: 'text-optimize', label: 'Optimize', description: 'Compact + prune the text vector table and rebuild its ANN index.', fn: () => adminOptimize(workspaceName, 'text') },
      ],
    },
    {
      title: 'Image embeddings (768-d)',
      ops: [
        { key: 'image-backfill', label: 'Backfill', description: 'Enqueue photos without a CLIP vector. Async, off-thread.', fn: () => adminReindexEmbeddings(workspaceName, { space: 'image' }) },
        { key: 'image-reembed', label: 'Re-embed', description: 'Wipe the image vectors and re-embed every photo. Async; can take a while.', confirm: 'Wipe the IMAGE vectors and re-embed every photo?', fn: () => adminReindexEmbeddings(workspaceName, { space: 'image', reindex: true }) },
        { key: 'image-optimize', label: 'Optimize', description: 'Compact + prune the image vector table and rebuild its ANN index.', fn: () => adminOptimize(workspaceName, 'image') },
      ],
    },
  ]

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-1 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Index maintenance</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Admin-only. Reindex operations are idempotent.</p>
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

import { useState, type ReactNode } from 'react'
import { Activity, ChevronDown, ChevronRight, FolderPlus, HardDrive, Pencil, Plus, RefreshCw, Square, Trash2 } from 'lucide-react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { getBackendStyle } from '@/lib/layer-style'
import { syncBackendWithProgress } from '@/services/backend-sync-progress'
import type { RemovalPolicy } from '@/services/trash-operations'
import { BackendRemovalSettings } from '@/components/workspace/backend-removal-settings'
import { CacheMaintenancePanel } from '@/components/workspace/cache-maintenance-panel'
import { TrashPanel } from '@/components/workspace/trash-panel'
import { OptionRow, StorageForm, type StorageKind } from '@/components/settings/storage-forms'
import {
  cancelBackendSync,
  clearThumbnailCache,
  formatBytes,
  getBackendDiskUsage,
  removeBackend,
  testBackend,
  syncBackend, updateBackend,
  type Backend,
  type BackendDiskUsage,
} from '@/services/workspace'

const BLOB_STORE = 'workspace:data'

const BUILT_IN: Record<string, { title: string; summary: string }> = {
  'workspace:home': { title: 'Workspace Home', summary: 'Your home folder on this server, also reachable over WebDAV.' },
  [BLOB_STORE]: { title: 'Workspace Data', summary: 'Uploads, mail and attachments on this server, stored by content hash.' },
}

// Every kind of storage a workspace can connect. A new driver adds one entry.
interface StorageType { id: string; kind: StorageKind; mode?: 'cas' | 'path'; label: string; hint: string; icon: ReactNode }
const STORAGE_TYPES: StorageType[] = [
  { id: 's3-cas', kind: 's3', mode: 'cas', label: 'S3 content store', hint: 'Holds all workspace data by content hash, each file once. Can be the primary data store or a backup.', icon: <Icon icon="mdi:database-outline" width={18} height={18} /> },
  { id: 's3-path', kind: 's3', mode: 'path', label: 'S3 bucket', hint: 'Files under readable folders and names. Indexed in place, usable as a filing target.', icon: <Icon icon="mdi:bucket-outline" width={18} height={18} /> },
  { id: 'file', kind: 'file', label: 'Local folder', hint: 'A directory on the server host, indexed in place.', icon: <FolderPlus className="h-[18px] w-[18px]" /> },
  { id: 'gdrive', kind: 'gdrive', label: 'Google Drive', hint: 'A Drive folder or all of My Drive.', icon: <Icon icon="mdi:google-drive" width={18} height={18} /> },
]

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)
const config = (backend: Backend) => (backend.config || {}) as Record<string, unknown>
const isBuiltIn = (backend: Backend) => backend.address in BUILT_IN || config(backend).managed === true
const formKind = (backend: Backend): StorageKind | null =>
  (!isBuiltIn(backend) && (backend.driver === 'file' || backend.driver === 'gdrive' || backend.driver === 's3') ? backend.driver : null)

function backendTitle(backend: Backend): string {
  const label = config(backend).label
  return BUILT_IN[backend.address]?.title || (typeof label === 'string' && label) || backend.address
}

// One line saying what and where this location is.
function backendSummary(backend: Backend): string {
  const cfg = config(backend)
  if (BUILT_IN[backend.address]) return BUILT_IN[backend.address].summary
  if (backend.driver === 's3') return s3Address(backend)
  if (backend.driver === 'gdrive') {
    const account = typeof cfg.account === 'string' && cfg.account && cfg.account !== cfg.label ? `${cfg.account}, ` : ''
    return `Google Drive, ${account}${cfg.folderId && cfg.folderId !== 'root' ? `folder ${cfg.folderId}` : 'My Drive'}`
  }
  if (backend.driver === 'share') {
    const source = (cfg.source || null) as { device?: { name?: string } | null; files?: number | null; seenAt?: string | null } | null
    const where = source?.device?.name ? ` on ${source.device.name}` : ''
    if (cfg.online) return `Read-only share file://${backend.address}/${where}${source?.files != null ? `, ${source.files} files` : ''}`
    return `Read-only share file://${backend.address}/, ${source?.seenAt ? `last seen${where} ${new Date(source.seenAt).toLocaleString()}` : 'not connected'}. Its files stay listed.`
  }
  const device = (cfg.device || null) as { name?: string } | null
  return `${typeof cfg.root === 'string' ? cfg.root : 'Local folder'}${device?.name ? ` on ${device.name}` : ''}`
}

function s3Address(backend: Backend): string {
  const cfg = config(backend)
  const host = typeof cfg.endpoint === 'string' && cfg.endpoint ? cfg.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'Amazon S3'
  return `s3://${cfg.bucket || ''}${cfg.prefix ? `/${cfg.prefix}` : ''} on ${host}`
}

const isCas = (backend: Backend) => backend.driver === 's3' && config(backend).mode === 'cas'

function StatusPill({ backend }: { backend: Backend }) {
  if (config(backend).supported === false) return <Pill tone="muted">Unsupported</Pill>
  if (backend.resyncing) {
    const progress = backend.progress ? ` ${backend.progress.scanned}${backend.progress.total != null ? ` / ${backend.progress.total}` : ''}` : ''
    return <Pill tone="primary"><RefreshCw className="h-3 w-3 animate-spin" />Indexing{progress}</Pill>
  }
  if (backend.lastError || backend.status === 'error') return <Pill tone="danger">Error</Pill>
  if (!backend.enabled || backend.status === 'stopped') return <Pill tone="muted">Off</Pill>
  if (backend.status === 'offline') return <Pill tone="muted">Offline</Pill>
  return <Pill tone="ok">{backend.status === 'running' ? 'Watching' : 'Ready'}</Pill>
}

function Pill({ tone, children }: { tone: 'ok' | 'muted' | 'primary' | 'danger' | 'warning'; children: ReactNode }) {
  const tones = {
    ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    muted: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    danger: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/15 text-warning',
  }
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

function DiskUsageButton({ workspaceId, backend }: { workspaceId: string; backend: Backend }) {
  const [usage, setUsage] = useState<BackendDiskUsage | null>(backend.usage ?? null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const compute = async () => {
    setBusy(true)
    try { setUsage(await getBackendDiskUsage(workspaceId, backend.driver, backend.address)) }
    catch (err) { showToast({ title: 'Could not measure size', description: errorText(err, 'Request failed'), variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={compute}
      title={usage ? `Measured ${new Date(usage.computedAt).toLocaleString()}. Click to measure again.` : 'Walks the whole folder; slow on large ones.'}>
      <HardDrive className={`mr-2 h-3.5 w-3.5 ${busy ? 'animate-pulse' : ''}`} />
      {busy ? 'Measuring…' : usage ? formatBytes(usage.bytes) : 'Measure size'}
    </Button>
  )
}

function ClearThumbnailsButton({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const clear = async () => {
    setBusy(true)
    try {
      const { removed } = await clearThumbnailCache(workspaceId)
      showToast({ title: 'Thumbnail cache cleared', description: `${removed} cached thumbnail(s) removed` })
    } catch (err) {
      showToast({ title: 'Could not clear thumbnails', description: errorText(err, 'Request failed'), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={clear} title="Thumbnails are rebuilt when they are next shown">
      <Trash2 className={`mr-2 h-3.5 w-3.5 ${busy ? 'animate-pulse' : ''}`} />
      {busy ? 'Clearing…' : 'Clear thumbnails'}
    </Button>
  )
}

// Glob patterns a file backend leaves out of its index. The server's default
// patterns always apply; these are added on top.
function ExclusionsEditor({ backend, busy, onSave }: { backend: Backend; busy: boolean; onSave: (patterns: string[]) => void | Promise<void> }) {
  const cfg = config(backend)
  const saved = Array.isArray(cfg.exclude) ? (cfg.exclude as string[]) : []
  const effective = Array.isArray(cfg.effectiveExclusions) ? (cfg.effectiveExclusions as string[]) : []
  const defaults = effective.filter((p) => !saved.includes(p))
  const savedKey = saved.join('\n')
  const [draft, setDraft] = useState(savedKey)
  const [seenKey, setSeenKey] = useState(savedKey)
  if (seenKey !== savedKey) { setSeenKey(savedKey); setDraft(savedKey) }
  const patterns = draft.split('\n').map((s) => s.trim()).filter(Boolean)

  return (
    <details className="border-t pt-3 text-xs">
      <summary className="cursor-pointer font-medium">Skipped files{saved.length ? ` (${saved.length} custom)` : ''}</summary>
      <div className="mt-3 space-y-2">
        <p className="text-muted-foreground">
          One glob pattern per line, for example <code className="font-mono">**/node_modules/**</code>. Re-sync afterwards to drop entries that are already indexed.
        </p>
        <textarea className="min-h-[80px] w-full rounded-md border bg-background p-2 font-mono text-xs" value={draft}
          onChange={(e) => setDraft(e.target.value)} placeholder={'**/node_modules/**\n**/dist/**'} spellCheck={false} />
        <Button type="button" size="sm" variant="outline" disabled={busy || patterns.join('\n') === savedKey} onClick={() => onSave(patterns)}>Save patterns</Button>
        {defaults.length > 0 && (
          <details>
            <summary className="cursor-pointer text-muted-foreground">{defaults.length} built-in patterns always apply</summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] text-muted-foreground">{defaults.join('\n')}</pre>
          </details>
        )}
      </div>
    </details>
  )
}

// Deleting on an S3 bucket is on unless turned off; versioning and Object Lock are shown as
// the options they will become.
function S3DeleteSettings({ backend, busy, onPatch }: { backend: Backend; busy: boolean; onPatch: (patch: Record<string, unknown>) => void }) {
  const cfg = config(backend)
  return (
    <>
      {cfg.readOnly !== true && (
        <OptionRow
          label="Allow deletes"
          hint="Deleting a file in Canvas removes the object from the bucket. Turn off to keep every object."
          checked={cfg.permanentDelete !== false}
          disabled={busy}
          onChange={(next) => onPatch({ permanentDelete: next })}
        />
      )}
      {['Versioning (keep earlier versions of a file)', 'Object Lock / WORM (retention on every upload)'].map((label) => (
        <label key={label} className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <input type="checkbox" disabled checked={false} readOnly className="h-3.5 w-3.5" />
          <span>{label}</span>
          <span className="text-[11px]">Not supported yet</span>
        </label>
      ))}
    </>
  )
}

interface PanelProps {
  workspaceId: string
  workspaceName?: string
  backends: Backend[]
  // Replaces one backend in the parent's list (live scan progress).
  onBackendChange: (backend: Backend) => void
  reload: () => Promise<void>
  refreshTree: () => void
}

export function StorageSettingsPanel({ workspaceId, workspaceName, backends, onBackendChange, reload, refreshTree }: PanelProps) {
  const { showToast, showProgress } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // null: closed, 'choose': the type list, otherwise the chosen type's form.
  const [adding, setAdding] = useState<StorageType | 'choose' | null>(null)

  const run = async (key: string, failure: string, action: () => Promise<void>) => {
    setBusy(key)
    try { await action() }
    catch (err) { showToast({ title: failure, description: errorText(err, 'Request failed'), variant: 'destructive' }) }
    finally { setBusy(null) }
  }

  const patch = (backend: Backend, change: Record<string, unknown>, { tree = false } = {}) =>
    run(`patch:${backend.address}`, 'Could not save', async () => {
      await updateBackend(workspaceId, backend.driver, backend.address, change)
      await reload()
      if (tree) refreshTree()
    })

  const test = (backend: Backend) => run(`test:${backend.address}`, 'Connection failed', async () => {
    const result = await testBackend(workspaceId, backend.driver, backend.address) as { uploadChecksum?: 'sha256' | 'md5' } | null
    await reload()
    const checksum = result?.uploadChecksum ? ` Uploads are checked by ${result.uploadChecksum === 'sha256' ? 'SHA-256' : 'MD5'}.` : ''
    showToast({ title: 'Connection works', description: `${backendTitle(backend)}: credentials and location verified.${checksum}` })
  })

  const resync = async (backend: Backend) => {
    setBusy(`sync:${backend.address}`)
    try {
      await syncBackendWithProgress(showProgress, workspaceId, backend.driver, backend.address, onBackendChange)
      await reload()
    } catch {
      // The scan monitor records and shows the failure.
    } finally {
      setBusy(null)
    }
  }

  const uploadExisting = (backend: Backend) => run(`sync:${backend.address}`, 'Could not start the upload', async () => {
    await syncBackend(workspaceId, backend.driver, backend.address)
    showToast({ title: 'Upload started', description: `Files stored before ${backendTitle(backend)} was connected are uploading in the background.` })
  })

  const stopSync = (backend: Backend) => run(`sync:${backend.address}`, 'Could not stop the scan', async () => {
    await cancelBackendSync(workspaceId, backend.driver, backend.address)
    await reload()
    showToast({ title: 'Scan stopped', description: 'Files indexed so far are kept. Re-sync continues from there.' })
  })

  const remove = (backend: Backend) => {
    const title = backendTitle(backend)
    if (!window.confirm(`Remove "${title}" from this workspace? No files are deleted there.`)) return
    void run(`remove:${backend.address}`, 'Could not remove', async () => {
      await removeBackend(workspaceId, backend.driver, backend.address)
      await reload()
      refreshTree()
      showToast({ title: 'Removed', description: `${title} is no longer connected` })
    })
  }

  // One content-addressed backend is the primary data store. Turning it on
  // elsewhere moves the role; turning it off on a bucket returns it to the
  // local blob store.
  const setPrimary = (backend: Backend, next: boolean) => run(`patch:${backend.address}`, 'Could not change the primary data store', async () => {
    await updateBackend(workspaceId, backend.driver, backend.address, { primary: next })
    await reload()
    showToast({
      title: 'Primary data store changed',
      description: next ? `All new data is stored in ${backendTitle(backend)} by default.` : `All new data is stored in ${BUILT_IN[BLOB_STORE].title} by default.`,
    })
  })

  const afterSaved = async () => { setEditing(null); setAdding(null); await reload(); refreshTree() }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeading
          title="Storage locations"
          description="Folders, buckets and drives this workspace reads from and files into."
          action={!adding && (
            <Button type="button" size="sm" variant="outline" onClick={() => setAdding('choose')}>
              <Plus className="mr-2 h-3.5 w-3.5" />Add storage
            </Button>
          )}
        />

        {adding === 'choose' && (
          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-xs font-medium">What do you want to connect?</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(null)}>Cancel</Button>
            </div>
            <ul className="divide-y">
              {STORAGE_TYPES.map((type) => (
                <li key={type.id}>
                  <button type="button" onClick={() => setAdding(type)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent">
                    <span className="shrink-0 text-muted-foreground">{type.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{type.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{type.hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {adding && adding !== 'choose' && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{adding.icon}</span>
              <h3 className="text-sm font-semibold">Connect: {adding.label}</h3>
              <button type="button" className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAdding('choose')}>Choose another type</button>
            </div>
            <StorageForm key={adding.id} kind={adding.kind} mode={adding.mode} workspaceId={workspaceId} onSaved={afterSaved} onCancel={() => setAdding(null)} />
          </div>
        )}

        <div className="divide-y rounded-lg border">
          {backends.map((backend) => {
            const cfg = config(backend)
            const id = backend.address
            const open = expanded === id
            const supported = cfg.supported !== false
            const builtIn = isBuiltIn(backend)
            const alwaysOn = id === BLOB_STORE
            const kind = formKind(backend)
            const style = getBackendStyle(backend)
            const saving = busy === `patch:${id}`
            return (
              <div key={id}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <button type="button" aria-expanded={open} onClick={() => { setExpanded(open ? null : id); setEditing(null) }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <Icon icon={style.icon} width={18} height={18} color={style.color} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{backendTitle(backend)}</span>
                        {backend.primary ? <Pill tone="primary">Primary</Pill> : isCas(backend) && backend.enabled && <Pill tone="muted">Backup</Pill>}
                        {cfg.readOnly === true && <Pill tone="warning">Read-only</Pill>}
                      </span>
                      <span className={`block truncate text-[11px] text-muted-foreground ${builtIn ? '' : 'font-mono'}`}>{backendSummary(backend)}</span>
                    </span>
                  </button>
                  <StatusPill backend={backend} />
                  <span title={alwaysOn ? 'Required by every workspace: all data is received here first' : backend.primary ? 'The primary data store cannot be turned off' : undefined}>
                    <Switch
                      label={`${backendTitle(backend)} enabled`}
                      checked={alwaysOn || !!backend.enabled}
                      disabled={!supported || alwaysOn || backend.primary || saving}
                      onClick={() => patch(backend, { enabled: !backend.enabled }, { tree: true })}
                    />
                  </span>
                </div>

                {open && (
                  <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
                    {backend.lastError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{backend.lastError}</p>}

                    <div className="flex flex-wrap items-center gap-2">
                      {isCas(backend) ? (
                        <Button type="button" variant="outline" size="sm" disabled={!backend.enabled || busy === `sync:${id}`} onClick={() => uploadExisting(backend)}
                          title="Uploads every file Workspace Data holds that this store does not have yet.">
                          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === `sync:${id}` ? 'animate-spin' : ''}`} />Upload existing files
                        </Button>
                      ) : backend.capabilities?.sync && (backend.resyncing ? (
                        <Button type="button" variant="outline" size="sm" disabled={busy === `sync:${id}`} onClick={() => stopSync(backend)}
                          title="Files indexed so far are kept; Re-sync continues from there.">
                          <Square className="mr-2 h-3.5 w-3.5 fill-current" />Stop scan
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" disabled={!backend.enabled || busy === `sync:${id}`} onClick={() => resync(backend)}>
                          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === `sync:${id}` ? 'animate-spin' : ''}`} />Re-sync
                        </Button>
                      ))}
                      {backend.capabilities?.test && (
                        <Button type="button" variant="outline" size="sm" disabled={busy === `test:${id}`} onClick={() => test(backend)}>
                          <Activity className="mr-2 h-3.5 w-3.5" />{busy === `test:${id}` ? 'Testing…' : 'Test connection'}
                        </Button>
                      )}
                      {(backend.driver === 'file' || backend.driver === 'cacache') && supported && <DiskUsageButton workspaceId={workspaceId} backend={backend} />}
                      {kind && editing !== id && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(id)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" />Edit connection
                        </Button>
                      )}
                      {kind && (
                        <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive"
                          disabled={busy === `remove:${id}` || backend.primary} onClick={() => remove(backend)}
                          title={backend.primary ? 'Choose another primary data store first' : 'Disconnect this location. No files are deleted there.'}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" />Remove
                        </Button>
                      )}
                    </div>

                    {isCas(backend) && (
                      <p className="text-[11px] text-muted-foreground">
                        {backend.primary ? '' : backend.enabled ? 'Backup: every new file is also stored here. ' : 'Disabled: no data is stored here. '}
                        Each file is stored once, named by its content hash, directly under the key prefix.
                      </p>
                    )}
                    {backend.lastSyncAt && <p className="text-[11px] text-muted-foreground">Last scan {new Date(backend.lastSyncAt).toLocaleString()}{backend.treePath ? `. Shown in the backends tree at ${backend.treePath}.` : '.'}</p>}

                    {kind && editing === id ? (
                      <div className="rounded-md border bg-background p-3">
                        <StorageForm kind={kind} backend={backend} workspaceId={workspaceId} onSaved={afterSaved} onCancel={() => setEditing(null)} />
                      </div>
                    ) : supported && (
                      <div className="divide-y rounded-md border bg-background px-3">
                        {(id === BLOB_STORE || isCas(backend)) && (
                          <OptionRow
                            label="Primary data store"
                            hint={backend.primary
                              ? (id === BLOB_STORE
                                ? 'All workspace data is stored here by default. To move the role, turn it on for another content store.'
                                : 'All workspace data is stored here by default. Turning it off returns the role to Workspace Data.')
                              : 'Store all new workspace data here by default. Data already stored stays where it is.'}
                            checked={backend.primary === true}
                            disabled={saving || !backend.enabled || (id === BLOB_STORE && backend.primary === true)}
                            onChange={(next) => setPrimary(backend, next)}
                          />
                        )}
                        {id === BLOB_STORE && backend.primary !== true && (
                          <OptionRow
                            label="Keep a local copy of every file"
                            hint="Off: a file is held here only until the primary store has a verified copy, then removed. On: every file also stays on this server."
                            checked={backend.keepCopy === true}
                            disabled={saving}
                            onChange={(next) => patch(backend, { keepCopy: next })}
                          />
                        )}
                        {backend.capabilities?.sync && !isCas(backend) && backend.driver !== 'share' && (
                          <OptionRow label="Scan when the workspace starts" hint="Off: files are indexed only when you press Re-sync."
                            checked={cfg.scanOnStart === true} disabled={saving} onChange={(next) => patch(backend, { scanOnStart: next })} />
                        )}
                        {isCas(backend) && (
                          <OptionRow label="Write a description file next to each blob" hint="A small JSON file with the document's type, title and metadata, written once. It lets the bucket be read without the Canvas index after a disaster."
                            checked={cfg.sidecar === true} disabled={saving} onChange={(next) => patch(backend, { sidecar: next })} />
                        )}
                        {(backend.driver === 'file' || backend.driver === 'gdrive' || backend.driver === 's3') && !isCas(backend) && (
                          <OptionRow label="Watch for changes" hint="Pick up changes made outside Canvas without a manual re-sync."
                            checked={!!cfg.watch} disabled={!backend.enabled || saving} onChange={(next) => patch(backend, { watch: next })} />
                        )}
                        {backend.driver === 'share' && (
                          <OptionRow label="Follow changes" hint="List files as they are added, moved or removed on the machine that holds the folder. Off: only when that machine rescans."
                            checked={!!cfg.watch} disabled={!backend.enabled || saving} onChange={(next) => patch(backend, { watch: next })} />
                        )}
                        {(!builtIn || id === 'workspace:home') && !isCas(backend) && backend.driver !== 'share' ? (
                          <OptionRow label="Read-only" hint="Canvas never writes or deletes here. Deleting a document only drops its reference."
                            checked={cfg.readOnly === true} disabled={saving || backend.primary} onChange={(next) => patch(backend, { readOnly: next })} />
                        ) : null}
                        {backend.driver === 's3' && <S3DeleteSettings backend={backend} busy={saving} onPatch={(change) => patch(backend, change)} />}
                      </div>
                    )}

                    {backend.driver === 'file' && supported && !alwaysOn && (
                      <ExclusionsEditor backend={backend} busy={saving} onSave={(patterns) => patch(backend, { exclude: patterns })} />
                    )}
                    {supported && !isCas(backend) && (
                      <BackendRemovalSettings value={cfg.removalPolicy as RemovalPolicy} backends={backends} source={id} destination={cfg.propagatedRemovalSupported === true}
                        onSave={async (removalPolicy) => { await updateBackend(workspaceId, backend.driver, backend.address, { removalPolicy }); await reload() }} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Cache" description="Derived data on this server. Safe to verify, compact or clear." />
        <CacheMaintenancePanel key={workspaceId} workspaceId={workspaceId}>
          <ClearThumbnailsButton workspaceId={workspaceId} />
        </CacheMaintenancePanel>
      </section>

      {workspaceName && (
        <section className="space-y-3">
          <SectionHeading title="Trash" description="Deleted documents and files removed at their source, kept until purged." />
          <TrashPanel workspaceName={workspaceName} />
        </section>
      )}
    </div>
  )
}

import { useState, type ReactNode } from 'react'
import { Activity, Check, ChevronDown, ChevronRight, CloudUpload, FolderPlus, HardDrive, Pencil, Plus, RefreshCw, Square, Trash2 } from 'lucide-react'
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
  updateBackend,
  type Backend,
  type BackendDiskUsage,
} from '@/services/workspace'

const BLOB_STORE = 'workspace:data'

const BUILT_IN: Record<string, { title: string; summary: string }> = {
  'workspace:home': { title: 'Workspace Home', summary: 'Your home folder on this server, also reachable over WebDAV.' },
  [BLOB_STORE]: { title: 'Workspace Data', summary: 'Uploads, mail and attachments on this server, stored by content hash.' },
}

const ADD_OPTIONS: Array<{ kind: StorageKind; label: string; hint: string; icon: ReactNode }> = [
  { kind: 'file', label: 'Local folder', hint: 'A directory on the server host', icon: <FolderPlus className="h-4 w-4" /> },
  { kind: 's3', label: 'S3 bucket', hint: 'Amazon S3 or a compatible service', icon: <Icon icon="mdi:bucket-outline" width={16} height={16} /> },
  { kind: 'gdrive', label: 'Google Drive', hint: 'A Drive folder or all of My Drive', icon: <Icon icon="mdi:google-drive" width={16} height={16} /> },
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
  if (backend.driver === 's3') {
    const host = typeof cfg.endpoint === 'string' && cfg.endpoint ? cfg.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'Amazon S3'
    return `s3://${cfg.bucket || ''}${cfg.prefix ? `/${cfg.prefix}` : ''} on ${host}`
  }
  if (backend.driver === 'gdrive') {
    const account = typeof cfg.account === 'string' && cfg.account && cfg.account !== cfg.label ? `${cfg.account}, ` : ''
    return `Google Drive, ${account}${cfg.folderId && cfg.folderId !== 'root' ? `folder ${cfg.folderId}` : 'My Drive'}`
  }
  const device = (cfg.device || null) as { name?: string } | null
  return `${typeof cfg.root === 'string' ? cfg.root : 'Local folder'}${device?.name ? ` on ${device.name}` : ''}`
}

function StatusPill({ backend }: { backend: Backend }) {
  if (config(backend).supported === false) return <Pill tone="muted">Unsupported</Pill>
  if (backend.resyncing) {
    const progress = backend.progress ? ` ${backend.progress.scanned}${backend.progress.total != null ? ` / ${backend.progress.total}` : ''}` : ''
    return <Pill tone="primary"><RefreshCw className="h-3 w-3 animate-spin" />Indexing{progress}</Pill>
  }
  if (backend.lastError || backend.status === 'error') return <Pill tone="danger">Error</Pill>
  if (!backend.enabled || backend.status === 'stopped') return <Pill tone="muted">Off</Pill>
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

// What deleting a file on an S3 bucket does, and the one switch that changes it.
function S3DeleteSettings({ backend, busy, onPatch }: { backend: Backend; busy: boolean; onPatch: (patch: Record<string, unknown>) => void }) {
  const cfg = config(backend)
  if (cfg.readOnly === true) return null
  if (cfg.versioned === true) {
    return (
      <p className="py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Deleting files:</span> the bucket is versioned, so a delete adds a delete marker and earlier versions stay in the bucket.
        Object Lock retention keeps applying to those versions.
      </p>
    )
  }
  return (
    <OptionRow
      label="Allow permanent deletes"
      hint={cfg.versioned === false
        ? 'The bucket is not versioned: a deleted object cannot be recovered. Off keeps deleting disabled.'
        : 'Versioning has not been checked yet. Run Test connection: on a versioned bucket deleting works without this switch.'}
      checked={cfg.permanentDelete === true}
      disabled={busy}
      onChange={(next) => onPatch({ permanentDelete: next })}
    />
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
  const [adding, setAdding] = useState<StorageKind | null>(null)

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
    const result = await testBackend(workspaceId, backend.driver, backend.address) as { versioned?: boolean } | null
    await reload()
    const versioning = backend.driver === 's3' && typeof result?.versioned === 'boolean'
      ? (result.versioned ? ' The bucket is versioned: deleting files is available.' : ' The bucket is not versioned.')
      : ''
    showToast({ title: 'Connection works', description: `${backendTitle(backend)}: credentials and location verified.${versioning}` })
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

  // Blob-capable remote backends can take over as the primary data store.
  const primary = backends.find((b) => b.primary) || null
  const candidates = backends.filter((b) => b.capabilities?.blobs === true && b.enabled)
  const choosePrimary = (next: Backend | null) => {
    if ((next?.address ?? null) === (primary?.address ?? null)) return
    const target = next ?? primary
    if (!target) return
    void run('primary', 'Could not change the primary data store', async () => {
      await updateBackend(workspaceId, target.driver, target.address, { primary: next !== null })
      await reload()
      showToast({
        title: 'Primary data store changed',
        description: next ? `All new data is stored in ${backendTitle(next)} by default.` : 'All new data is stored on this server by default.',
      })
    })
  }

  const afterSaved = async () => { setEditing(null); setAdding(null); await reload(); refreshTree() }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeading title="Primary data store" description="Where all data of this workspace is stored by default." />
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Primary data store">
          <PrimaryOption
            selected={!primary} disabled={busy === 'primary'} onSelect={() => choosePrimary(null)}
            icon={<HardDrive className="h-4 w-4" />} title="This server"
            detail="All data is stored in Workspace Data on this server's disk by default."
          />
          {candidates.map((backend) => (
            <PrimaryOption
              key={backend.address} selected={primary?.address === backend.address} disabled={busy === 'primary'} onSelect={() => choosePrimary(backend)}
              icon={<CloudUpload className="h-4 w-4" />} title={backendTitle(backend)}
              detail={`All data is stored in ${backendSummary(backend)} by default.`}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {candidates.length === 0
            ? 'Connect a writable S3 bucket below to store all data in object storage by default.'
            : primary
              ? 'New data is received by this server, then uploaded and verified in the background. It is stored by content hash under .canvas-blobs/ in the bucket, outside its folder tree. Data added before this was chosen is not moved.'
              : 'Choosing a bucket applies to data added from then on.'}
        </p>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Storage locations"
          description="Folders, buckets and drives this workspace reads from and files into."
          action={!adding && (
            <Button type="button" size="sm" variant="outline" onClick={() => setAdding('file')}>
              <Plus className="mr-2 h-3.5 w-3.5" />Add storage
            </Button>
          )}
        />

        {adding && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Storage type">
              {ADD_OPTIONS.map((option) => (
                <button key={option.kind} type="button" role="radio" aria-checked={adding === option.kind} onClick={() => setAdding(option.kind)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${adding === option.kind ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
                  <span className="text-muted-foreground">{option.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{option.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{option.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <StorageForm key={adding} kind={adding} workspaceId={workspaceId} onSaved={afterSaved} onCancel={() => setAdding(null)} />
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
                        {backend.primary && <Pill tone="primary">Primary</Pill>}
                        {cfg.readOnly === true && <Pill tone="warning">Read-only</Pill>}
                      </span>
                      <span className={`block truncate text-[11px] text-muted-foreground ${builtIn ? '' : 'font-mono'}`}>{backendSummary(backend)}</span>
                    </span>
                  </button>
                  <StatusPill backend={backend} />
                  <span title={alwaysOn ? 'Required by every workspace' : backend.primary ? 'The primary data store cannot be turned off' : undefined}>
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
                      {backend.capabilities?.sync && (backend.resyncing ? (
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

                    {backend.lastSyncAt && <p className="text-[11px] text-muted-foreground">Last scan {new Date(backend.lastSyncAt).toLocaleString()}{backend.treePath ? `. Shown in the backends tree at ${backend.treePath}.` : '.'}</p>}

                    {kind && editing === id ? (
                      <div className="rounded-md border bg-background p-3">
                        <StorageForm kind={kind} backend={backend} workspaceId={workspaceId} onSaved={afterSaved} onCancel={() => setEditing(null)} />
                      </div>
                    ) : supported && !alwaysOn && (
                      <div className="divide-y rounded-md border bg-background px-3">
                        {backend.capabilities?.sync && (
                          <OptionRow label="Scan when the workspace starts" hint="Off: files are indexed only when you press Re-sync."
                            checked={cfg.scanOnStart === true} disabled={saving} onChange={(next) => patch(backend, { scanOnStart: next })} />
                        )}
                        {(backend.driver === 'file' || backend.driver === 'gdrive' || backend.driver === 's3') && (
                          <OptionRow label="Watch for changes" hint="Pick up changes made outside Canvas without a manual re-sync."
                            checked={!!cfg.watch} disabled={!backend.enabled || saving} onChange={(next) => patch(backend, { watch: next })} />
                        )}
                        {!builtIn || id === 'workspace:home' ? (
                          <OptionRow label="Read-only" hint="Canvas never writes or deletes here. Deleting a document only drops its reference."
                            checked={cfg.readOnly === true} disabled={saving || backend.primary} onChange={(next) => patch(backend, { readOnly: next })} />
                        ) : null}
                        {backend.driver === 's3' && <S3DeleteSettings backend={backend} busy={saving} onPatch={(change) => patch(backend, change)} />}
                      </div>
                    )}

                    {backend.driver === 'file' && supported && !alwaysOn && (
                      <ExclusionsEditor backend={backend} busy={saving} onSave={(patterns) => patch(backend, { exclude: patterns })} />
                    )}
                    {supported && (
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

function PrimaryOption({ selected, disabled, onSelect, icon, title, detail }: {
  selected: boolean; disabled: boolean; onSelect: () => void; icon: ReactNode; title: string; detail: string
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${selected ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
      <span className={`mt-0.5 ${selected ? 'text-primary' : 'text-muted-foreground'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{detail}</span>
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  )
}

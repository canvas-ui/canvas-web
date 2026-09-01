import { useCallback, useEffect, useState } from 'react'
import { Check, HardDriveDownload, Pin, RefreshCw, Trash2, Loader2, X, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import {
  GIB,
  clearOfflineCaches,
  evictToBudget,
  getOfflineSettings,
  getOfflineUsage,
  listPinScopes,
  removePinScope,
  setOfflineSettings,
  pinScopeId,
  type PinScope,
  type OfflineSettings as Settings,
  type OfflineUsage,
} from '@/lib/offline'
import { warmPinScope, type PinProgress } from '@/services/offline'
import { listWorkspaces } from '@/services/workspace'

const BUDGET_OPTIONS = [
  { label: '1 GB', bytes: 1 * GIB },
  { label: '2 GB', bytes: 2 * GIB },
  { label: '4 GB', bytes: 4 * GIB },
  { label: '8 GB', bytes: 8 * GIB },
]

const selectClass = 'h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < GIB) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / GIB).toFixed(2)} GB`
}

// The SW memoizes settings for a few seconds; poke it so a toggle applies now.
function notifyServiceWorker(): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'OFFLINE_SETTINGS_CHANGED' })
}

export function OfflineSettings() {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [usage, setUsage] = useState<OfflineUsage | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [workspaces, setWorkspaces] = useState<string[]>([])
  const [scopes, setScopes] = useState<PinScope[]>([])
  const [warming, setWarming] = useState<Record<string, PinProgress>>({})
  const [clearing, setClearing] = useState(false)
  const [newWorkspace, setNewWorkspace] = useState('')
  const [newPath, setNewPath] = useState('/')

  const refresh = useCallback(() => {
    getOfflineSettings().then(setSettings).catch(() => {})
    getOfflineUsage().then(setUsage).catch(() => {})
    listPinScopes().then((s) => setScopes(s.sort((a, b) => a.id.localeCompare(b.id)))).catch(() => {})
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    listWorkspaces()
      .then((ws) => setWorkspaces(ws.map((w) => w.name).filter(Boolean).sort()))
      .catch(() => {})
  }, [refresh])

  const apply = async (next: Settings) => {
    setSettings(next)
    await setOfflineSettings(next)
    notifyServiceWorker()
    if (next.enabled) {
      // Without persistence the browser may evict the whole origin under disk
      // pressure (iOS Safari especially) — ask once, keep whatever we get.
      navigator.storage?.persist?.().then(setPersisted).catch(() => {})
    }
    // A budget shrink should reclaim space right away, not on the next fetch.
    evictToBudget(next.budgetBytes).then(refresh).catch(() => {})
  }

  const toggleWorkspaceExcluded = (name: string) => {
    if (!settings) return
    const excluded = settings.excludedWorkspaces.includes(name)
      ? settings.excludedWorkspaces.filter((w) => w !== name)
      : [...settings.excludedWorkspaces, name]
    void apply({ ...settings, excludedWorkspaces: excluded })
  }

  const handleClear = async () => {
    setClearing(true)
    try {
      await clearOfflineCaches()
      showSuccessToast('Offline cache cleared')
      refresh()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to clear cache')
    } finally {
      setClearing(false)
    }
  }

  const handleWarm = async (workspaceRef: string, path: string) => {
    const id = pinScopeId(workspaceRef, path)
    setWarming((w) => ({ ...w, [id]: { done: 0, total: 0, bytes: 0 } }))
    try {
      const scope = await warmPinScope(workspaceRef, path, (p) =>
        setWarming((w) => ({ ...w, [id]: p })))
      showSuccessToast(
        scope.truncated
          ? `Pinned ${formatBytes(scope.bytes)} — stopped at the size budget`
          : `Pinned ${scope.id} (${formatBytes(scope.bytes)})`,
      )
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to pin')
    } finally {
      setWarming((w) => {
        const { [id]: _done, ...rest } = w
        return rest
      })
      refresh()
    }
  }

  const handleAddScope = () => {
    if (!newWorkspace) return
    void handleWarm(newWorkspace, newPath.trim() || '/')
    setNewPath('/')
  }

  const handleRemoveScope = async (id: string) => {
    await removePinScope(id)
    refresh()
  }

  if (!settings) return null

  return (
    <div className="space-y-8">
      <section>
        <SectionHeading
          title="Offline cache"
          description="Keep documents you open (and scopes you pin) readable without a connection. Cached on this device only; least-recently-used files are evicted when the size budget fills. Video streaming is not cached."
        />
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => apply({ ...settings, enabled: !settings.enabled })}
            aria-pressed={settings.enabled}
            className={cn(
              'focus-ring flex items-center gap-3 rounded-lg border p-4 text-left transition-colors',
              settings.enabled ? 'border-primary bg-accent' : 'border-input hover:bg-muted/40',
            )}
          >
            <HardDriveDownload className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="flex-1">
              <span className="block text-sm font-medium">{settings.enabled ? 'Enabled' : 'Disabled'}</span>
              <span className="block text-xs text-muted-foreground">
                {settings.enabled
                  ? persisted === false
                    ? 'Storage is not persistent — the browser may still evict the cache under disk pressure'
                    : 'Documents are cached as you browse'
                  : 'Nothing is cached for offline use'}
              </span>
            </span>
            {settings.enabled && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>

          {settings.enabled && (
            <>
              <div>
                <p className="mb-2 text-sm font-medium">Size budget</p>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_OPTIONS.map((opt) => (
                    <Button
                      key={opt.bytes}
                      variant={settings.budgetBytes === opt.bytes ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => apply({ ...settings, budgetBytes: opt.bytes })}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {usage && (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span>
                      {formatBytes(usage.contentBytes)} of {formatBytes(settings.budgetBytes)} used
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {usage.contentCount} file(s){usage.pinnedBytes > 0 ? `, ${formatBytes(usage.pinnedBytes)} pinned` : ''}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, (usage.contentBytes / settings.budgetBytes) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div>
                <Button variant="outline" size="sm" onClick={handleClear} disabled={clearing}>
                  {clearing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                  Clear offline cache
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {settings.enabled && (
        <>
          <section>
            <SectionHeading
              title="Pinned scopes"
              description="A pinned scope — a workspace, or one of its tree paths — is downloaded up front and never evicted. Scopes resolve fresh on every re-warm, so moved contexts and reorganized trees are picked up; documents that left a scope return to normal eviction."
            />
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select
                className={selectClass}
                value={newWorkspace}
                onChange={(e) => setNewWorkspace(e.target.value)}
                aria-label="Workspace to pin"
              >
                <option value="">Select workspace…</option>
                {workspaces.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <Input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/path (optional, / = whole workspace)"
                className="h-9 w-56"
                aria-label="Tree path to pin"
              />
              <Button size="sm" onClick={handleAddScope} disabled={!newWorkspace || !!Object.keys(warming).length}>
                <Pin className="mr-1.5 h-3.5 w-3.5" />
                Pin
              </Button>
            </div>
            <ul className="space-y-1">
              {scopes.map((scope) => {
                const progress = warming[scope.id]
                return (
                  <li
                    key={scope.id}
                    className="flex items-center gap-3 rounded-md border border-input px-3 py-2 text-sm"
                  >
                    <span className="flex-1 truncate font-mono text-xs sm:text-sm">
                      {scope.workspaceRef}://{scope.path.replace(/^\//, '')}
                    </span>
                    {progress ? (
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {progress.total > 0 ? `${progress.done}/${progress.total} · ${formatBytes(progress.bytes)}` : 'listing…'}
                      </span>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {formatBytes(scope.bytes)}{scope.truncated ? ' (partial)' : ''}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleWarm(scope.workspaceRef, scope.path)}
                          aria-label={`Re-warm ${scope.id}`}
                          title="Re-warm: re-resolve the scope and download anything new"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveScope(scope.id)} aria-label={`Unpin ${scope.id}`}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </li>
                )
              })}
              {scopes.length === 0 && (
                <li className="rounded-md border border-dashed border-input px-3 py-4 text-center text-sm text-muted-foreground">
                  Nothing pinned — everything relies on browse-caching and LRU
                </li>
              )}
            </ul>
          </section>

          <section>
            <SectionHeading
              title="Workspace caching"
              description="Excluded workspaces are never cached — not even as you browse — and are not served from cache."
            />
            <ul className="space-y-1">
              {workspaces.map((name) => {
                const excluded = settings.excludedWorkspaces.includes(name)
                return (
                  <li
                    key={name}
                    className="flex items-center gap-3 rounded-md border border-input px-3 py-2 text-sm"
                  >
                    <span className={cn('flex-1 truncate', excluded && 'text-muted-foreground line-through')}>{name}</span>
                    {excluded && <Ban className="h-3.5 w-3.5 text-muted-foreground" />}
                    <Button
                      variant={excluded ? 'outline' : 'ghost'}
                      size="sm"
                      onClick={() => toggleWorkspaceExcluded(name)}
                    >
                      {excluded ? 'Include' : 'Exclude'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

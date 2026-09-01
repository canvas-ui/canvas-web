import { useCallback, useEffect, useState } from 'react'
import { Check, HardDriveDownload, Pin, PinOff, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import {
  GIB,
  clearOfflineCaches,
  evictToBudget,
  getOfflineSettings,
  getOfflineUsage,
  listContextPins,
  removeContextPin,
  setOfflineSettings,
  type ContextPin,
  type OfflineSettings as Settings,
  type OfflineUsage,
} from '@/lib/offline'
import { pinContextForOffline, type PinProgress } from '@/services/offline'
// `Context` is ambient (src/types/api.d.ts).
import { listContexts } from '@/services/context'

const BUDGET_OPTIONS = [
  { label: '1 GB', bytes: 1 * GIB },
  { label: '2 GB', bytes: 2 * GIB },
  { label: '4 GB', bytes: 4 * GIB },
  { label: '8 GB', bytes: 8 * GIB },
]

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
  const [contexts, setContexts] = useState<Context[]>([])
  const [pins, setPins] = useState<ContextPin[]>([])
  const [warming, setWarming] = useState<Record<string, PinProgress>>({})
  const [clearing, setClearing] = useState(false)

  const refresh = useCallback(() => {
    getOfflineSettings().then(setSettings).catch(() => {})
    getOfflineUsage().then(setUsage).catch(() => {})
    listContextPins().then(setPins).catch(() => {})
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    listContexts().then(setContexts).catch(() => {})
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

  const handlePin = async (ctx: Context) => {
    setWarming((w) => ({ ...w, [ctx.id]: { done: 0, total: 0, bytes: 0 } }))
    try {
      const pin = await pinContextForOffline(ctx.id, (p) =>
        setWarming((w) => ({ ...w, [ctx.id]: p })))
      showSuccessToast(
        pin.truncated
          ? `Pinned ${formatBytes(pin.bytes)} — stopped at the size budget`
          : `Pinned ${ctx.url || ctx.id} (${formatBytes(pin.bytes)})`,
      )
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to pin context')
    } finally {
      setWarming((w) => {
        const { [ctx.id]: _done, ...rest } = w
        return rest
      })
      refresh()
    }
  }

  const handleUnpin = async (contextId: string) => {
    await removeContextPin(contextId)
    refresh()
  }

  if (!settings) return null
  const pinById = new Map(pins.map((p) => [p.contextId, p]))

  return (
    <div className="space-y-8">
      <section>
        <SectionHeading
          title="Offline cache"
          description="Keep documents you open (and contexts you pin) readable without a connection. Cached on this device only; least-recently-used files are evicted when the size budget fills. Video streaming is not cached."
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
        <section>
          <SectionHeading
            title="Pinned contexts"
            description="Pinned contexts are downloaded up front and never evicted. Browse a context once while online for its lists to work offline; pinning covers the file contents."
          />
          <ul className="space-y-1">
            {contexts.map((ctx) => {
              const pin = pinById.get(ctx.id)
              const progress = warming[ctx.id]
              return (
                <li
                  key={ctx.id}
                  className="flex items-center gap-3 rounded-md border border-input px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate">{ctx.url || ctx.id}</span>
                  {progress ? (
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {progress.total > 0 ? `${progress.done}/${progress.total} · ${formatBytes(progress.bytes)}` : 'listing…'}
                    </span>
                  ) : pin ? (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(pin.bytes)}{pin.truncated ? ' (partial)' : ''}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => handleUnpin(ctx.id)} aria-label={`Unpin ${ctx.url || ctx.id}`}>
                        <PinOff className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handlePin(ctx)} aria-label={`Pin ${ctx.url || ctx.id}`}>
                      <Pin className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              )
            })}
            {contexts.length === 0 && (
              <li className="rounded-md border border-dashed border-input px-3 py-4 text-center text-sm text-muted-foreground">
                No contexts yet
              </li>
            )}
          </ul>
        </section>
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

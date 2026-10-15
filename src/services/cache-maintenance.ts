import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'
import { formatBytes } from '@/services/workspace'
import type { ToastContextType } from '@/components/ui/use-toast'

export type CacheStore = 'workspace:cache' | 'workspace:data'
export type CacheAction = 'collect' | 'verify' | 'compact'
export type CacheJob = {
  id: string; store: CacheStore; action: CacheAction
  status: 'queued' | 'running' | 'completed' | 'failed'
  createdAt: string; startedAt: string | null; finishedAt: string | null
  result: { reclaimedCount?: number; reclaimedSize?: number; verifiedContent?: number; badContentCount?: number; compactedCount?: number } | null
  error: string | null
}
export type CacheMaintenanceStatus = {
  stores: Array<{ id: CacheStore; label: string; canCollect: boolean; canVerify: boolean; canCompact: boolean }>
  jobs: CacheJob[]
}
export const CACHE_ACTION_LABELS: Record<CacheAction, string> = {
  collect: 'Collect unused blobs', verify: 'Verify integrity', compact: 'Compact index',
}
export const isCacheJobActive = (job: CacheJob) => job.status === 'queued' || job.status === 'running'
const endpoint = (workspace: string) => `${API_ROUTES.workspaces}/${encodeURIComponent(workspace)}/cache/maintenance`
export const getCacheMaintenance = (workspace: string) => api.get<CacheMaintenanceStatus>(endpoint(workspace))
export const startCacheMaintenance = (workspace: string, store: CacheStore, action: CacheAction) =>
  api.post<CacheJob>(endpoint(workspace), { store, action, ...(action === 'verify' ? { confirm: true } : {}) })

export function cacheJobSummary(job: CacheJob): string {
  if (job.status === 'failed') return job.error || 'Maintenance failed'
  if (job.status === 'queued') return 'Waiting for active storage operations…'
  if (job.status === 'running') return job.action === 'verify' ? 'Reading and checking stored content…' : 'Processing the cache index…'
  const result = job.result || {}
  if (job.action === 'compact') return `${(result.compactedCount || 0).toLocaleString()} keys compacted`
  if (job.action === 'verify') return `${(result.verifiedContent || 0).toLocaleString()} blobs verified · ${(result.badContentCount || 0).toLocaleString()} corrupted blobs removed · ${formatBytes(result.reclaimedSize || 0)} reclaimed`
  return `${(result.reclaimedCount || 0).toLocaleString()} unused blobs removed · ${formatBytes(result.reclaimedSize || 0)} reclaimed`
}

const running = new Map<string, Promise<void>>()
export const CACHE_MAINTENANCE_EVENT = 'workspace:cache-maintenance'

// A notice outlives the settings pane. Reopening the pane reconnects to the
// same server receipt instead of submitting another potentially hours-long job.
export function followCacheMaintenance(showProgress: ToastContextType['showProgress'], workspace: string, initial: CacheJob): Promise<void> {
  const key = JSON.stringify([workspace, initial.id])
  const existing = running.get(key)
  if (existing) return existing
  const task = (async () => {
    const progress = showProgress({ title: CACHE_ACTION_LABELS[initial.action], description: `${initial.store} · ${cacheJobSummary(initial)}` })
    try {
      let job = initial
      while (isCacheJobActive(job)) {
        const status = await getCacheMaintenance(workspace)
        const current = status.jobs.find(item => item.id === initial.id)
        if (!current) throw new Error('Maintenance receipt is no longer available. The server may have restarted; refresh the cache settings.')
        job = current
        window.dispatchEvent(new CustomEvent(CACHE_MAINTENANCE_EVENT, { detail: { workspace, status } }))
        if (!isCacheJobActive(job)) break
        progress.update({ title: CACHE_ACTION_LABELS[job.action], description: `${job.store} · ${cacheJobSummary(job)}` })
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      if (job.status === 'failed') throw new Error(cacheJobSummary(job))
      progress.done({ title: `${CACHE_ACTION_LABELS[job.action]} complete`, description: `${job.store} · ${cacheJobSummary(job)}` })
    } catch (error) {
      progress.fail({ title: 'Cache maintenance needs attention', description: `${initial.store} · ${error instanceof Error ? error.message : String(error)}`, variant: 'destructive' })
      throw error
    }
  })()
  running.set(key, task)
  void task.finally(() => { if (running.get(key) === task) running.delete(key) }).catch(() => {})
  return task
}

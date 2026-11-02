import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'
import type { ToastContextType } from '@/components/ui/use-toast'

export type DbMaintenanceAction = 'reindex:timelines' | 'reindex:mime' | 'reindex:search' | 'optimize'
export type DbMaintenanceJob = {
  id: string; action: DbMaintenanceAction; options: { rebuild?: boolean; space?: string | null }
  status: 'queued' | 'running' | 'completed' | 'failed'
  createdAt: string; startedAt: string | null; finishedAt: string | null
  progress: Record<string, number> | null
  result: Record<string, unknown> | null
  error: string | null
}
export type DbMaintenanceStatus = { jobs: DbMaintenanceJob[] }

export const isDbJobActive = (job: DbMaintenanceJob) => job.status === 'queued' || job.status === 'running'
const base = (workspace: string) => `${API_ROUTES.workspaces}/${encodeURIComponent(workspace)}/db`
export const getDbMaintenance = (workspace: string) => api.get<DbMaintenanceStatus>(`${base(workspace)}/maintenance`)

const ROUTES: Record<DbMaintenanceAction, string> = {
  'reindex:timelines': 'reindex/timelines', 'reindex:mime': 'reindex/mime', 'reindex:search': 'reindex/search', optimize: 'optimize',
}

/** Index maintenance on the workspace's own database (owner/admin). The server answers with a receipt; follow it with followDbMaintenance. */
export function startDbMaintenance(workspace: string, action: DbMaintenanceAction, options: { rebuild?: boolean; space?: string } = {}): Promise<DbMaintenanceJob> {
  const route = ROUTES[action]
  if (action === 'reindex:search') return api.post<DbMaintenanceJob>(`${base(workspace)}/${route}${options.rebuild ? '?rebuild=true' : ''}`, {})
  return api.post<DbMaintenanceJob>(`${base(workspace)}/${route}`, action === 'optimize' && options.space ? { space: options.space } : {})
}

export function dbJobLabel(job: DbMaintenanceJob): string {
  switch (job.action) {
    case 'reindex:timelines': return 'Rebuild timelines'
    case 'reindex:mime': return 'Rebuild file types'
    case 'reindex:search': return job.options.rebuild ? 'Rebuild word search' : 'Index missing documents'
    default: return job.options.space ? `Optimize ${job.options.space}` : 'Optimize indexes'
  }
}

const n = (value: unknown) => (typeof value === 'number' ? value.toLocaleString() : '0')

export function dbJobSummary(job: DbMaintenanceJob): string {
  if (job.status === 'failed') return job.error || 'Maintenance failed'
  if (job.status === 'queued') return 'Waiting for the database…'
  if (job.status === 'running') {
    const p = job.progress
    if (!p) return 'Working…'
    if (job.action === 'reindex:search') return `${n(p.indexed)} indexed`
    return `${n(p.scanned)}${typeof p.total === 'number' ? ` / ${n(p.total)}` : ''} documents scanned`
  }
  const r = job.result || {}
  if (job.action === 'reindex:timelines') return `${n(r.created)} created, ${n(r.updated)} updated (${n(r.scanned)} scanned)`
  if (job.action === 'reindex:mime') return `${n(r.ticked)} of ${n(r.scanned)} documents across ${n(r.keys)} file types`
  if (job.action === 'reindex:search') return `${n(r.indexed)} newly indexed (${n(r.alreadyIndexed)} of ${n(r.totalDocs)} already were)`
  return 'Indexes compacted'
}

const running = new Map<string, Promise<DbMaintenanceJob>>()

// The server keeps the receipt; this only shows it. A notice outlives the
// settings pane, and reopening the pane reattaches instead of starting again.
export function followDbMaintenance(showProgress: ToastContextType['showProgress'], workspace: string, initial: DbMaintenanceJob): Promise<DbMaintenanceJob> {
  const key = JSON.stringify([workspace, initial.id])
  const existing = running.get(key)
  if (existing) return existing
  const task = (async () => {
    const progress = showProgress({ title: dbJobLabel(initial), description: dbJobSummary(initial) })
    try {
      let job = initial
      while (isDbJobActive(job)) {
        const status = await getDbMaintenance(workspace)
        const current = status.jobs.find(item => item.id === initial.id)
        if (!current) throw new Error('Maintenance receipt is no longer available. The workspace may have restarted; run it again.')
        job = current
        if (!isDbJobActive(job)) break
        progress.update({ title: dbJobLabel(job), description: dbJobSummary(job) })
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      if (job.status === 'failed') throw new Error(dbJobSummary(job))
      progress.done({ title: `${dbJobLabel(job)} complete`, description: dbJobSummary(job) })
      return job
    } catch (error) {
      progress.fail({ title: `${dbJobLabel(initial)} needs attention`, description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
      throw error
    }
  })()
  running.set(key, task)
  void task.finally(() => { if (running.get(key) === task) running.delete(key) }).catch(() => {})
  return task
}

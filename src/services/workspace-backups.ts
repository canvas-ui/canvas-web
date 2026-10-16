import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'
import type { ToastContextType } from '@/components/ui/use-toast'

export type WorkspaceBackup = {
  id: string; kind: 'startup' | 'hourly' | 'manual' | 'pre-restore'
  createdAt: string; bytes: number; verified: boolean
  datasets: Record<string, { count: number; sha256: string }>
}
export type BackupJob = {
  id: string; action: 'backup' | 'restore'; status: 'running' | 'completed' | 'failed'
  createdAt: string; finishedAt: string | null; error: string | null
}
export type BackupStatus = {
  backups: WorkspaceBackup[]; jobs: BackupJob[]; isActive: boolean
  retention: { startup: number; hourly: number }
}
export const BACKUPS_EVENT = 'workspace:backups'
const endpoint = (workspace: string) => `${API_ROUTES.workspaces}/${encodeURIComponent(workspace)}/db/backups`
export const getWorkspaceBackups = (workspace: string) => api.get<BackupStatus>(endpoint(workspace))
export const createWorkspaceBackup = (workspace: string) => api.post<BackupJob>(endpoint(workspace), { action: 'backup' })
export const restoreWorkspaceBackup = (workspace: string, backupId: string) => api.post<BackupJob>(endpoint(workspace), { action: 'restore', backupId, confirm: true })
const running = new Map<string, Promise<void>>()

// Follow jobs outside the settings component so navigation does not lose the
// completion notification. Refreshing reconnects to the same server receipt.
export function followWorkspaceBackup(showProgress: ToastContextType['showProgress'], workspace: string, initial: BackupJob) {
  const key = JSON.stringify([workspace, initial.id])
  const current = running.get(key)
  if (current) return current
  const task = (async () => {
    const restore = initial.action === 'restore'
    const progress = showProgress({ title: restore ? 'Restoring workspace database' : 'Backing up workspace database',
      description: restore ? 'Stopping the workspace and preserving its current database…' : 'Copying and verifying all datasets…' })
    try {
      let job = initial
      while (job.status === 'running') {
        const status = await getWorkspaceBackups(workspace)
        const next = status.jobs.find(item => item.id === job.id)
        if (!next) throw new Error('The server restarted. Refresh the backup list to check the result.')
        job = next
        window.dispatchEvent(new CustomEvent(BACKUPS_EVENT, { detail: { workspace, status } }))
        if (job.status === 'running') await new Promise(resolve => setTimeout(resolve, 1500))
      }
      if (job.status === 'failed') throw new Error(job.error || 'Database operation failed')
      progress.done({ title: restore ? 'Workspace database restored' : 'Workspace backup verified',
        description: restore ? 'The workspace is stopped. Start it when you are ready; search indexes will rebuild.' : 'Documents, relations and virtual tree placements are saved.' })
    } catch (error) {
      progress.fail({ title: 'Workspace backup needs attention', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
      throw error
    }
  })()
  running.set(key, task)
  void task.finally(() => running.delete(key)).catch(() => {})
  return task
}

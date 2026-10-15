import { getBackend, syncBackend, type Backend } from './workspace'
import type { ToastContextType } from '@/components/ui/use-toast'

const running = new Map<string, Promise<void>>()

// A sync POST only acknowledges a background scan. Keep the notice until the
// backend reports completion, even if its initiating menu unmounts.
export function syncBackendWithProgress(showProgress: ToastContextType['showProgress'], workspace: string, driver: string, address: string, onUpdate?: (backend: Backend) => void): Promise<void> {
  const key = JSON.stringify([workspace, driver, address])
  const existing = running.get(key)
  if (existing) return existing
  const task = (async () => {
    const progress = showProgress({ title: 'Resyncing…', description: address })
    try {
      await syncBackend(workspace, driver, address)
      for (;;) {
        const backend = await getBackend(workspace, driver, address)
        onUpdate?.(backend)
        if (!backend.resyncing && backend.status !== 'syncing') {
          if (backend.lastError) throw new Error(backend.lastError)
          progress.done({ title: backend.resyncCancelledAt ? 'Resync stopped' : 'Resync complete', description: `${address}${backend.progress ? ` · ${backend.progress.scanned} files scanned` : ''}` })
          window.dispatchEvent(new CustomEvent('workspace:documents:refresh', { detail: { workspaceName: workspace, treeName: 'backends' } }))
          return
        }
        const count = backend.progress
        progress.update({ title: 'Resyncing…', description: `${address}${count ? ` · ${count.scanned}${count.total == null ? '' : ` / ${count.total}`} files scanned` : ''}` })
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    } catch (error) {
      progress.fail({ title: 'Resync needs attention', description: `${address}: ${error instanceof Error ? error.message : String(error)}`, variant: 'destructive' })
      throw error
    }
  })()
  running.set(key, task)
  void task.finally(() => { if (running.get(key) === task) running.delete(key) }).catch(() => {})
  return task
}

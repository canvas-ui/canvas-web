import { socketService } from '@/lib/socket'
import { cancelBackfillJob, getBackfillJob, getBackfillLimit, listBackfillJobs, startBackfillJob, type BackfillJob } from './hooks'
import type { ToastContextType } from '@/components/ui/use-toast'

type ShowProgress = ToastContextType['showProgress']

const TITLE = 'Applying rules to existing documents…'

const following = new Map<string, Promise<void>>()

function describe(job: BackfillJob) {
  const rule = job.ruleIds.length > 1 ? `Rule ${job.ruleIndex + 1}/${job.ruleIds.length}: ` : ''
  return `${rule}${job.processed}${job.total === null ? '' : ` / ${job.total}`} documents · ${job.applied} applied`
}

function settle(progress: ReturnType<ShowProgress>, job: BackfillJob) {
  const summary = `${job.checked} checked, ${job.applied} applied${job.skipped ? `, ${job.skipped} already there` : ''}`
  if (job.status === 'cancelled') progress.done({ title: 'Cancelled', description: summary })
  else if (job.status === 'failed') progress.fail({ title: 'Stopped before finishing', description: `${summary}: ${job.error}. The rule stays enabled; rerun it from Rules to finish.`, variant: 'destructive' })
  else if (job.failed) progress.done({ title: 'Finished with errors', description: `${summary}, ${job.failed} failed. Details in the rule’s run log.`, variant: 'destructive' })
  else progress.done({ title: 'Rule applied', description: summary })
}

// The workspace runs the job and keeps it across restarts. This only shows it:
// job events drive the notice, and each socket connect catches up on what a
// disconnected socket missed.
function follow(showProgress: ShowProgress, workspace: string, first: BackfillJob): Promise<void> {
  const existing = following.get(first.id)
  if (existing) return existing
  const task = new Promise<void>(resolve => {
    const channel = { channel: `workspace:${workspace}` }
    const cancel = () => {
      progress.update({ title: 'Cancelling…', description: describe(first) })
      cancelBackfillJob(workspace, first.id).catch(() => progress.update({ title: TITLE, description: 'Could not cancel. Try again.' }))
    }
    const progress = showProgress({ title: TITLE, description: describe(first), action: { label: 'Cancel', onClick: cancel } })
    const finish = () => {
      offConnect?.()
      socketService.off('job.progress', onEvent)
      socketService.off('job.finished', onEvent)
      resolve()
    }
    const apply = (job: BackfillJob) => {
      if (job.status === 'running') return progress.update({ title: TITLE, description: describe(job) })
      settle(progress, job)
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh'))
      finish()
    }
    const onEvent = (payload: unknown) => {
      const job = (payload as { job?: BackfillJob } | null)?.job
      if (job?.id === first.id) apply(job)
    }
    const catchUp = () => {
      socketService.emit('subscribe', channel)
      getBackfillJob(workspace, first.id).then(apply, () => { /* the next connect or event settles it */ })
    }
    const offConnect = socketService.on('connect', catchUp)
    socketService.on('job.progress', onEvent)
    socketService.on('job.finished', onEvent)
    catchUp()
  })
  following.set(first.id, task)
  void task.finally(() => following.delete(first.id))
  return task
}

/** Never rejects; the outcome is reported through the notice. */
export async function startRuleBackfill(showProgress: ShowProgress, workspace: string, ruleIds: string[]): Promise<void> {
  let job: BackfillJob
  try {
    job = await startBackfillJob(workspace, { ruleIds, limit: getBackfillLimit() })
  } catch (error) {
    showProgress({ title: TITLE }).fail({ title: 'Could not start', description: `${error instanceof Error ? error.message : String(error)}. The rule stays enabled; rerun it from Rules.`, variant: 'destructive' })
    return
  }
  return follow(showProgress, workspace, job)
}

/** Show runs already going in this workspace, e.g. after a reload. */
export async function resumeRuleBackfills(showProgress: ShowProgress, workspace: string): Promise<void> {
  const jobs = await listBackfillJobs(workspace).catch(() => [])
  for (const job of jobs) if (job.status === 'running') void follow(showProgress, workspace, job)
}

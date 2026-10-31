import { getBackfillJob, getBackfillLimit, listBackfillJobs, startBackfillJob, type BackfillJob } from './hooks'
import type { ToastContextType } from '@/components/ui/use-toast'

type ShowProgress = ToastContextType['showProgress']

const TITLE = 'Applying rules to existing documents…'
const POLL_MS = 2000
const MAX_POLL_FAILURES = 5

const following = new Map<string, Promise<void>>()

function describe(job: BackfillJob) {
  const rule = job.ruleIds.length > 1 ? `Rule ${job.ruleIndex + 1}/${job.ruleIds.length}: ` : ''
  return `${rule}${job.processed}${job.total === null ? '' : ` / ${job.total}`} documents · ${job.applied} applied`
}

function settle(progress: ReturnType<ShowProgress>, job: BackfillJob) {
  const summary = `${job.checked} checked, ${job.applied} applied`
  const stopped = 'The rule stays enabled; rerun it from Rules to finish.'
  if (job.status === 'failed') progress.fail({ title: 'Stopped before finishing', description: `${summary}: ${job.error}. ${stopped}`, variant: 'destructive' })
  else if (job.status === 'stopped') progress.fail({ title: 'Stopped before finishing', description: `${summary}. The workspace stopped. ${stopped}`, variant: 'destructive' })
  else if (job.failed) progress.done({ title: 'Finished with errors', description: `${summary}, ${job.failed} failed. Details in the rule’s run log.`, variant: 'destructive' })
  else progress.done({ title: 'Rule applied', description: summary })
}

// The workspace runs the job. This only shows it, so the notice can end or
// come back with the page without affecting the run.
function follow(showProgress: ShowProgress, workspace: string, first: BackfillJob): Promise<void> {
  const existing = following.get(first.id)
  if (existing) return existing
  const task = (async () => {
    const progress = showProgress({ title: TITLE, description: describe(first) })
    let job = first, failures = 0
    while (job.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, POLL_MS))
      try {
        job = await getBackfillJob(workspace, job.id)
        failures = 0
        progress.update({ title: TITLE, description: describe(job) })
      } catch (error) {
        if (++failures < MAX_POLL_FAILURES) continue
        progress.fail({ title: 'Lost track of the run', description: `${error instanceof Error ? error.message : String(error)}. Check the rule’s run log in Rules.`, variant: 'destructive' })
        return
      }
    }
    settle(progress, job)
    window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
    window.dispatchEvent(new CustomEvent('workspace:tree:refresh'))
  })()
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

import { DocumentActionDialog } from '@/components/common/document-action-dialog'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { useEffect, useRef, useState } from 'react'
import { LinkToCard, type LinkToTarget } from './LinkToCard'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from './LinkToSidePanel'
import { Button } from '@/components/ui/button'
import { copyDocumentToWorkspace } from '@/services/workspace'
import { useToast } from '@/components/ui/use-toast'

interface CopyJob {
  ids: number[]
  target: LinkToTarget
  paths: string[]
  index: number
  id: string
}

// Separate queues per signed-in session without storing the access token.
function queueKey(workspace: string) {
  let hash = 2166136261
  for (const char of localStorage.getItem('authToken') || '') hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `canvas:workspace-copy:${hash >>> 0}:${workspace}`
}

export function CopyToWorkspacePanel({ workspaceId, ids, onClose, modal = false }: { workspaceId: string; ids: number[]; onClose: () => void; modal?: boolean }) {
  const { showProgress } = useToast()
  useEscapeClose(onClose, modal)
  const [storageKey] = useState(() => { try { return queueKey(workspaceId) } catch { return '' } })
  const [job, setJob] = useState<CopyJob | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as CopyJob | null
      return saved && Array.isArray(saved.ids) && saved.target && saved.index < saved.ids.length ? saved : null
    } catch { return null }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stopped = useRef(false)
  const running = useRef(false)
  useEffect(() => { stopped.current = false; return () => { stopped.current = true } }, [])
  const save = (next: CopyJob) => {
    try {
      if (next.index >= next.ids.length) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, JSON.stringify(next))
    } catch { /* Copy still works when browser storage is unavailable. */ }
    if (!stopped.current) setJob(next)
  }
  const run = async (initial: CopyJob) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    let current = initial
    const description = () => `${current.index} / ${current.ids.length} document(s) → ${current.target.workspaceName}`
    const progress = showProgress({ title: 'Copying to workspace…', description: description() })
    save(current)
    try {
      while (current.index < current.ids.length && !stopped.current) {
        if (!navigator.onLine) throw new Error('Offline. Your copy is saved; resume when connected.')
        await copyDocumentToWorkspace(workspaceId, current.ids[current.index], {
          destination: current.target.workspaceName, context: current.paths,
          treeType: current.target.treeType, treeNameOrTreeId: current.target.treeName,
          operationId: `${current.id}:${current.index}`,
        })
        current = { ...current, index: current.index + 1 }
        save(current)
        progress.update({ title: 'Copying to workspace…', description: description() })
      }
      progress.done({ title: current.index >= current.ids.length ? 'Copy complete' : 'Copy paused', description: description() })
      window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh'))
    } catch (cause) {
      progress.fail({ title: 'Copy incomplete', description: `${description()}. ${cause instanceof Error ? cause.message : 'Copy failed'}`, variant: 'destructive' })
      if (!stopped.current) setError(`Document ${current.ids[current.index]}: ${cause instanceof Error ? cause.message : 'Copy failed'}. Resume to retry.`)
    } finally {
      running.current = false
      if (!stopped.current) setBusy(false)
    }
  }
  const close = () => { stopped.current = true; onClose() }
  const done = job != null && job.index >= job.ids.length
  const size = modal ? 'h-full min-h-0 w-full' : LINK_TO_SIDE_SIZE
  const content = <>
    {job ? <section role="dialog" aria-label="Copy to workspace" className={`${size} flex flex-col rounded-(--panel-radius) border bg-card p-4 shadow-elevation-4`}>
      <h2 className="text-sm font-semibold">Copy to workspace</h2>
      <p className="mt-3 break-words text-sm">{job.target.workspaceName}: {job.paths.join(', ')}</p>
      <p role="status" className="mt-3 text-sm">{job.index} of {job.ids.length} copied{done ? '.' : busy ? '…' : ' — paused.'}</p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Files go to workspace:data. Destination rules handle storage placement. Relationships and sharing permissions are not copied. Source documents stay unchanged.</p>
      {!done && <p className="mt-2 text-xs text-muted-foreground">Closing lets the current item finish and pauses the rest. Reopen Copy to workspace to resume, including after reconnecting.</p>}
      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-4">
        {!done && !busy && <Button variant="ghost" onClick={() => { try { localStorage.removeItem(storageKey) } catch { /* no storage */ } setJob(null); setError('') }}>Discard remaining</Button>}
        {!done && !busy && <Button onClick={() => void run(job)}>Resume copy</Button>}
        <Button variant={done ? 'default' : 'outline'} onClick={close}>{done ? 'Done' : busy ? 'Pause & close' : 'Close'}</Button>
      </div>
    </section> : <LinkToCard title="Copy to workspace…" confirmLabel="Copy documents" excludeWorkspace={workspaceId} documentCount={ids.length} sizeClassName={size} onClose={close}
      onConfirm={(paths, target) => run({ ids, target, paths, index: 0, id: crypto.randomUUID() })} />}
  </>
  return modal ? <DocumentActionDialog label="Copy to workspace" onClose={close}>{content}</DocumentActionDialog>
    : <LinkToSidePanel onClose={close}>{content}</LinkToSidePanel>
}

import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getWorkspace, startWorkspace } from '@/services/workspace'
import { Button } from '@/components/ui/button'

/** Do not mount content readers (including their caches) until status is known. */
export function WorkspaceContentGate({ workspaceName, children }: { workspaceName: string; children: ReactNode }) {
  // Route changes within a workspace must not unmount its content readers.
  const identity = workspaceName
  const [checked, setChecked] = useState<{ identity: string; active: boolean } | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    let sequence = 0
    let workspaceId: string | undefined
    const refresh = async () => {
      const request = ++sequence
      try {
        const workspace = await getWorkspace(workspaceName)
        if (!cancelled && request === sequence) {
          workspaceId = workspace.id
          setChecked({ identity, active: workspace.status === 'active' })
          setError('')
        }
      } catch (err) {
        if (!cancelled && request === sequence) {
          setChecked({ identity, active: false })
          setError(err instanceof Error ? err.message : 'Unable to check workspace status')
        }
      }
    }
    const onStopped = (event: Event) => {
      const refs = (event as CustomEvent<{ refs: string[] }>).detail?.refs
      if (!refs?.includes(workspaceName) && !(workspaceId && refs?.includes(workspaceId))) return
      // An earlier status request must not reopen content after a local stop.
      sequence++
      setChecked({ identity, active: false })
    }
    void refresh()
    window.addEventListener('workspaces:refresh', refresh)
    window.addEventListener('workspace:stopped', onStopped)
    // Refocusing only rechecks status; clearing it would unmount every reader
    // and reset the UI even when the workspace is still active.
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('workspaces:refresh', refresh)
      window.removeEventListener('workspace:stopped', onStopped)
      window.removeEventListener('focus', refresh)
    }
  }, [workspaceName, identity, revision])

  if (checked?.identity !== identity) return <p className="p-6 text-sm text-muted-foreground">Checking workspace…</p>
  if (checked.active) return children

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-medium">Workspace stopped</p>
      <p className="text-sm text-muted-foreground">Start this workspace to view its content.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={starting} onClick={async () => {
        setStarting(true)
        setError('')
        try {
          await startWorkspace(workspaceName)
          setRevision(value => value + 1)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to start workspace')
        } finally {
          setStarting(false)
        }
      }}>{starting ? 'Starting…' : 'Start workspace'}</Button>
      <Link className="text-sm underline" to={`/workspaces/${encodeURIComponent(workspaceName)}/settings`}>Workspace settings</Link>
    </div>
  )
}

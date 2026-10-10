import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getWorkspace, getWorkspaceStatus, startWorkspace } from '@/services/workspace'
import { Button } from '@/components/ui/button'
import socketService from '@/lib/socket'
import { isOffline, isNetworkErrorMessage, onConnectivityChange } from '@/lib/connectivity'

/** Do not mount content readers (including their caches) until status is known. */
export function WorkspaceContentGate({ workspaceName, children }: { workspaceName: string; children: ReactNode }) {
  // Route changes within a workspace must not unmount its content readers.
  const identity = workspaceName
  const [checked, setChecked] = useState<{ identity: string; state: 'active' | 'stopped' | 'offline' | 'unavailable' } | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    let sequence = 0
    let workspaceId: string | undefined
    let pending = false
    const refresh = async () => {
      if (pending || cancelled) return
      pending = true
      const request = ++sequence
      try {
        const workspace = workspaceId ? await getWorkspaceStatus(workspaceName) : await getWorkspace(workspaceName)
        if (!cancelled && request === sequence) {
          if ('id' in workspace) workspaceId = workspace.id as string
          // Cached lifecycle metadata is not evidence of a live stop. Offline
          // readers must mount so the PWA can serve their cached content.
          setChecked({ identity, state: isOffline() || workspace.status === 'active' ? 'active'
            : workspace.status === 'inactive' ? 'stopped' : 'unavailable' })
          setError('')
        }
      } catch (err) {
        if (!cancelled && request === sequence) {
          const message = err instanceof Error ? err.message : 'Unable to check workspace status'
          const offline = isNetworkErrorMessage(message)
          // A failed probe must not unmount a working cached view.
          setChecked(previous => offline && previous?.identity === identity && previous.state === 'active'
            ? previous : { identity, state: offline ? 'offline' : 'unavailable' })
          setError(message)
        }
      } finally {
        pending = false
      }
    }
    const onStopped = (event: Event) => {
      const refs = (event as CustomEvent<{ refs: string[] }>).detail?.refs
      if (!refs?.includes(workspaceName) && !(workspaceId && refs?.includes(workspaceId))) return
      // An earlier status request must not reopen content after a local stop.
      sequence++
      setChecked({ identity, state: 'stopped' })
      setError('')
    }
    const onStatus = (event: { workspaceId?: string; id?: string; status?: Workspace['status'] }) => {
      const ref = event.workspaceId || event.id
      if (!ref || (ref !== workspaceName && ref !== workspaceId) || !event.status) return
      sequence++
      setChecked({ identity, state: event.status === 'active' ? 'active'
        : event.status === 'inactive' ? 'stopped' : 'unavailable' })
      setError('')
    }
    void refresh()
    window.addEventListener('workspaces:refresh', refresh)
    window.addEventListener('workspace:stopped', onStopped)
    // Refocusing only rechecks status; clearing it would unmount every reader
    // and reset the UI even when the workspace is still active.
    window.addEventListener('focus', refresh)
    const offConnect = socketService.on('connect', refresh)
    socketService.on('workspace:status:changed', onStatus)
    socketService.on('workspace.status.changed', onStatus)
    const offConnectivity = onConnectivityChange(offline => { if (!offline) void refresh() })
    return () => {
      cancelled = true
      offConnect?.()
      offConnectivity()
      socketService.off('workspace:status:changed', onStatus)
      socketService.off('workspace.status.changed', onStatus)
      window.removeEventListener('workspaces:refresh', refresh)
      window.removeEventListener('workspace:stopped', onStopped)
      window.removeEventListener('focus', refresh)
    }
  }, [workspaceName, identity, revision])

  if (checked?.identity !== identity) return <p className="p-6 text-sm text-muted-foreground">Checking workspace…</p>
  if (checked.state === 'active') return children
  const stopped = checked.state === 'stopped'

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-medium">{stopped ? 'Workspace stopped' : checked.state === 'offline' ? 'Server unreachable' : 'Workspace unavailable'}</p>
      <p className="text-sm text-muted-foreground">{stopped ? 'Start this workspace to view its content.'
        : checked.state === 'offline' ? 'Reconnect to load this workspace. Previously loaded content stays available offline.' : 'Unable to check this workspace. Try again or check its settings.'}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={starting} onClick={async () => {
        setStarting(true)
        setError('')
        try {
          if (stopped) await startWorkspace(workspaceName)
          setRevision(value => value + 1)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to start workspace')
        } finally {
          setStarting(false)
        }
      }}>{starting ? (stopped ? 'Starting…' : 'Checking…') : stopped ? 'Start workspace' : 'Retry'}</Button>
      <Link className="text-sm underline" to={`/workspaces/${encodeURIComponent(workspaceName)}/settings`}>Workspace settings</Link>
    </div>
  )
}

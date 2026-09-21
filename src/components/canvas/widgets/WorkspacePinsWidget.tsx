import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { Pin, RefreshCw, AlertTriangle } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'
import { getWorkspace, listWorkspacePins, type WorkspacePin } from '@/services/workspace'
import { isAuthenticated } from '@/services/auth'
import { usePublicShareCode } from '@/components/renderers/public-share'
import { buildWorkspaceUrl } from '@/utils/url-params'
import { visibleAccentColor } from '@/utils/color'
import { DEFAULT_CANVAS_ICON, DEFAULT_FOLDER_ICON } from '@/lib/layer-style'
import socketService from '@/lib/socket'

export function WorkspacePinsWidget({ canvas }: WidgetProps) {
  const publicShare = usePublicShareCode()
  // Never fetch workspace pins through the authenticated API from a public
  // canvas, even if its viewer also happens to have a session.
  if (publicShare != null || !isAuthenticated()) {
    return <p className="p-3 text-sm text-muted-foreground">Workspace pins are available in the signed-in workspace view.</p>
  }
  return <WorkspacePinsList key={canvas.workspaceId} workspaceId={canvas.workspaceId} />
}

function WorkspacePinsList({ workspaceId }: { workspaceId: string }) {
  const [pins, setPins] = useState<WorkspacePin[]>([])
  const [label, setLabel] = useState('Workspace')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let disposed = false
    let request = 0
    const load = async () => {
      const current = ++request
      setLoading(true)
      try {
        const [workspace, rows] = await Promise.all([getWorkspace(workspaceId), listWorkspacePins(workspaceId)])
        if (disposed || current !== request) return
        setLabel(workspace.label || workspace.name || 'Workspace')
        setPins(rows)
        setError(null)
      } catch {
        if (disposed || current !== request) return
        setPins([])
        setError('Workspace pins are unavailable. Check your workspace access or try again.')
      } finally {
        if (!disposed && current === request) setLoading(false)
      }
    }
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    void load()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    // Reuse events where the shell already subscribes. Poll while visible on
    // Home too, without taking ownership of another panel's socket rooms.
    const offPins = socketService.on('pins.changed', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      disposed = true
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      offPins?.()
      window.clearInterval(timer)
    }
  }, [workspaceId, revision])

  return <div className="canvas-no-drag flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 pb-2">
      <span className="truncate text-sm font-medium">{label}</span>
      <button type="button" title="Refresh pins" aria-label="Refresh pins" disabled={loading} onClick={() => setRevision(value => value + 1)} className="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-1">
      {error ? <p role="alert" className="p-2 text-sm text-muted-foreground">{error}</p>
        : !pins.length ? <p className="p-2 text-sm text-muted-foreground">{loading ? 'Loading pins…' : 'No workspace pins yet. Pin a folder from the workspace tree menu.'}</p>
          : <ul className="space-y-2">
            {pins.map(pin => {
              const missing = pin.resolvable === false
              const color = visibleAccentColor(pin.color)
              const content = <>
                {missing ? <AlertTriangle className="h-5 w-5 shrink-0 text-warning" /> : <Icon icon={pin.icon || (pin.type === 'canvas' ? DEFAULT_CANVAS_ICON : DEFAULT_FOLDER_ICON)} width={22} height={22} color={color} className="shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pin.label || pin.name || pin.path}</p>
                  <p className="truncate text-xs text-muted-foreground">{pin.tree}:{pin.path}</p>
                  {pin.description && <p className="line-clamp-2 text-xs text-muted-foreground">{pin.description}</p>}
                  {missing && <p className="text-xs text-warning">Folder no longer exists</p>}
                </div>
              </>
              const className = 'flex items-center gap-3 rounded-lg border border-l-4 bg-card p-3'
              const style = { borderLeftColor: color || 'transparent' }
              return <li key={pin.id}>{missing
                ? <div className={`${className} opacity-60`} style={style}>{content}</div>
                : <Link to={buildWorkspaceUrl(workspaceId, pin.path, pin.tree)} title={`Open ${pin.tree}:${pin.path}`} className={`${className} transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`} style={style}>{content}</Link>}
              </li>
            })}
          </ul>}
    </div>
  </div>
}

registerWidget({
  type: 'workspace-pins',
  name: 'Workspace pins',
  icon: Pin,
  defaultSize: { w: 4, h: 6, minW: 3, minH: 2 },
  mobileHeight: 0.6,
  defaultConfig: {},
  component: WorkspacePinsWidget,
})

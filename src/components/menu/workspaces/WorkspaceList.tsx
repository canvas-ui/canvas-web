import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Play, Square, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMenu } from '@/components/shell/menu-context'
import { useWorkspaceListData } from '@/hooks/useWorkspaceListData'
import { startWorkspace, stopWorkspace } from '@/services/workspace'
import { useToast } from '@/components/ui/toast-container'

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'active' ? 'bg-green-500' :
    status === 'error' ? 'bg-red-500' :
    'bg-gray-400'

  return <span className={cn('inline-block w-2 h-2 rounded-full shrink-0', color)} title={status} />
}

export function WorkspaceList() {
  const navigate = useNavigate()
  const { state, selectEntity } = useMenu()
  const { workspaces, isLoading } = useWorkspaceListData(state.activeSection === 'workspaces')
  const { showToast } = useToast()
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const handleSelect = (ws: Workspace) => {
    if (ws.status !== 'active') return
    selectEntity(ws.name)
    navigate(`/workspaces/${ws.name}`)
  }

  const handleStart = async (e: React.MouseEvent, ws: Workspace) => {
    e.stopPropagation()
    setBusyIds(prev => new Set(prev).add(ws.name))
    try {
      await startWorkspace(ws.name)
      showToast({ title: 'Success', description: `${ws.label || ws.name} started` })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Start failed', variant: 'destructive' })
    } finally {
      setBusyIds(prev => { const s = new Set(prev); s.delete(ws.name); return s })
    }
  }

  const handleStop = async (e: React.MouseEvent, ws: Workspace) => {
    e.stopPropagation()
    setBusyIds(prev => new Set(prev).add(ws.name))
    try {
      await stopWorkspace(ws.name)
      showToast({ title: 'Success', description: `${ws.label || ws.name} stopped` })
      window.dispatchEvent(new CustomEvent('workspaces:refresh'))
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Stop failed', variant: 'destructive' })
    } finally {
      setBusyIds(prev => { const s = new Set(prev); s.delete(ws.name); return s })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-sidebar-border shrink-0">
        <span className="text-sm font-semibold">Workspaces</span>
        <button
          type="button"
          onClick={() => navigate('/workspaces')}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background hover:opacity-80 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && workspaces.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">Loading...</div>
        ) : workspaces.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">No workspaces found</div>
        ) : (
          <div className="space-y-1.5 px-2">
            {workspaces.map((ws) => {
              const isActive = state.selectedEntityId === ws.name
              const isBusy = busyIds.has(ws.name)
              const isInactive = ws.status !== 'active'

              return (
                <div
                  key={ws.id || ws.name}
                  className={cn(
                    'group relative rounded-md px-3 py-2.5 transition-all shadow-sm hover:shadow',
                    isActive
                      ? 'bg-accent shadow'
                      : isInactive
                        ? 'bg-card opacity-60 hover:opacity-80'
                        : 'bg-card hover:bg-accent/50 cursor-pointer',
                  )}
                  style={{ borderRight: `6px solid ${ws.color || 'transparent'}`, borderRadius: ws.color ? '6px 0 0 6px' : undefined }}
                  onClick={() => handleSelect(ws)}
                >
                  {/* Top row: label + controls */}
                  <div className="flex items-start gap-2">
                    {/* Left: status + label */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={ws.status} />
                        <span className="text-sm font-medium truncate">
                          {ws.label || ws.name}
                        </span>
                      </div>
                    </div>

                    {/* Right: controls */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {ws.status === 'active' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => handleStop(e, ws)}
                          className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground disabled:opacity-50 transition-colors"
                          title="Stop"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => handleStart(e, ws)}
                          className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground disabled:opacity-50 transition-colors"
                          title="Start"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          selectEntity(ws.name)
                          navigate(`/workspaces/${ws.name}/settings`)
                        }}
                        className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground transition-colors"
                        title="Settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {ws.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5 pl-3.5">
                      {ws.description}
                    </div>
                  )}

                  {/* Meta: host + owner */}
                  <div className="flex items-center gap-2 mt-1 pl-3.5">
                    {(ws as any).host && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {(ws as any).host}
                      </span>
                    )}
                    {ws.ownerEmail && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {ws.ownerEmail}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

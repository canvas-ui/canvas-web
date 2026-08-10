import { useIsMobile } from '@/hooks/use-mobile'
import { useState } from 'react'
import { Plus, Play, Square, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMenu } from '@/components/shell/menu-context'
import { useAgentListData } from '@/hooks/useAgentListData'
import { startAgent, stopAgent } from '@/services/agent'
import { useToast } from '@/components/ui/toast-container'
import { useNavigate } from 'react-router-dom'

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'active' ? 'bg-success' :
    status === 'error' ? 'bg-destructive' :
    status === 'starting' || status === 'stopping' ? 'bg-warning' :
    'bg-muted-foreground'

  return <span className={cn('inline-block w-2 h-2 rounded-full shrink-0', color)} title={status} />
}

export function AgentList() {
  const { state, selectEntity, openM2, closeM2 } = useMenu()
  const isMobile = useIsMobile()
  const { agents, isLoading, refresh } = useAgentListData(state.activeSection === 'agents')
  const { showToast } = useToast()
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const navigate = useNavigate()

  const handleSelect = (agent: any) => {
    selectEntity(agent.id)
    openM2('detail', agent.id)
    navigate(`/agents/${encodeURIComponent(agent.name || agent.id)}`)
  }

  const handleStart = async (e: React.MouseEvent, agent: any) => {
    e.stopPropagation()
    setBusyIds(prev => new Set(prev).add(agent.id))
    try {
      await startAgent(agent.id)
      refresh()
      showToast({ title: 'Success', description: `${agent.label || agent.name} started` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Start failed', variant: 'destructive' })
    } finally {
      setBusyIds(prev => { const s = new Set(prev); s.delete(agent.id); return s })
    }
  }

  const handleStop = async (e: React.MouseEvent, agent: any) => {
    e.stopPropagation()
    setBusyIds(prev => new Set(prev).add(agent.id))
    try {
      await stopAgent(agent.id)
      refresh()
      showToast({ title: 'Success', description: `${agent.label || agent.name} stopped` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Stop failed', variant: 'destructive' })
    } finally {
      setBusyIds(prev => { const s = new Set(prev); s.delete(agent.id); return s })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
        <span className="text-sm font-semibold">Agents</span>
        {/* Creation is a content-area job — see WorkspaceList. */}
        <button
          type="button"
          onClick={() => { closeM2(); navigate('/agents?create=1') }}
          title="Create agent"
          aria-label="Create agent"
          className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background hover:opacity-80 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && agents.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">Loading...</div>
        ) : agents.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">No agents found</div>
        ) : (
          <div className="space-y-1.5 px-2">
            {agents.map((agent) => {
              const isActive = state.selectedEntityId === agent.id
              const isBusy = busyIds.has(agent.id)

              return (
                <div
                  key={agent.id}
                  className={cn(
                    'group relative rounded-md px-3 py-2.5 cursor-pointer transition-all shadow-elevation-1 hover:shadow',
                    isActive ? 'bg-accent shadow' : 'bg-card hover:bg-accent/50',
                  )}
                  style={{ borderRight: `6px solid ${agent.color || 'transparent'}`, borderRadius: agent.color ? '6px 0 0 6px' : undefined }}
                  onClick={() => handleSelect(agent)}
                >
                  {/* Top row: name + controls */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={agent.status} />
                        <span className="text-sm font-medium truncate">
                          {agent.label || agent.name}
                        </span>
                      </div>
                    </div>

                    {/* Controls top-right */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {agent.status === 'active' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => handleStop(e, agent)}
                          className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground disabled:opacity-50 transition-colors"
                          title="Stop"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => handleStart(e, agent)}
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
                          selectEntity(agent.id)
                          // See WorkspaceList — the list is its own step on mobile.
                          if (isMobile) { openM2('settings', agent.id) }
                          else { navigate(`/agents/${encodeURIComponent(agent.name || agent.id)}/settings/identity`) }
                        }}
                        className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground transition-colors"
                        title="Settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {agent.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5 pl-3.5">
                      {agent.description}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { X, Brain, Play, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox } from '../toolbox-context'
import { useAgentListData } from '@/hooks/useAgentListData'
import { useMenu } from '@/components/shell/menu-context'
import { useToast } from '@/components/ui/toast-container'
import { startAgent, stopAgent } from '@/services/agent'

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'active' ? 'bg-green-500' :
    status === 'error' ? 'bg-red-500' :
    status === 'starting' || status === 'stopping' ? 'bg-yellow-500' :
    'bg-zinc-400'
  return <span className={cn('inline-block w-2 h-2 rounded-full shrink-0', color)} title={status} />
}

interface AgentsPanelProps {
  onClose: () => void
}

export function AgentsPanel({ onClose }: AgentsPanelProps) {
  const { openAgentT2 } = useToolbox()
  const { setSection, openM2 } = useMenu()
  const { agents, isLoading, refresh } = useAgentListData(true)
  const { showToast } = useToast()
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const setBusy = (id: string, on: boolean) =>
    setBusyIds(prev => { const s = new Set(prev); on ? s.add(id) : s.delete(id); return s })

  const handleStart = async (e: React.MouseEvent, agent: any) => {
    e.stopPropagation()
    setBusy(agent.id, true)
    try {
      await startAgent(agent.id)
      refresh()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' })
    } finally {
      setBusy(agent.id, false)
    }
  }

  const handleStop = async (e: React.MouseEvent, agent: any) => {
    e.stopPropagation()
    setBusy(agent.id, true)
    try {
      await stopAgent(agent.id)
      refresh()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' })
    } finally {
      setBusy(agent.id, false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
        <span className="text-sm font-semibold">Agents</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && agents.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">Loading…</div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Brain className="w-8 h-8 opacity-30" />
            <span className="text-xs">No agents yet</span>
            <button
              type="button"
              onClick={() => { setSection('agents'); openM2('form', null) }}
              className="text-xs text-primary hover:underline"
            >
              Create an agent
            </button>
          </div>
        ) : (
          <div className="space-y-1 px-2">
            {agents.map(agent => {
              const isBusy = busyIds.has(agent.id)
              return (
                <div
                  key={agent.id}
                  className="group relative rounded-md px-3 py-2.5 cursor-pointer transition-colors bg-card hover:bg-accent/50"
                  style={{ borderRight: `3px solid ${agent.color || 'transparent'}` }}
                  onClick={() => openAgentT2(agent.id)}
                >
                  <div className="flex items-center gap-2">
                    <StatusDot status={agent.status} />
                    <span className="text-sm font-medium flex-1 truncate">
                      {agent.label || agent.name}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {agent.status === 'active' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={e => handleStop(e, agent)}
                          className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground disabled:opacity-50"
                          title="Stop"
                        >
                          <Square className="w-3 h-3" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={e => handleStart(e, agent)}
                          className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted-foreground/10 text-muted-foreground disabled:opacity-50"
                          title="Start"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {agent.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5 pl-4">
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

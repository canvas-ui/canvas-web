import { X, Brain } from 'lucide-react'

interface AgentsPanelProps {
  onClose: () => void
}

export function AgentsPanel({ onClose }: AgentsPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-12 bg-zinc-900 shrink-0">
        <span className="text-sm font-medium text-zinc-100">Agents</span>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
          <Brain className="w-8 h-8 opacity-30" />
          <span className="text-xs">No agents available</span>
        </div>
      </div>
    </div>
  )
}

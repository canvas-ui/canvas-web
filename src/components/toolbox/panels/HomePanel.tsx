import { X, Bell, Clock, Plus, StickyNote, Link as LinkIcon, Upload } from 'lucide-react'
import { useToolbox, type AddKind } from '../toolbox-context'

interface HomePanelProps {
  onClose: () => void
}

const CREATE_ACTIONS: { kind: AddKind; label: string; icon: typeof StickyNote }[] = [
  { kind: 'note', label: 'Note', icon: StickyNote },
  { kind: 'link', label: 'Link', icon: LinkIcon },
  { kind: 'file', label: 'File', icon: Upload },
]

export function HomePanel({ onClose }: HomePanelProps) {
  const { openAdd } = useToolbox()
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-12 bg-zinc-900 shrink-0">
        <span className="text-sm font-medium text-zinc-100">Home</span>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Create — quick document actions, open the slim Add panel beside the content */}
      <div className="px-4 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Create
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CREATE_ACTIONS.map(({ kind, label, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => openAdd(kind)}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-border py-3 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Clock widget placeholder */}
      <div className="px-4 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="text-xs font-mono">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Notifications */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Notifications
          </span>
        </div>
        <div className="text-xs text-muted-foreground text-center py-10 border border-dashed rounded-lg">
          No notifications
        </div>
      </div>
    </div>
  )
}

import { Home, Wrench, Brain, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox, type T1View } from './toolbox-context'
import { HomePanel } from './panels/HomePanel'
import { ToolsPanel } from './panels/ToolsPanel'
import { AgentsPanel } from './panels/AgentsPanel'
import { AgentChatPanel } from './panels/AgentChatPanel'

const TABS: Array<{ view: Exclude<T1View, null>; icon: LucideIcon; label: string }> = [
  { view: 'home', icon: Home, label: 'Home' },
  { view: 'tools', icon: Wrench, label: 'Tools' },
  { view: 'agents', icon: Brain, label: 'Agents' },
]

// The toolbox as a card — same "paper" chrome as B5Card/DocumentSideCard, so
// it sits inline as a flex sibling of the main content (shrinking it) rather
// than the old fixed dark rail docked outside ContentArea.
export function ToolboxPanel() {
  const { state, setView, closeT1, closeT2 } = useToolbox()
  const { t1Open, t1View, t2Open, t2AgentId } = state

  if (!t1Open || !t1View) return null

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-foreground shadow-elevation-4 md:w-[min(420px,90vw)]"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-1 border-b px-2">
        <div className="flex items-center gap-1">
          {TABS.map(({ view, icon: Icon, label }) => (
            <button
              key={view}
              type="button"
              onClick={() => setView(view)}
              aria-label={label}
              title={label}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                t1View === view
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={closeT1}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close toolbox"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {t1View === 'home' && <HomePanel />}
        {t1View === 'tools' && <ToolsPanel />}
        {t1View === 'agents' && <AgentsPanel />}

        {/* T2 — agent chat overlay */}
        {t2Open && t2AgentId && (
          <div className="absolute inset-0 z-10 flex flex-col bg-background">
            <AgentChatPanel agentId={t2AgentId} onClose={closeT2} />
          </div>
        )}
      </div>
    </div>
  )
}

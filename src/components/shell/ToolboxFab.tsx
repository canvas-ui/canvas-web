import { Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox } from '@/components/toolbox/toolbox-context'

// Single entry point into the toolbox — biggest button on screen, fixed to
// the viewport (not the layout flow) so it stays reachable on small/mobile
// screens regardless of scroll position. `env(safe-area-inset-bottom)`
// keeps it clear of Android gesture-nav / iOS home-indicator bars in PWA mode.
export function ToolboxFab() {
  const { state, setView, closeT1 } = useToolbox()
  const isOpen = state.t1Open

  return (
    <button
      type="button"
      onClick={() => (isOpen ? closeT1() : setView('tools'))}
      aria-label={isOpen ? 'Close toolbox' : 'Open toolbox'}
      title={isOpen ? 'Close toolbox' : 'Open toolbox'}
      className={cn(
        'fixed z-50 flex h-16 w-16 items-center justify-center rounded-full shadow-elevation-4 transition-colors',
        'bottom-[max(1rem,env(safe-area-inset-bottom))] right-6',
        isOpen ? 'bg-primary text-primary-foreground' : 'bg-zinc-900 text-white hover:bg-zinc-800',
      )}
    >
      <Wrench className="h-6 w-6" />
    </button>
  )
}

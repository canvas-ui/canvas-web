import { Home, Wrench, Brain, LayoutDashboard, Layers3, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox, type T1View } from '@/components/toolbox/toolbox-context'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface T0ButtonProps {
  icon: React.ReactNode
  label: string
  isActive: boolean
  onClick: () => void
}

function T0Button({ icon, label, isActive, onClick }: T0ButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
            isActive
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800',
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r" />
          )}
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function ToolBar() {
  const { state, toggleView } = useToolbox()
  const { t1View, activeContextPath, activeContextType } = state

  const handleToggle = (view: T1View) => toggleView(view)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col items-center w-[var(--t0-width)] h-full bg-zinc-900 border-l border-zinc-800 shrink-0">
        <div className="flex flex-col items-center gap-1 py-3 flex-1">
          <T0Button
            icon={<Home className="w-4 h-4" />}
            label="Home"
            isActive={t1View === 'home'}
            onClick={() => handleToggle('home')}
          />

          {/* Context / canvas indicator — shown when navigated to a canvas or context */}
          {activeContextType && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleToggle('tools')}
                  className={cn(
                    'flex items-center justify-center w-9 h-6 rounded-md transition-colors',
                    activeContextType === 'canvas'
                      ? 'bg-violet-600/30 text-violet-300 hover:bg-violet-600/50'
                      : 'bg-blue-600/30 text-blue-300 hover:bg-blue-600/50',
                  )}
                >
                  {activeContextType === 'canvas' ? (
                    <LayoutDashboard className="w-3 h-3" />
                  ) : (
                    <Layers3 className="w-3 h-3" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8}>
                {activeContextType === 'canvas' ? 'Canvas' : 'Context'}: {activeContextPath}
              </TooltipContent>
            </Tooltip>
          )}

          <div className="w-5 h-px bg-zinc-800 my-1" />

          <T0Button
            icon={<Wrench className="w-4 h-4" />}
            label="Tools"
            isActive={t1View === 'tools'}
            onClick={() => handleToggle('tools')}
          />
          <T0Button
            icon={<Brain className="w-4 h-4" />}
            label="Agents"
            isActive={t1View === 'agents'}
            onClick={() => handleToggle('agents')}
          />
        </div>

        {/* Bottom — voice / toggle mode placeholder */}
        <div className="py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center w-9 h-9 rounded-full text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                <Mic className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              Voice mode (coming soon)
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}

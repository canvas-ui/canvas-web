import { type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface M2NavItem {
  id: string
  label: string
  description?: string
  icon: ReactNode
}

// Settings sections live in M2 as a nav list; the content area renders one
// section at a time. Both workspaces and agents use this, so the two settings
// surfaces stay identical in shape no matter how many sections they grow.
export function M2SettingsNav({
  items,
  activeId,
  onSelect,
}: {
  items: readonly M2NavItem[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto py-2">
      <div className="space-y-1 px-2">
        {items.map(item => {
          const isActive = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors',
                isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <span className={cn('shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                {item.description && (
                  <span className="block truncate text-[11px] text-muted-foreground">{item.description}</span>
                )}
              </span>
              <ChevronRight className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'opacity-100' : 'opacity-0')} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

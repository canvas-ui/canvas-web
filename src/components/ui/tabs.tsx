import type { LucideIcon } from 'lucide-react'

export interface TabDef<T extends string = string> {
  id: T
  label: string
  icon?: LucideIcon
}

interface TabBarProps<T extends string> {
  tabs: TabDef<T>[]
  active: T
  onChange: (id: T) => void
  className?: string
}

// Shared underline-style tab bar (extracted from the document detail modal so
// every tabbed surface renders identically). Purely presentational — callers
// own the active-tab state and render the panel themselves.
export function TabBar<T extends string>({ tabs, active, onChange, className = '' }: TabBarProps<T>) {
  return (
    <div className={`flex gap-1 border-b overflow-x-auto ${className}`}>
      {tabs.map((t) => {
        const Icon = t.icon
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              active === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

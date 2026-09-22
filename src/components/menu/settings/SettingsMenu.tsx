import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useMenu } from '@/components/shell/use-menu'
import { SETTINGS_GROUPS, matchesSettingsQuery } from '@/lib/settings-catalog'

export function SettingsMenu() {
  const location = useLocation()
  const { state } = useMenu()
  const [query, setQuery] = useState('')
  const groups = SETTINGS_GROUPS.filter(group => group.id !== 'server' || state.user?.userType === 'admin')
    .map(group => ({ ...group, items: group.items.filter(item => matchesSettingsQuery(query, group.label, item.label, item.description)) }))
    .filter(group => group.items.length)
  return (
    <nav aria-label="Settings" className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <Link to="/settings" aria-current={location.pathname === '/settings' ? 'page' : undefined} className="flex items-center gap-2 rounded-md p-1 text-sm font-semibold hover:text-primary">
          <LayoutGrid className="h-4 w-4" />All settings
        </Link>
        <Input type="search" aria-label="Search settings menu" placeholder="Find a setting…" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-2">
        {groups.map(group => (
          <section key={group.id} aria-label={group.label}>
            <h2 className="px-3 py-2 text-xs font-semibold text-muted-foreground">{group.label}</h2>
            {group.items.map(({ path, icon: Icon, label, description }) => (
              <Link key={path} to={path} aria-current={location.pathname === path ? 'page' : undefined}
                className={cn('flex items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent/50', location.pathname === path && 'bg-accent')}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span></span>
              </Link>
            ))}
          </section>
        ))}
        {!groups.length && <p role="status" className="p-3 text-sm text-muted-foreground">No settings match. Try “cache”, “model” or “token”.</p>}
        <Link to="/settings#workspace" className="block rounded-md border p-3 text-sm hover:bg-accent/50">Workspace, context & agent settings<span className="mt-1 block text-xs text-muted-foreground">Choose what you want to configure.</span></Link>
      </div>
    </nav>
  )
}

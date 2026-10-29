import { Globe, Layers3, Monitor, Trash2 } from 'lucide-react'
import { groupApps, type AppCatalogEntry } from '@/lib/app-catalog'

/** Shared categorized launcher; web and native hosts supply entries and launch actions. */
export function AppsList({ apps, query, activeId, onLaunch, onRemove }: {
  apps: AppCatalogEntry[]
  query: string
  activeId?: string
  onLaunch: (app: AppCatalogEntry) => void
  onRemove?: (app: AppCatalogEntry) => void
}) {
  const groups = groupApps(apps, query)
  return <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
    {groups.map(group => <section key={group.id} aria-label={group.label}>
      <h3 className="px-2 py-2 text-xs font-semibold text-muted-foreground">{group.label}</h3>
      {group.apps.map(app => {
        const Icon = app.kind === 'web' ? Globe : app.kind === 'desktop' ? Monitor : Layers3
        return <div key={app.id} className="flex items-center gap-1">
          <button type="button" onClick={() => onLaunch(app)} aria-current={activeId === app.id ? 'page' : undefined}
            className={`flex min-w-0 flex-1 items-start gap-2 rounded-md p-2 text-left hover:bg-accent/50 ${activeId === app.id ? 'bg-accent' : ''}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{app.name}</span>
              <span className="block text-xs text-muted-foreground">{app.description}</span>
              <span className="mt-1 block text-[10px] text-muted-foreground">{app.kind === 'canvas' ? 'Canvas' : app.kind === 'web' ? 'Web app · opens in browser' : 'Desktop app'}</span>
            </span>
          </button>
          {app.kind === 'web' && onRemove && <button type="button" onClick={() => onRemove(app)} aria-label={`Remove ${app.name}`} className="rounded p-2 text-muted-foreground hover:bg-accent"><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      })}
    </section>)}
    {!groups.length && <p role="status" className="p-3 text-sm text-muted-foreground">No matching apps.</p>}
  </div>
}

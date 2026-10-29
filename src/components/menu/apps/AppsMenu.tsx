import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { APPLETS } from '@/components/toolbox/applets/registry'
import { useAppletTarget } from '@/components/toolbox/applets/use-applet-target'
import { useMenu } from '@/components/shell/use-menu'
import { MenuBackButton } from '@/components/menu/shared/MenuBackButton'
import { APP_CATEGORIES, webAppUrl, type AppCatalogEntry, type AppCategory } from '@/lib/app-catalog'
import { AppsList } from './AppsList'

const KEY = 'canvas:webApps'
function readWebApps(): AppCatalogEntry[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((item): item is AppCatalogEntry => {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.description !== 'string' || item.kind !== 'web' || !APP_CATEGORIES.some(category => category.id === item.category)) return false
      try { return typeof item.target === 'string' && !!webAppUrl(item.target) } catch { return false }
    })
  } catch { return [] }
}

export function AppsMenu() {
  const { navigateFromMenu } = useMenu()
  const location = useLocation()
  const target = useAppletTarget()
  const [query, setQuery] = useState('')
  const [webApps, setWebApps] = useState(readWebApps)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const refresh = () => setWebApps(readWebApps())
    window.addEventListener('storage', refresh)
    window.addEventListener('canvas:apps-changed', refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('canvas:apps-changed', refresh) }
  }, [])
  const save = (apps: AppCatalogEntry[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(apps)); setWebApps(apps); window.dispatchEvent(new Event('canvas:apps-changed')); return true }
    catch { setError('Unable to save web apps on this device.'); return false }
  }
  const apps: AppCatalogEntry[] = [...APPLETS.map(app => ({
    id: `canvas:${app.id}`, name: app.label, description: app.description, category: app.category,
    kind: 'canvas' as const, target: `/apps/${app.id}`,
  })), ...webApps]
  const launch = (app: AppCatalogEntry) => {
    if (app.kind === 'web') { window.open(webAppUrl(app.target), '_blank', 'noopener,noreferrer'); return }
    const params = new URLSearchParams()
    if (location.pathname.startsWith('/apps/')) {
      const current = new URLSearchParams(location.search)
      for (const key of ['context', 'workspace', 'path', 'tree']) if (current.has(key)) params.set(key, current.get(key)!)
    } else if (target?.mode === 'context') params.set('context', target.contextId)
    else if (target?.mode === 'workspace') {
      params.set('workspace', target.workspaceName); params.set('path', target.path); params.set('tree', target.treeName)
    }
    navigateFromMenu(`${app.target}${params.size ? `?${params}` : ''}`)
  }
  return <nav aria-label="Apps" className="flex h-full min-h-0 flex-col">
    <div className="shrink-0 space-y-3 border-b p-3">
      <div className="flex items-center gap-2"><MenuBackButton /><h2 className="flex-1 text-sm font-semibold">Apps</h2>
        <button type="button" aria-label="Add web app" title="Add web app" onClick={() => { setAdding(!adding); setError('') }} className="rounded p-1 hover:bg-accent"><Plus className="h-4 w-4" /></button>
      </div>
      <input type="search" aria-label="Search apps" placeholder="Find an app…" value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
      {adding && <form className="space-y-2" onSubmit={event => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        try {
          const name = String(fields.get('name') || '').trim()
          if (!name) throw new Error('Enter an app name.')
          const app: AppCatalogEntry = { id: `web:${crypto.randomUUID()}`, name, description: '', category: fields.get('category') as AppCategory, kind: 'web', target: webAppUrl(String(fields.get('url') || '')) }
          if (save([...readWebApps(), app])) { setAdding(false); setError('') }
        } catch (error) { setError(error instanceof Error ? error.message : 'Unable to add app.') }
      }}>
        <input name="name" required aria-label="App name" placeholder="App name" className="w-full rounded border bg-background p-1 text-sm" />
        <input name="url" type="url" required aria-label="App URL" placeholder="https://…" className="w-full rounded border bg-background p-1 text-sm" />
        <select name="category" aria-label="App category" className="w-full rounded border bg-background p-1 text-sm">{APP_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select>
        <p className="text-xs text-muted-foreground">Saved on this device. Opens in your browser.</p>
        <button type="submit" className="rounded border px-2 py-1 text-sm hover:bg-accent">Add app</button>
      </form>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
    <AppsList apps={apps} query={query} activeId={apps.find(app => app.kind === 'canvas' && app.target === location.pathname)?.id} onLaunch={launch}
      onRemove={app => { save(readWebApps().filter(item => item.id !== app.id)) }} />
  </nav>
}

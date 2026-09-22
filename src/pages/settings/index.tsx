import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/common/page-header'
import { Input } from '@/components/ui/input'
import { useMenu } from '@/components/shell/use-menu'
import { SETTINGS_GROUPS, matchesSettingsQuery } from '@/lib/settings-catalog'
import { WORKSPACE_SETTINGS_SECTIONS, CONTEXT_SETTINGS_SECTIONS, AGENT_SETTINGS_SECTIONS } from '@/lib/settings-sections'
import { listWorkspaces } from '@/services/workspace'
import { listContexts } from '@/services/context'
import { listAgents } from '@/services/agent'

type Choice = { id: string; label: string }
const ENTITY_GROUPS = [
  { id: 'workspace', label: 'Workspace', path: 'workspaces', description: 'Files, search, devices and sharing for one workspace. These settings override account defaults.', sections: WORKSPACE_SETTINGS_SECTIONS, load: async () => (await listWorkspaces()).map(w => ({ id: w.name, label: w.label || w.name })) },
  { id: 'context', label: 'Context', path: 'contexts', description: 'Choose the tree and path a context opens, and who can access that view. File storage belongs to its workspace.', sections: CONTEXT_SETTINGS_SECTIONS, load: async () => (await listContexts()).map(c => ({ id: c.id, label: c.name || c.id })) },
  { id: 'agent', label: 'Agent', path: 'agents', description: 'Configure one assistant: its instructions, chat model, tools and access to Canvas.', sections: AGENT_SETTINGS_SECTIONS, load: async () => (await listAgents()).map(a => ({ id: a.id, label: a.label || a.name })) },
] as const

function SettingCard({ to, label, description, icon: Icon }: { to: string; label: string; description: string; icon: LucideIcon }) {
  return <Link to={to} className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span></span>
    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
  </Link>
}

function EntitySettings({ group, query }: { group: typeof ENTITY_GROUPS[number]; query: string }) {
  const [choices, setChoices] = useState<Choice[]>([])
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    group.load().then(items => {
      if (!cancelled) { setChoices(items); setStatus('ready') }
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [group, attempt])
  const sections = group.sections.filter(item => matchesSettingsQuery(query, group.label, item.label, item.description))
  if (!sections.length) return null
  return <section id={group.id} className="scroll-mt-6 space-y-3">
    <h2 className="text-lg font-semibold">{group.label}</h2>
    <p className="text-sm text-muted-foreground">{group.description}</p>
    <label className="block max-w-md text-sm font-medium">
      Choose a {group.label.toLowerCase()}
      <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selected} disabled={status !== 'ready' || !choices.length} onChange={event => setSelected(event.target.value)}>
        <option value="">{status === 'loading' ? 'Loading…' : status === 'error' ? 'Unable to load list' : choices.length ? `Select ${group.label.toLowerCase()}…` : `No ${group.path} available`}</option>
        {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
    </label>
    {status === 'error' && <p role="status" className="text-sm text-muted-foreground">The list could not be loaded. <button type="button" className="underline" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>Retry</button></p>}
    <details open={Boolean(selected || query.trim())}>
      <summary className="cursor-pointer py-2 text-sm text-muted-foreground">{selected ? `Settings for ${choices.find(choice => choice.id === selected)?.label || selected}` : `What you can configure (${sections.length})`}</summary>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
      {sections.map(item => selected
        ? <SettingCard key={item.id} to={`/${group.path}/${encodeURIComponent(selected)}/settings/${item.id}`} {...item} />
        : <div key={item.id} className="rounded-lg border border-dashed p-4"><p className="text-sm font-medium">{item.label}</p><p className="mt-1 text-sm text-muted-foreground">{item.description}</p></div>)}
    </div>
    </details>
  </section>
}

export default function SettingsPage() {
  const { state } = useMenu()
  const [query, setQuery] = useState('')
  const groups = SETTINGS_GROUPS.filter(group => group.id !== 'server' || state.user?.userType === 'admin')
    .map(group => ({ ...group, items: group.items.filter(item => matchesSettingsQuery(query, group.label, item.label, item.description)) }))
    .filter(group => group.items.length)
  const hasEntityMatches = ENTITY_GROUPS.some(group => group.sections.some(item => matchesSettingsQuery(query, group.label, item.label, item.description)))
  return <div className="mx-auto max-w-6xl space-y-8 pb-8 max-md:pb-rail-stack">
    <PageHeader title="Settings" description="Start with what you want to change. Each section explains where your changes apply." />
    <Input type="search" className="max-w-xl" aria-label="Search all settings" placeholder="Find a setting: offline, folders, models, sharing…" value={query} onChange={event => setQuery(event.target.value)} />
    {groups.filter(group => group.id === 'device' || group.id === 'account').map(group => <section key={group.id} className="space-y-3">
      <h2 className="text-lg font-semibold">{group.label}</h2><p className="text-sm text-muted-foreground">{group.description}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">{group.items.map(item => <SettingCard key={item.path} to={item.path} {...item} />)}</div>
    </section>)}
    {ENTITY_GROUPS.map(group => <EntitySettings key={group.id} group={group} query={query} />)}
    {groups.filter(group => group.id === 'server' || group.id === 'information').map(group => <section key={group.id} className="space-y-3">
      <h2 className="text-lg font-semibold">{group.label}</h2><p className="text-sm text-muted-foreground">{group.description}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">{group.items.map(item => <SettingCard key={item.path} to={item.path} {...item} />)}</div>
    </section>)}
    {!groups.length && !hasEntityMatches && <p role="status" className="text-sm text-muted-foreground">No settings match “{query}”. Try a shorter phrase or clear the search.</p>}
  </div>
}

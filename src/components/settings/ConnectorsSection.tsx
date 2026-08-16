import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import {
  listBackends, addBackend, updateBackend, removeBackend, syncBackend,
  type Backend,
} from '@/services/workspace'

/**
 * Workspace Settings › Data Backends › Connectors — poll-synced external
 * sources (GitHub issues, Slack, Google Calendar, MS Teams). Read-only
 * mirrors into the backends tree; server-side model in canvas-server
 * docs/connectors.md. Secrets are write-only: the server redacts them to
 * `true` in reads, and leaving a secret field empty on edit keeps the stored
 * value.
 */

interface FieldSpec {
  key: string
  label: string
  placeholder?: string
  hint?: string
  secret?: boolean
  list?: boolean
  bool?: boolean
  required?: boolean
}

const DRIVERS: Record<string, { label: string; icon: string; blurb: string; fields: FieldSpec[] }> = {
  github: {
    label: 'GitHub Issues',
    icon: 'mdi:github',
    blurb: 'Issues from the listed repos sync as todos. Token optional for public repos.',
    fields: [
      { key: 'address', label: 'Account label', placeholder: 'e.g. canvas-ui', required: true },
      { key: 'token', label: 'Personal access token', hint: 'Optional for public repos; required for write-back.', secret: true },
      { key: 'repos', label: 'Repositories', placeholder: 'owner/repo, one per line', hint: 'Issues from each repo sync as todos.', list: true, required: true },
      { key: 'writeBack', label: 'Manage issues from Canvas', hint: 'Create, edit and close issues — needs a PAT with repo scope.', bool: true },
    ],
  },
  slack: {
    label: 'Slack',
    icon: 'mdi:slack',
    blurb: 'Channel messages sync as message documents. Bot/user token with channels:read + channels:history.',
    fields: [
      { key: 'address', label: 'Workspace label', placeholder: 'e.g. acme', required: true },
      { key: 'token', label: 'Token (xoxb-… / xoxp-…)', secret: true, required: true },
      { key: 'channels', label: 'Channels (names or ids, empty = all joined)', list: true },
    ],
  },
  gcal: {
    label: 'Google Calendar',
    icon: 'mdi:calendar-month',
    blurb: 'Events sync as calendar entries (recurring series kept as series). Offline-access OAuth credentials.',
    fields: [
      { key: 'address', label: 'Account label', placeholder: 'e.g. me-gmail', required: true },
      { key: 'clientId', label: 'OAuth client id', required: true },
      { key: 'clientSecret', label: 'OAuth client secret', secret: true, required: true },
      { key: 'refreshToken', label: 'Refresh token', secret: true, required: true },
      { key: 'calendars', label: 'Calendar ids (empty = primary)', list: true },
    ],
  },
  caldav: {
    label: 'CalDAV',
    icon: 'mdi:calendar-sync',
    blurb: 'Any CalDAV endpoint (GroupOffice, Nextcloud, Radicale, SOGo…). Read-only by default — enable write-back to create events from Canvas.',
    fields: [
      { key: 'address', label: 'Account label', placeholder: 'e.g. groupoffice', required: true },
      { key: 'url', label: 'CalDAV URL (calendar home or one calendar)', placeholder: 'https://host/caldav/user', required: true },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password', secret: true },
      { key: 'calendars', label: 'Calendars (names, empty = all)', list: true },
      { key: 'writeBack', label: 'Create events from Canvas', hint: 'Write-back into the CalDAV calendar.', bool: true },
    ],
  },
  teams: {
    label: 'MS Teams',
    icon: 'mdi:microsoft-teams',
    blurb: 'Channel messages via Microsoft Graph (app-only credentials, admin-consented ChannelMessage.Read.All).',
    fields: [
      { key: 'address', label: 'Tenant label', placeholder: 'e.g. corp', required: true },
      { key: 'tenantId', label: 'Tenant id', required: true },
      { key: 'clientId', label: 'Client id', required: true },
      { key: 'clientSecret', label: 'Client secret', secret: true, required: true },
      { key: 'teams', label: 'Team ids (one per line)', list: true, required: true },
    ],
  },
}

function parseList(value: string): string[] {
  return value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
}

export function ConnectorsSection({ workspaceId }: { workspaceId: string }) {
  const { showToast } = useToast()
  const [connectors, setConnectors] = useState<Backend[]>([])
  const [adding, setAdding] = useState<string | null>(null) // driver being configured
  const [editing, setEditing] = useState<Backend | null>(null) // existing connector being edited (null = adding new)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const backends = await listBackends(workspaceId).catch(() => [] as Backend[])
    setConnectors(backends.filter((b) => b.kind === 'connector'))
  }, [workspaceId])

  const refresh = async () => {
    setRefreshing(true)
    try { await load() } finally { setRefreshing(false) }
  }

  useEffect(() => {
    let cancelled = false
    listBackends(workspaceId)
      .then((backends) => { if (!cancelled) setConnectors(backends.filter((b) => b.kind === 'connector')) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [workspaceId])

  // Freshly added/synced connectors flip status quickly — follow up briefly.
  const anySyncing = connectors.some((c) => c.status === 'syncing')
  useEffect(() => {
    if (!anySyncing) return
    const timer = setInterval(() => { void load() }, 4000)
    return () => clearInterval(timer)
  }, [anySyncing, load])

  // Prefill the form from a connector's (secret-redacted) config. Secrets stay
  // blank — the server keeps the stored value when a secret is omitted.
  const openEdit = (c: Backend) => {
    const spec = DRIVERS[c.driver]
    if (!spec) return
    const cfg = (c.config || {}) as Record<string, unknown>
    const next: Record<string, string> = {}
    for (const field of spec.fields) {
      if (field.key === 'address') { next.address = c.address; continue }
      if (field.secret) continue
      if (field.key === 'writeBack') { next.writeBack = cfg.readOnly === false ? 'true' : ''; continue }
      const value = cfg[field.key]
      if (field.list) { next[field.key] = Array.isArray(value) ? value.join('\n') : ''; continue }
      if (value !== undefined && value !== null) next[field.key] = String(value)
    }
    setForm(next)
    setAdding(c.driver)
    setEditing(c)
  }

  const closeForm = () => { setAdding(null); setEditing(null); setForm({}) }

  const submit = async () => {
    if (!adding) return
    const spec = DRIVERS[adding]
    const config: Record<string, unknown> = {}
    for (const field of spec.fields) {
      const raw = (form[field.key] || '').trim()
      if (!raw) {
        // A blank secret on edit keeps the stored value; the server merges the
        // patch, so lists/bools must be sent explicitly to be clearable.
        if (field.required && !(editing && field.secret)) { showToast({ title: `${field.label} is required`, variant: 'destructive' }); return }
        if (editing && !field.secret) config[field.key] = field.list ? [] : (field.bool ? false : '')
        continue
      }
      config[field.key] = field.list ? parseList(raw) : (field.bool ? raw === 'true' : raw)
    }
    // The UI asks the positive question; the server flag is readOnly.
    if (spec.fields.some((f) => f.key === 'writeBack')) {
      config.readOnly = config.writeBack !== true
      delete config.writeBack
    }
    setBusy(true)
    try {
      if (editing) await updateBackend(workspaceId, editing.driver, editing.address, config)
      else await addBackend(workspaceId, adding, config)
      closeForm()
      await load()
      showToast({ title: editing ? 'Connector updated — sync restarted' : 'Connector saved — first sync started' })
    } catch (err) {
      showToast({ title: 'Failed to save connector', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const sync = async (c: Backend) => {
    try {
      await syncBackend(workspaceId, c.driver, c.address)
      showToast({ title: `Syncing ${c.driver}/${c.address}` })
      setTimeout(() => { void load() }, 1500)
    } catch (err) {
      showToast({ title: 'Sync failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }

  const remove = async (c: Backend) => {
    if (!window.confirm(`Remove ${c.driver}/${c.address}? Synced documents stay in the backends tree until purged.`)) return
    try {
      await removeBackend(workspaceId, c.driver, c.address)
      await load()
    } catch (err) {
      showToast({ title: 'Remove failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Connectors</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            GitHub issues, Slack, Google Calendar, CalDAV and MS Teams — polled into the backends tree (read-only unless write-back is enabled).
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={refreshing} onClick={() => { void refresh() }} title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {connectors.length > 0 && (
        <div className="mt-3 space-y-2">
          {connectors.map((c) => {
            const spec = DRIVERS[c.driver]
            return (
              <div key={`${c.driver}:${c.address}`} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon icon={spec?.icon || 'mdi:cloud-sync'} width={16} height={16} className="shrink-0" />
                  <span className="text-sm font-medium">{spec?.label || c.driver}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.address}</span>
                  <span className="flex-1" />
                  <Button type="button" variant="outline" size="sm" disabled={c.status === 'syncing'} onClick={() => { void sync(c) }}>
                    <RefreshCw className={`mr-1 h-3 w-3 ${c.status === 'syncing' ? 'animate-spin' : ''}`} />
                    {c.status === 'syncing' ? 'Syncing' : 'Sync now'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(c)} title="Edit connector">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { void remove(c) }} title="Remove connector">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span>status: {c.status}</span>
                  {c.lastSyncAt && <span>last sync: {new Date(c.lastSyncAt).toLocaleString()}</span>}
                  {c.treePath && <span className="font-mono">{c.treePath}</span>}
                </div>
                {c.lastError && <p className="mt-1 text-[11px] text-destructive">{c.lastError}</p>}
              </div>
            )
          })}
        </div>
      )}

      {adding ? (
        <div className="mt-3 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Icon icon={DRIVERS[adding].icon} width={16} height={16} />
            <span className="text-sm font-medium">
              {editing ? `Edit ${DRIVERS[adding].label}` : DRIVERS[adding].label}
            </span>
            {editing && <span className="font-mono text-xs text-muted-foreground">{editing.address}</span>}
            <span className="flex-1" />
            <button type="button" onClick={closeForm} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Cancel">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{DRIVERS[adding].blurb}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {DRIVERS[adding].fields.map((field) => (
              <label key={field.key} className={`text-xs ${field.list || field.bool ? 'sm:col-span-2' : ''}`}>
                {!field.bool && <span className="text-muted-foreground">{field.label}</span>}
                {field.bool ? (
                  <span className="mt-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form[field.key] === 'true'}
                      onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.checked ? 'true' : '' }))}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{field.label}</span>
                  </span>
                ) : field.list ? (
                  <textarea
                    value={form[field.key] || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                ) : (
                  <Input
                    type={field.secret ? 'password' : 'text'}
                    value={form[field.key] || ''}
                    disabled={!!editing && field.key === 'address'}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={editing && field.secret ? 'Leave blank to keep current' : field.placeholder}
                    autoComplete="off"
                    className="mt-1 h-8 text-xs"
                  />
                )}
                {field.hint && <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{field.hint}</span>}
              </label>
            ))}
          </div>
          <Button type="button" size="sm" className="mt-3" disabled={busy} onClick={() => { void submit() }}>
            {busy ? 'Saving…' : (editing ? 'Save changes & sync' : 'Save & sync')}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(DRIVERS).map(([driver, spec]) => (
            <Button key={driver} type="button" variant="outline" size="sm" onClick={() => { setAdding(driver); setForm({}) }}>
              <Plus className="mr-1 h-3 w-3" />
              <Icon icon={spec.icon} width={14} height={14} className="mr-1" />
              {spec.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}

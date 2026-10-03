import { useSettingsMenuBack } from '@/components/common/use-settings-back'
import { PageHeader } from '@/components/common/page-header'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Loader2, Plus, RefreshCw, ShieldAlert, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { getCurrentUserFromToken } from '@/services/auth'
import {
  getAuthConfig,
  saveAuthConfig,
  testImapDomain,
  testLdapServer,
  type AuthConfig,
  type AuthTestResult,
  type AuthUserStatus,
  type AuthUserType,
  type ImapDomainConfig,
  type LdapServerConfig,
} from '@/services/auth-config'

/**
 * Server authentication backends — local passwords, IMAP and LDAP, i.e. the
 * server's `config/auth.json`. Admin-only on the server too; saving reloads
 * the strategies in place, so the next sign-in uses the new settings.
 *
 * The domain/server maps are edited as rows with a stable client id, so a
 * rename does not remount the row (and lose a typed-but-unsaved password).
 * LDAP bind passwords are write-only: the server only says whether one is set.
 */

type LdapRow = LdapServerConfig & { id: string; name: string; originalName: string | null }
type ImapRow = ImapDomainConfig & { id: string; domain: string }

interface Draft {
  allowUserRegistrations: boolean
  local: AuthConfig['strategies']['local']
  ldap: Omit<AuthConfig['strategies']['ldap'], 'servers'> & { servers: LdapRow[] }
  imap: Omit<AuthConfig['strategies']['imap'], 'domains'> & { domains: ImapRow[] }
}

let rowSeq = 0
const rowId = () => `row-${++rowSeq}`

function toDraft(c: AuthConfig): Draft {
  const { servers, ...ldap } = c.strategies.ldap
  const { domains, ...imap } = c.strategies.imap
  return {
    allowUserRegistrations: c.allowUserRegistrations,
    local: c.strategies.local,
    ldap: { ...ldap, servers: Object.entries(servers).map(([name, s]) => ({ ...s, id: rowId(), name, originalName: name })) },
    imap: { ...imap, domains: Object.entries(domains).map(([domain, d]) => ({ ...d, id: rowId(), domain })) },
  }
}

function ldapEntry(row: LdapRow): LdapServerConfig & { previousName?: string } {
  const { id: _id, name: _name, originalName, ...rest } = row
  return { ...rest, ...(originalName && originalName !== row.name ? { previousName: originalName } : {}) }
}

function fromDraft(d: Draft): AuthConfig {
  return {
    allowUserRegistrations: d.allowUserRegistrations,
    strategies: {
      local: d.local,
      ldap: {
        enabled: d.ldap.enabled,
        defaultUserType: d.ldap.defaultUserType,
        defaultStatus: d.ldap.defaultStatus,
        servers: Object.fromEntries(d.ldap.servers.map((r) => [r.name.trim(), ldapEntry(r)])),
      },
      imap: {
        enabled: d.imap.enabled,
        defaultUserType: d.imap.defaultUserType,
        defaultStatus: d.imap.defaultStatus,
        domains: Object.fromEntries(d.imap.domains.map(({ id: _id, domain, ...rest }) => [domain.trim().toLowerCase(), rest])),
      },
    },
  }
}

const NEW_LDAP: Omit<LdapRow, 'id' | 'name'> = {
  originalName: null,
  url: 'ldap://',
  bindDN: '',
  bindPasswordSet: false,
  bindPassword: undefined,
  searchBase: '',
  searchFilter: '(mail={{email}})',
  attributes: ['mail', 'cn', 'displayName', 'memberOf'],
  groupAttribute: 'memberOf',
  tls: false,
}

const NEW_IMAP: Omit<ImapRow, 'id'> = { domain: '', name: '', host: '', port: 993, secure: true, startTLS: false, requireAppPassword: false }

// ── Small form primitives ───────────────────────────────────────────────────

const selectClass = 'h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50'

function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Check({ checked, onChange, disabled, label, hint }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

function Section({ title, description, enabled, onToggle, disabled, children }: { title: string; description: ReactNode; enabled?: boolean; onToggle?: (v: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
        </div>
        {onToggle && (
          <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={!!enabled} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
            {enabled ? 'Enabled' : 'Disabled'}
          </label>
        )}
      </div>
      <div className={cn('mt-4 space-y-4', onToggle && !enabled && 'opacity-60')}>{children}</div>
    </section>
  )
}

function TestResult({ result }: { result: AuthTestResult | null }) {
  if (!result) return null
  return (
    <div className={cn('flex items-start gap-2 rounded-md border p-2 text-xs', result.ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5')}>
      {result.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
      <div className="min-w-0">
        <p>{result.message}</p>
        {result.user && result.user.groups.length > 0 && (
          <p className="mt-1 break-all text-muted-foreground">Groups: {result.user.groups.join(' · ')}</p>
        )}
      </div>
    </div>
  )
}

function NewUserDefaults({ value, onChange, disabled }: { value: { defaultUserType: AuthUserType; defaultStatus: AuthUserStatus }; onChange: (v: { defaultUserType?: AuthUserType; defaultStatus?: AuthUserStatus }) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4">
        <Field label="New accounts are">
          <select className={selectClass} value={value.defaultUserType} disabled={disabled} onChange={(e) => onChange({ defaultUserType: e.target.value as AuthUserType })}>
            <option value="user">Users</option>
            <option value="admin">Admins</option>
          </select>
        </Field>
        <Field label="Initial status">
          <select className={selectClass} value={value.defaultStatus} disabled={disabled} onChange={(e) => onChange({ defaultStatus: e.target.value as AuthUserStatus })}>
            <option value="active">Active — can sign in right away</option>
            <option value="pending">Pending — an admin activates them</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>
      {value.defaultUserType === 'admin' && (
        <p className="flex items-start gap-1.5 text-[11px] text-destructive">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Everyone who can sign in through this backend becomes a server admin on first login.
        </p>
      )}
    </div>
  )
}

// ── LDAP server row ─────────────────────────────────────────────────────────

function LdapServerCard({ row, index, onChange, onRemove, disabled }: { row: LdapRow; index: number; onChange: (patch: Partial<LdapRow>) => void; onRemove: () => void; disabled?: boolean }) {
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<AuthTestResult | null>(null)

  const runTest = async () => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await testLdapServer(row.originalName ?? row.name, ldapEntry(row), testEmail.trim() || undefined))
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const passwordState = row.bindPassword === null
    ? 'cleared on save'
    : typeof row.bindPassword === 'string'
      ? 'replaced on save'
      : row.bindPasswordSet ? 'stored — leave empty to keep it' : 'none set'

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-muted-foreground">#{index + 1}</span>
        <Input className="h-8 max-w-[14rem] font-mono text-sm" value={row.name} disabled={disabled} onChange={(e) => onChange({ name: e.target.value })} placeholder="primary" aria-label="Server name" />
        <div className="flex-1" />
        <Button type="button" size="sm" variant="ghost" onClick={onRemove} disabled={disabled} aria-label="Remove server">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Server URL" hint="ldap:// or ldaps://host:port">
          <Input className="h-8 font-mono text-sm" value={row.url} disabled={disabled} onChange={(e) => onChange({ url: e.target.value })} placeholder="ldaps://dc1.example.com:636" />
        </Field>
        <Field label="Search base">
          <Input className="h-8 font-mono text-sm" value={row.searchBase} disabled={disabled} onChange={(e) => onChange({ searchBase: e.target.value })} placeholder="ou=users,dc=example,dc=com" />
        </Field>
        <Field label="Bind DN" hint="Service account used to look users up. Empty = anonymous search.">
          <Input className="h-8 font-mono text-sm" value={row.bindDN} disabled={disabled} onChange={(e) => onChange({ bindDN: e.target.value })} placeholder="cn=canvas,ou=services,dc=example,dc=com" />
        </Field>
        <Field label="Bind password" hint={<>Currently: {passwordState}{row.bindPasswordSet && row.bindPassword !== null && (
          <> · <button type="button" className="underline hover:text-foreground" disabled={disabled} onClick={() => onChange({ bindPassword: null })}>clear</button></>
        )}</>}>
          <Input
            className="h-8 text-sm"
            type="password"
            autoComplete="new-password"
            value={typeof row.bindPassword === 'string' ? row.bindPassword : ''}
            disabled={disabled}
            onChange={(e) => onChange({ bindPassword: e.target.value === '' ? undefined : e.target.value })}
            placeholder={row.bindPasswordSet && row.bindPassword !== null ? '••••••••' : ''}
          />
        </Field>
        <Field label="User search filter" hint={<><span className="font-mono">{'{{email}}'}</span> is replaced by the address typed at sign-in.</>}>
          <Input className="h-8 font-mono text-sm" value={row.searchFilter} disabled={disabled} onChange={(e) => onChange({ searchFilter: e.target.value })} />
        </Field>
        <Field label="Group attribute" hint="Group memberships drive team workspace sharing.">
          <Input className="h-8 font-mono text-sm" value={row.groupAttribute} disabled={disabled} onChange={(e) => onChange({ groupAttribute: e.target.value })} placeholder="memberOf" />
        </Field>
        <Field label="Attributes to read" hint="Comma-separated." className="sm:col-span-2">
          <Input
            className="h-8 font-mono text-sm"
            value={row.attributes.join(', ')}
            disabled={disabled}
            onChange={(e) => onChange({ attributes: e.target.value.split(',').map((a) => a.trim()).filter(Boolean) })}
          />
        </Field>
      </div>
      <Check
        checked={row.tls}
        disabled={disabled}
        onChange={(tls) => onChange({ tls })}
        label="Accept self-signed certificates"
        hint="Skips certificate verification for ldaps://. Only for directories with a private CA."
      />
      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <Field label="Test" hint="Binds with the settings above (unsaved edits included). Add an e-mail to also look that user up." className="min-w-[14rem] flex-1">
          <Input className="h-8 text-sm" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="someone@example.com (optional)" />
        </Field>
        <Button type="button" size="sm" variant="outline" onClick={runTest} disabled={testing || disabled} className="mb-5">
          {testing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Test connection
        </Button>
      </div>
      <TestResult result={result} />
    </div>
  )
}

// ── IMAP domain row ─────────────────────────────────────────────────────────

function ImapDomainCard({ row, onChange, onRemove, disabled }: { row: ImapRow; onChange: (patch: Partial<ImapRow>) => void; onRemove: () => void; disabled?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<AuthTestResult | null>(null)

  const runTest = async () => {
    setTesting(true)
    setResult(null)
    try {
      const { id: _id, domain: _domain, ...domain } = row
      setResult(await testImapDomain(domain, email.trim(), password))
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
      setPassword('')
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">@</span>
        <Input className="h-8 max-w-[16rem] font-mono text-sm" value={row.domain} disabled={disabled} onChange={(e) => onChange({ domain: e.target.value })} placeholder="example.com" aria-label="E-mail domain" />
        <div className="flex-1" />
        <Button type="button" size="sm" variant="ghost" onClick={onRemove} disabled={disabled} aria-label="Remove domain">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem_1fr]">
        <Field label="IMAP host">
          <Input className="h-8 font-mono text-sm" value={row.host} disabled={disabled} onChange={(e) => onChange({ host: e.target.value })} placeholder="imap.example.com" />
        </Field>
        <Field label="Port">
          <Input className="h-8 text-sm" type="number" min={1} max={65535} value={row.port} disabled={disabled} onChange={(e) => onChange({ port: Number(e.target.value) })} />
        </Field>
        <Field label="Label on the sign-in form" hint="Optional.">
          <Input className="h-8 text-sm" value={row.name} disabled={disabled} onChange={(e) => onChange({ name: e.target.value })} placeholder="Example Mail" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Check checked={row.secure} disabled={disabled} onChange={(secure) => onChange({ secure, ...(secure ? { startTLS: false } : {}) })} label="TLS from the start" hint="Usually port 993." />
        <Check checked={row.startTLS} disabled={disabled || row.secure} onChange={(startTLS) => onChange({ startTLS })} label="Require STARTTLS" hint="Plain port 143 upgraded to TLS." />
        <Check checked={row.requireAppPassword} disabled={disabled} onChange={(requireAppPassword) => onChange({ requireAppPassword })} label="Needs an app password" hint="Shown as a hint on the sign-in form." />
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <Field label="Test sign-in" hint="A real IMAP login with these credentials, logged straight out. Nothing is stored." className="min-w-[12rem] flex-1">
          <Input className="h-8 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`someone@${row.domain || 'example.com'}`} />
        </Field>
        <Field label="Password" className="mb-5 min-w-[10rem] flex-1">
          <Input className="h-8 text-sm" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="button" size="sm" variant="outline" onClick={runTest} disabled={testing || disabled || !email || !password} className="mb-5">
          {testing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Test
        </Button>
      </div>
      <TestResult result={result} />
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function AdminAuthPage() {
  const backToSettings = useSettingsMenuBack()
  const { showToast } = useToast()
  const isAdmin = getCurrentUserFromToken()?.userType === 'admin'
  const [configPath, setConfigPath] = useState('')
  const [saved, setSaved] = useState<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveErrors, setSaveErrors] = useState<string | null>(null)

  const load = useCallback(() => (
    getAuthConfig()
      .then((res) => {
        const d = toDraft(res.config)
        setConfigPath(res.configPath)
        setSaved(d)
        setDraft(d)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load auth configuration'))
      .finally(() => setLoading(false))
  ), [])

  useEffect(() => { if (isAdmin) void load() }, [isAdmin, load])

  const dirty = useMemo(() => !!draft && !!saved && JSON.stringify(fromDraft(draft)) !== JSON.stringify(fromDraft(saved)), [draft, saved])

  const patch = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d))
  const patchLdapRow = (id: string, p: Partial<LdapRow>) => patch((d) => ({ ...d, ldap: { ...d.ldap, servers: d.ldap.servers.map((r) => (r.id === id ? { ...r, ...p } : r)) } }))
  const patchImapRow = (id: string, p: Partial<ImapRow>) => patch((d) => ({ ...d, imap: { ...d.imap, domains: d.imap.domains.map((r) => (r.id === id ? { ...r, ...p } : r)) } }))

  const save = async () => {
    if (!draft) return
    const names = draft.ldap.servers.map((r) => r.name.trim())
    const domains = draft.imap.domains.map((r) => r.domain.trim().toLowerCase())
    if (names.some((n) => !n) || new Set(names).size !== names.length) { setSaveErrors('Every LDAP server needs a unique name.'); return }
    if (domains.some((n) => !n) || new Set(domains).size !== domains.length) { setSaveErrors('Every IMAP domain must be filled in and listed once.'); return }
    setSaving(true)
    setSaveErrors(null)
    try {
      const res = await saveAuthConfig(fromDraft(draft))
      const d = toDraft(res.config)
      setSaved(d)
      setDraft(d)
      showToast({ title: 'Authentication settings saved', description: 'Applied immediately — the next sign-in uses them.' })
    } catch (err) {
      setSaveErrors(err instanceof Error ? err.message.replace(/^HTTP \d+:\s*/, '') : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const header = (
    <PageHeader onBack={backToSettings}
      compact
      className="mb-6"
      title="Authentication"
      description="Entire server · Choose how people sign in: local passwords, your LDAP directory, or their mail server over IMAP."
      actions={isAdmin && (
        <Button type="button" size="sm" variant="outline" onClick={() => { setLoading(true); void load() }} disabled={loading || saving}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Reload
        </Button>
      )}
    />
  )

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        {header}
        <div className="flex items-start gap-2 rounded-md border p-3 text-xs">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">Authentication settings are only available to server admins.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6 pb-24">
      {header}

      {loading && !draft ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : error || !draft ? (
        <div className="space-y-3">
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Authentication settings unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">{error || 'No config returned.'}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => { setLoading(true); void load() }}>Retry</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            Config file: <span className="font-mono">{configPath}</span> · Sign-in picks the backend from the account: existing users keep the
            method they were created with; a new address tries LDAP first (when enabled), then IMAP for a listed domain, then local.
          </p>

          <Section
            title="Sign-up & local passwords"
            description="Accounts whose password is stored on this server."
          >
            <Check
              checked={draft.allowUserRegistrations}
              onChange={(v) => patch((d) => ({ ...d, allowUserRegistrations: v }))}
              label="Allow self-registration"
              hint="Off = only admins create accounts (and LDAP/IMAP users on first sign-in)."
            />
            <Check
              checked={draft.local.enabled}
              onChange={(v) => patch((d) => ({ ...d, local: { ...d.local, enabled: v } }))}
              label="Local password accounts"
              hint="Off refuses new local registrations. Existing local accounts — admins included — can still sign in, so this cannot lock you out."
            />
            <Check
              checked={draft.local.requireEmailVerification}
              onChange={(v) => patch((d) => ({ ...d, local: { ...d.local, requireEmailVerification: v } }))}
              label="Require e-mail verification"
              hint="Needs working SMTP (config/smtp.json)."
            />
            <div>
              <p className="mb-2 text-xs font-medium">Password policy</p>
              <div className="flex flex-wrap items-start gap-4">
                <Field label="Min length">
                  <Input className="h-8 w-24 text-sm" type="number" min={1} max={1024} value={draft.local.passwordPolicy.minLength}
                    onChange={(e) => patch((d) => ({ ...d, local: { ...d.local, passwordPolicy: { ...d.local.passwordPolicy, minLength: Number(e.target.value) } } }))} />
                </Field>
                <Field label="Max length">
                  <Input className="h-8 w-24 text-sm" type="number" min={1} max={1024} value={draft.local.passwordPolicy.maxLength}
                    onChange={(e) => patch((d) => ({ ...d, local: { ...d.local, passwordPolicy: { ...d.local.passwordPolicy, maxLength: Number(e.target.value) } } }))} />
                </Field>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1">
                  {([
                    ['requireUppercase', 'Uppercase letter'],
                    ['requireLowercase', 'Lowercase letter'],
                    ['requireNumbers', 'Number'],
                    ['requireSpecialChars', 'Special character'],
                  ] as const).map(([key, label]) => (
                    <Check key={key} checked={draft.local.passwordPolicy[key]} label={label}
                      onChange={(v) => patch((d) => ({ ...d, local: { ...d.local, passwordPolicy: { ...d.local.passwordPolicy, [key]: v } } }))} />
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="LDAP / Active Directory"
            description="Users sign in with their directory password. Servers are tried in order, so later ones act as fallbacks."
            enabled={draft.ldap.enabled}
            onToggle={(v) => patch((d) => ({ ...d, ldap: { ...d.ldap, enabled: v } }))}
          >
            <NewUserDefaults value={draft.ldap} onChange={(v) => patch((d) => ({ ...d, ldap: { ...d.ldap, ...v } }))} />
            {draft.ldap.servers.map((row, i) => (
              <LdapServerCard
                key={row.id}
                row={row}
                index={i}
                onChange={(p) => patchLdapRow(row.id, p)}
                onRemove={() => patch((d) => ({ ...d, ldap: { ...d.ldap, servers: d.ldap.servers.filter((r) => r.id !== row.id) } }))}
              />
            ))}
            <Button type="button" size="sm" variant="outline"
              onClick={() => patch((d) => ({ ...d, ldap: { ...d.ldap, servers: [...d.ldap.servers, { ...NEW_LDAP, id: rowId(), name: d.ldap.servers.length ? `server${d.ldap.servers.length + 1}` : 'primary' }] } }))}>
              <Plus className="mr-2 h-3.5 w-3.5" /> Add LDAP server
            </Button>
          </Section>

          <Section
            title="IMAP (mail server sign-in)"
            description="Users of a listed e-mail domain sign in with their mailbox password — the server checks it by logging in to IMAP."
            enabled={draft.imap.enabled}
            onToggle={(v) => patch((d) => ({ ...d, imap: { ...d.imap, enabled: v } }))}
          >
            <NewUserDefaults value={draft.imap} onChange={(v) => patch((d) => ({ ...d, imap: { ...d.imap, ...v } }))} />
            {draft.imap.domains.map((row) => (
              <ImapDomainCard
                key={row.id}
                row={row}
                onChange={(p) => patchImapRow(row.id, p)}
                onRemove={() => patch((d) => ({ ...d, imap: { ...d.imap, domains: d.imap.domains.filter((r) => r.id !== row.id) } }))}
              />
            ))}
            <Button type="button" size="sm" variant="outline"
              onClick={() => patch((d) => ({ ...d, imap: { ...d.imap, domains: [...d.imap.domains, { ...NEW_IMAP, id: rowId() }] } }))}>
              <Plus className="mr-2 h-3.5 w-3.5" /> Add mail domain
            </Button>
          </Section>

          {(dirty || saveErrors) && (
            <div className="sticky bottom-4 z-10 rounded-lg border bg-card p-3 shadow-elevation-4">
              {saveErrors && (
                <ul className="mb-2 space-y-0.5 text-xs text-destructive">
                  {saveErrors.split('; ').map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
              <div className="flex items-center justify-end gap-2">
                <span className="mr-auto text-xs text-muted-foreground">{dirty ? 'Unsaved changes' : ''}</span>
                <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setDraft(saved); setSaveErrors(null) }}>Discard</Button>
                <Button type="button" size="sm" disabled={saving || !dirty} onClick={() => void save()}>
                  {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

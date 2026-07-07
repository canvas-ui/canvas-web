import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Save, X, Braces } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { getRules, saveRules, type HookRule, type HookRuleAction } from '@/services/hooks'
import { listScripts } from '@/services/scripts'

// Outlook-style rule builder: clickable conditions + predefined actions that
// translate 1:1 into canvas.hook-rules/v1 rules in git/hooks/rules.json.
// Advanced users edit the same file as JSON in the Hooks section.

interface RuleBuilderProps {
  workspaceId: string
  /** Open rules.json in the advanced editor (Hooks section). */
  onOpenJson?: () => void
}

const SCHEMA_OPTIONS = [
  { value: '', label: 'any item' },
  { value: 'email', label: 'an email' },
  { value: 'tab', label: 'a browser tab / link' },
  { value: 'note', label: 'a note' },
  { value: 'file', label: 'a file' },
  { value: 'todo', label: 'a todo' },
] as const

const EVENT_OPTIONS = [
  { value: 'document.inserted', label: 'arrives (is added)' },
  { value: 'document.updated', label: 'is updated' },
] as const

type ConditionKey = 'from' | 'subject' | 'urlHost' | 'urlContains' | 'path' | 'mime'

const CONDITION_FIELDS: Array<{ key: ConditionKey; label: string; hint: string }> = [
  { key: 'from', label: 'sender contains', hint: 'boss@company.tld' },
  { key: 'subject', label: 'subject contains', hint: 'invoice' },
  { key: 'urlHost', label: 'website (host) is', hint: 'youtube.com' },
  { key: 'urlContains', label: 'URL contains', hint: '/watch?v=' },
  { key: 'path', label: 'path starts with', hint: '/to-sort' },
  { key: 'mime', label: 'file type (mime) matches', hint: 'image/*' },
]

type ActionKey = 'link' | 'tag' | 'notify' | 'agent' | 'script'

const ACTION_FIELDS: Array<{ key: ActionKey; label: string }> = [
  { key: 'link', label: 'file it into a folder' },
  { key: 'tag', label: 'add tags' },
  { key: 'notify', label: 'send me a message' },
  { key: 'agent', label: 'ask an agent' },
  { key: 'script', label: 'run a script' },
]

interface ConditionRow { field: ConditionKey; value: string }
interface ActionRow { kind: ActionKey; a: string; b: string } // generic 2 slots per action

interface RuleForm {
  id: string | null // null = new (slug generated from description)
  description: string
  event: string
  schema: string
  conditions: ConditionRow[]
  actions: ActionRow[]
}

const EMPTY_FORM: RuleForm = {
  id: null, description: '', event: 'document.inserted', schema: '',
  conditions: [], actions: [{ kind: 'link', a: '', b: '' }],
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `rule-${Math.random().toString(36).slice(2, 7)}`
}

const splitList = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean)

// ── form → rule ──────────────────────────────────────────────────────────────

function buildRule(form: RuleForm): HookRule {
  const when: HookRule['when'] = { event: form.event }
  if (form.schema) when.schema = form.schema

  const multi: Partial<Record<string, string[]>> = {}
  const url: Record<string, string> = {}
  for (const row of form.conditions) {
    const value = row.value.trim()
    if (!value) continue
    if (row.field === 'urlHost') url.host = value
    else if (row.field === 'urlContains') url.contains = value
    else (multi[row.field] ||= []).push(value)
  }
  for (const [key, values] of Object.entries(multi)) {
    if (values?.length) when[key] = values.length === 1 ? values[0] : values
  }
  if (Object.keys(url).length) when.url = url

  const then: HookRuleAction[] = []
  for (const row of form.actions) {
    const a = row.a.trim(); const b = row.b.trim()
    if (row.kind === 'link' && a) then.push({ action: 'link', paths: splitList(a), ...(b ? { tags: splitList(b) } : {}) })
    if (row.kind === 'tag' && a) then.push({ action: 'tag', tags: splitList(a) })
    if (row.kind === 'notify' && a) then.push({ action: 'notify', message: a })
    if (row.kind === 'agent' && a && b) then.push({ action: 'agent', slug: a, prompt: b })
    if (row.kind === 'script' && a) then.push({ action: 'script', path: a })
  }

  return {
    id: form.id || slugify(form.description),
    enabled: true,
    ...(form.description ? { description: form.description } : {}),
    when,
    then,
  }
}

// ── rule → form (only shapes the builder emits; others are JSON-only) ────────

function parseRule(rule: HookRule): RuleForm | null {
  const { event, schema, from, subject, path, mime, url, ...restWhen } = rule.when
  if (Object.keys(restWhen).length > 0) return null
  if (typeof event !== 'string' || !EVENT_OPTIONS.some((e) => e.value === event)) return null
  if (schema !== undefined && (typeof schema !== 'string' || !SCHEMA_OPTIONS.some((s) => s.value === schema))) return null

  const conditions: ConditionRow[] = []
  const push = (field: ConditionKey, value: unknown): boolean => {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (typeof v !== 'string') return false
      conditions.push({ field, value: v })
    }
    return true
  }
  if (from !== undefined && !push('from', from)) return null
  if (subject !== undefined && !push('subject', subject)) return null
  if (path !== undefined && !push('path', path)) return null
  if (mime !== undefined && !push('mime', mime)) return null
  if (url !== undefined) {
    if (typeof url === 'string') conditions.push({ field: 'urlContains', value: url })
    else if (url && typeof url === 'object') {
      const u = url as Record<string, unknown>
      const extra = Object.keys(u).filter((k) => k !== 'host' && k !== 'contains')
      if (extra.length) return null
      if (typeof u.host === 'string') conditions.push({ field: 'urlHost', value: u.host })
      if (typeof u.contains === 'string') conditions.push({ field: 'urlContains', value: u.contains })
    } else return null
  }

  const actions: ActionRow[] = []
  for (const act of rule.then || []) {
    if (act.action === 'link' && Array.isArray(act.paths)) {
      actions.push({ kind: 'link', a: (act.paths as string[]).join(', '), b: Array.isArray(act.tags) ? (act.tags as string[]).join(', ') : '' })
    } else if (act.action === 'tag' && Array.isArray(act.tags)) {
      actions.push({ kind: 'tag', a: (act.tags as string[]).join(', '), b: '' })
    } else if (act.action === 'notify' && typeof act.message === 'string') {
      actions.push({ kind: 'notify', a: act.message, b: '' })
    } else if (act.action === 'agent' && typeof act.slug === 'string' && typeof act.prompt === 'string') {
      actions.push({ kind: 'agent', a: act.slug, b: act.prompt })
    } else if (act.action === 'script' && typeof act.path === 'string') {
      actions.push({ kind: 'script', a: act.path, b: '' })
    } else {
      return null
    }
  }

  return {
    id: rule.id,
    description: rule.description || '',
    event,
    schema: typeof schema === 'string' ? schema : '',
    conditions,
    actions: actions.length ? actions : [{ kind: 'link', a: '', b: '' }],
  }
}

function summarizeWhen(rule: HookRule): string {
  const parts: string[] = []
  const w = rule.when
  const schemaLabel = SCHEMA_OPTIONS.find((s) => s.value === w.schema)?.label || (w.schema ? String(w.schema) : 'any item')
  const eventLabel = EVENT_OPTIONS.find((e) => e.value === w.event)?.label || String(w.event)
  parts.push(`When ${schemaLabel} ${eventLabel}`)
  const fmt = (v: unknown) => (Array.isArray(v) ? v.join(' or ') : typeof v === 'object' ? JSON.stringify(v) : String(v))
  for (const key of ['from', 'subject', 'url', 'path', 'mime']) {
    if (w[key] !== undefined) parts.push(`${key}: ${fmt(w[key])}`)
  }
  return parts.join(' · ')
}

function summarizeThen(rule: HookRule): string {
  return (rule.then || []).map((a) => {
    if (a.action === 'link') return `file into ${(a.paths as string[])?.join(', ')}`
    if (a.action === 'tag') return `tag ${(a.tags as string[])?.join(', ')}`
    if (a.action === 'notify') return 'notify me'
    if (a.action === 'agent') return `ask agent "${a.slug}"`
    if (a.action === 'script') return `run ${a.path}`
    return a.action
  }).join(' · ') || '(no actions)'
}

// ── component ────────────────────────────────────────────────────────────────

export function RuleBuilder({ workspaceId, onOpenJson }: RuleBuilderProps) {
  const { showToast } = useToast()
  const [rules, setRules] = useState<HookRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [form, setForm] = useState<RuleForm | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [scripts, setScripts] = useState<string[]>([])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setRules(await getRules(workspaceId))
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    listScripts(workspaceId).then((files) => setScripts(files.map((f) => f.path))).catch(() => setScripts([]))
  }, [workspaceId])

  const persist = async (next: HookRule[], toastTitle: string) => {
    setIsSaving(true)
    try {
      await saveRules(workspaceId, next)
      setRules(next)
      showToast({ title: toastTitle, description: 'rules.json updated (committed to workspace git)' })
      return true
    } catch (error) {
      showToast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save rules', variant: 'destructive' })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const submit = async () => {
    if (!form) return
    const rule = buildRule(form)
    if (!rule.then.length) {
      showToast({ title: 'Add an action', description: 'Pick at least one "then" action (with its fields filled in).', variant: 'destructive' })
      return
    }
    const next = form.id
      ? rules.map((r) => (r.id === form.id ? { ...rule, enabled: r.enabled !== false } : r))
      : [...rules, rule]
    if (await persist(next, form.id ? 'Rule updated' : 'Rule created')) setForm(null)
  }

  const toggleRule = (id: string) =>
    persist(rules.map((r) => (r.id === id ? { ...r, enabled: r.enabled === false } : r)), 'Rule toggled')

  const deleteRule = (id: string) => {
    if (!confirm(`Delete rule "${id}"?`)) return
    void persist(rules.filter((r) => r.id !== id), 'Rule deleted')
  }

  const setField = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  const selectClass = 'h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Rules run automatically when items arrive — no code needed. Each rule is stored in{' '}
          <span className="font-mono">rules.json</span> and can be fine-tuned there.
        </p>
        <div className="flex gap-2 shrink-0">
          {onOpenJson && (
            <Button size="sm" variant="ghost" onClick={onOpenJson} title="Edit rules.json directly">
              <Braces className="mr-1 h-3.5 w-3.5" /> JSON
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setForm({ ...EMPTY_FORM })}>
            <Plus className="mr-1 h-4 w-4" /> New Rule
          </Button>
        </div>
      </div>

      {form && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Rule name</label>
            <Input
              placeholder="Urgent mail from the boss"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">When…</label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select className={selectClass} value={form.schema} onChange={(e) => setField('schema', e.target.value)}>
                {SCHEMA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select className={selectClass} value={form.event} onChange={(e) => setField('event', e.target.value)}>
                {EVENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {form.conditions.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground w-7">and</span>
                <select
                  className={selectClass}
                  value={row.field}
                  onChange={(e) => setField('conditions', form.conditions.map((c, j) => (j === i ? { ...c, field: e.target.value as ConditionKey } : c)))}
                >
                  {CONDITION_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <Input
                  className="h-8 w-56 font-mono text-sm"
                  placeholder={CONDITION_FIELDS.find((f) => f.key === row.field)?.hint}
                  value={row.value}
                  onChange={(e) => setField('conditions', form.conditions.map((c, j) => (j === i ? { ...c, value: e.target.value } : c)))}
                />
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setField('conditions', form.conditions.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setField('conditions', [...form.conditions, { field: 'from', value: '' }])}>
              <Plus className="mr-1 h-3 w-3" /> add condition
            </Button>
            <p className="text-xs text-muted-foreground">
              Conditions combine with AND; the same condition twice means either value (OR).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Then…</label>
            {form.actions.map((row, i) => {
              const set = (patch: Partial<ActionRow>) => setField('actions', form.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)))
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className={selectClass} value={row.kind} onChange={(e) => set({ kind: e.target.value as ActionKey, a: '', b: '' })}>
                    {ACTION_FIELDS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                  {row.kind === 'link' && (<>
                    <Input className="h-8 w-52 font-mono text-sm" placeholder="/work/urgent" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                    <Input className="h-8 w-44 font-mono text-sm" placeholder="tags (optional)" value={row.b} onChange={(e) => set({ b: e.target.value })} />
                  </>)}
                  {row.kind === 'tag' && (
                    <Input className="h-8 w-64 font-mono text-sm" placeholder="urgent, follow-up" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                  )}
                  {row.kind === 'notify' && (
                    <Input className="h-8 w-96 max-w-full text-sm" placeholder={'New mail from {{doc.data.from}}: {{doc.data.subject}}'} value={row.a} onChange={(e) => set({ a: e.target.value })} />
                  )}
                  {row.kind === 'agent' && (<>
                    <Input className="h-8 w-36 font-mono text-sm" placeholder="agent slug" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                    <Input className="h-8 w-80 max-w-full text-sm" placeholder={'Summarize: {{doc.data.subject}}'} value={row.b} onChange={(e) => set({ b: e.target.value })} />
                  </>)}
                  {row.kind === 'script' && (
                    scripts.length ? (
                      <select className={`${selectClass} font-mono`} value={row.a} onChange={(e) => set({ a: e.target.value })}>
                        <option value="">pick a script…</option>
                        {scripts.map((s) => <option key={s} value={`scripts/${s}`}>{s}</option>)}
                      </select>
                    ) : (
                      <Input className="h-8 w-64 font-mono text-sm" placeholder="scripts/my-script.sh" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                    )
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setField('actions', form.actions.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setField('actions', [...form.actions, { kind: 'tag', a: '', b: '' }])}>
              <Plus className="mr-1 h-3 w-3" /> add action
            </Button>
            <p className="text-xs text-muted-foreground">
              Message/prompt fields support templates over the full document schema:{' '}
              <span className="font-mono">{'{{doc.data.subject}}'}</span>, <span className="font-mono">{'{{doc.data.from}}'}</span>,{' '}
              <span className="font-mono">{'{{doc.data.url}}'}</span>, <span className="font-mono">{'{{doc.data.body}}'}</span> /{' '}
              <span className="font-mono">{'{{doc.data.bodyHtml}}'}</span> (emails). Objects and arrays like{' '}
              <span className="font-mono">{'{{doc.locations}}'}</span> are inserted as JSON.
            </p>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={isSaving}>
              <Save className="mr-1 h-4 w-4" /> {form.id ? 'Update rule' : 'Create rule'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="border rounded-lg divide-y">
        {isLoading ? (
          <p className="p-3 text-sm text-muted-foreground">Loading…</p>
        ) : rules.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No rules yet. Create one — e.g. “when an email arrives and the sender contains
            <span className="font-mono"> boss@</span>, file it into <span className="font-mono">/work/urgent</span> and notify me”.
          </p>
        ) : (
          rules.map((rule) => {
            const editable = parseRule(rule) !== null
            const enabled = rule.enabled !== false
            return (
              <div key={rule.id} className={`flex items-start justify-between gap-3 p-3 ${enabled ? '' : 'opacity-50'}`}>
                <label className="flex items-start gap-3 cursor-pointer min-w-0">
                  <input type="checkbox" className="mt-1" checked={enabled} onChange={() => toggleRule(rule.id)} disabled={isSaving} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{rule.description || rule.id}</span>
                    <span className="block text-xs text-muted-foreground">{summarizeWhen(rule)}</span>
                    <span className="block text-xs text-muted-foreground">→ {summarizeThen(rule)}</span>
                  </span>
                </label>
                <div className="flex items-center shrink-0">
                  <Button
                    size="sm" variant="ghost" className="h-7 w-7 p-0"
                    title={editable ? 'Edit rule' : 'This rule uses advanced matchers — edit it as JSON'}
                    disabled={!editable}
                    onClick={() => { const parsed = parseRule(rule); if (parsed) setForm(parsed) }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteRule(rule.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

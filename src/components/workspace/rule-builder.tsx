import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Save, X, Braces, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-context'
import { getRules, saveRules, backfillHook, type HookRule, type HookRuleAction } from '@/services/hooks'
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
  { value: 'document.linked', label: 'is filed into a folder' },
  { value: 'document.unlinked', label: 'is removed from a folder' },
] as const

type ConditionKey = 'from' | 'to' | 'subject' | 'urlHost' | 'urlContains' | 'path' | 'mime' | 'attachment'

const CONDITION_FIELDS: Array<{ key: ConditionKey; label: string; hint: string }> = [
  { key: 'from', label: 'sender contains', hint: 'boss@company.tld' },
  { key: 'to', label: 'sent to (To/Cc) contains', hint: 'invoice@my-company.tld' },
  { key: 'subject', label: 'subject contains', hint: 'invoice' },
  { key: 'urlHost', label: 'website (host) is', hint: 'youtube.com' },
  { key: 'urlContains', label: 'URL contains', hint: '/watch?v=' },
  { key: 'path', label: 'path starts with', hint: '/to-sort' },
  { key: 'mime', label: 'file type (mime) matches', hint: 'image/*' },
  { key: 'attachment', label: 'has attachment (mime) matching', hint: 'application/pdf — or * for any' },
]

type ActionKey = 'link' | 'unlink' | 'tag' | 'notify' | 'agent' | 'script' | 'delete' | 'destroy'

const ACTION_FIELDS: Array<{ key: ActionKey; label: string }> = [
  { key: 'link', label: 'file it into a folder' },
  { key: 'unlink', label: 'remove it from a folder' },
  { key: 'tag', label: 'add tags' },
  { key: 'notify', label: 'send me a message' },
  { key: 'agent', label: 'ask an agent' },
  { key: 'script', label: 'run a script' },
  { key: 'delete', label: 'delete it from Canvas' },
  { key: 'destroy', label: 'delete it everywhere' },
]

interface ConditionRow { field: ConditionKey; value: string }
interface ActionRow {
  kind: ActionKey
  a: string // primary slot: link/unlink paths / tags / notify message / agent slug / script path
  b: string // secondary slot: link tags / agent prompt
  // output pipeline (agent reply / script stdout):
  notePath: string // save output as note at this path
  noteTitle: string // note title (templated)
  filePath: string // save output to a file at this path
  fileBackend: 'home' | 'data' // workspace:home file vs workspace:data blob store
  fileInsert: string // also index the file at this tree path
  notifyReply: boolean // also send the output as a notification
}

const emptyAction = (kind: ActionKey): ActionRow => ({
  kind, a: '', b: '', notePath: '', noteTitle: '', filePath: '', fileBackend: 'home', fileInsert: '', notifyReply: false,
})

interface RuleForm {
  id: string | null // null = new (slug generated from description)
  description: string
  event: string
  schema: string
  cascade: boolean // also run on items produced by other rules/hooks/agents
  approval: boolean // hold the actions in the pending queue for review instead of running
  // JSON-only knobs carried through so a builder edit never strips them:
  editable?: string[] // reviewer-amendable JSON paths (pending queue)
  ttl?: string | number // pending-proposal expiry
  conditions: ConditionRow[]
  actions: ActionRow[]
}

const EMPTY_FORM: RuleForm = {
  id: null, description: '', event: 'document.inserted', schema: '', cascade: false, approval: false,
  conditions: [], actions: [emptyAction('link')],
}

// 'FMO | DC Migration | SDI' → ['FMO', 'DC Migration', 'SDI'] (engine ORs arrays)
const splitAlternatives = (value: string) => value.split('|').map((s) => s.trim()).filter(Boolean)

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `rule-${Math.random().toString(36).slice(2, 7)}`
}

const splitList = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean)

// ── form → rule ──────────────────────────────────────────────────────────────

function buildRule(form: RuleForm): HookRule {
  const when: HookRule['when'] = { event: form.event }
  if (form.schema) when.schema = form.schema

  const multi: Partial<Record<string, string[]>> = {}
  const url: Record<string, unknown> = {}
  for (const row of form.conditions) {
    const values = splitAlternatives(row.value)
    if (!values.length) continue
    if (row.field === 'urlHost' || row.field === 'urlContains') {
      const key = row.field === 'urlHost' ? 'host' : 'contains'
      const prev = url[key]
      const merged = [...(Array.isArray(prev) ? prev : prev != null ? [prev] : []), ...values]
      url[key] = merged.length === 1 ? merged[0] : merged
    } else (multi[row.field] ||= []).push(...values)
  }
  for (const [key, values] of Object.entries(multi)) {
    if (values?.length) when[key] = values.length === 1 ? values[0] : values
  }
  if (Object.keys(url).length) when.url = url

  const buildOutput = (row: ActionRow): Record<string, unknown> | null => {
    const output: Record<string, unknown> = {}
    if (row.notePath.trim()) {
      output.note = { path: row.notePath.trim(), ...(row.noteTitle.trim() ? { title: row.noteTitle.trim() } : {}) }
    }
    if (row.filePath.trim()) {
      output.file = {
        path: row.filePath.trim(),
        ...(row.fileBackend === 'data' ? { backend: 'data' } : {}),
        ...(row.fileInsert.trim() ? { insert: row.fileInsert.trim() } : {}),
      }
    }
    if (row.notifyReply) output.notify = true
    return Object.keys(output).length ? output : null
  }

  const then: HookRuleAction[] = []
  for (const row of form.actions) {
    const a = row.a.trim(); const b = row.b.trim()
    if (row.kind === 'link' && a) then.push({ action: 'link', paths: splitList(a), ...(b ? { tags: splitList(b) } : {}) })
    if (row.kind === 'unlink' && a) then.push({ action: 'unlink', paths: splitList(a) })
    if (row.kind === 'tag' && a) then.push({ action: 'tag', tags: splitList(a) })
    if (row.kind === 'notify' && a) then.push({ action: 'notify', message: a })
    if (row.kind === 'delete') then.push({ action: 'delete' })
    if (row.kind === 'destroy') then.push({ action: 'destroy' })
    if (row.kind === 'agent' && a && b) {
      const output = buildOutput(row)
      then.push({ action: 'agent', slug: a, prompt: b, ...(output ? { output } : {}) })
    }
    if (row.kind === 'script' && a) {
      const output = buildOutput(row)
      then.push({ action: 'script', path: a, ...(output ? { output } : {}) })
    }
  }

  return {
    id: form.id || slugify(form.description),
    enabled: true,
    ...(form.description ? { description: form.description } : {}),
    ...(form.cascade ? { cascade: true } : {}),
    ...(form.approval ? { approval: true } : {}),
    ...(form.editable?.length ? { editable: form.editable } : {}),
    ...(form.ttl !== undefined ? { ttl: form.ttl } : {}),
    when,
    then,
  }
}

// ── rule → form (only shapes the builder emits; others are JSON-only) ────────

function parseRule(rule: HookRule): RuleForm | null {
  const { event, schema, from, to, subject, path, mime, url, attachment, ...restWhen } = rule.when
  if (Object.keys(restWhen).length > 0) return null
  if (typeof event !== 'string' || !EVENT_OPTIONS.some((e) => e.value === event)) return null
  if (schema !== undefined && (typeof schema !== 'string' || !SCHEMA_OPTIONS.some((s) => s.value === schema))) return null

  const conditions: ConditionRow[] = []
  // string | string[] → one row; alternatives joined with ' | ' (engine OR)
  const push = (field: ConditionKey, value: unknown): boolean => {
    const values = Array.isArray(value) ? value : [value]
    if (!values.every((v) => typeof v === 'string')) return false
    conditions.push({ field, value: (values as string[]).join(' | ') })
    return true
  }
  if (from !== undefined && !push('from', from)) return null
  if (to !== undefined && !push('to', to)) return null
  if (subject !== undefined && !push('subject', subject)) return null
  if (path !== undefined && !push('path', path)) return null
  if (mime !== undefined && !push('mime', mime)) return null
  // Builder emits attachment as mime pattern string(s); `true` / object forms
  // ({ filename }) are JSON-only.
  if (attachment !== undefined && !push('attachment', attachment)) return null
  if (url !== undefined) {
    if (typeof url === 'string') conditions.push({ field: 'urlContains', value: url })
    else if (url && typeof url === 'object') {
      const u = url as Record<string, unknown>
      const extra = Object.keys(u).filter((k) => k !== 'host' && k !== 'contains')
      if (extra.length) return null
      if (u.host !== undefined && !push('urlHost', u.host)) return null
      if (u.contains !== undefined && !push('urlContains', u.contains)) return null
    } else return null
  }

  // output pipeline → row fields; foreign keys/shapes → null (JSON-only rule)
  const parseOutput = (act: Record<string, unknown>): Partial<ActionRow> | null => {
    const output = (act.output && typeof act.output === 'object' ? act.output : {}) as Record<string, unknown>
    const extra = Object.keys(output).filter((k) => k !== 'note' && k !== 'file' && k !== 'notify')
    if (extra.length) return null
    const note = (output.note && typeof output.note === 'object' ? output.note : {}) as Record<string, unknown>
    const file = (output.file && typeof output.file === 'object' ? output.file : {}) as Record<string, unknown>
    const fileExtra = Object.keys(file).filter((k) => k !== 'path' && k !== 'backend' && k !== 'insert')
    if (fileExtra.length) return null
    return {
      notePath: typeof note.path === 'string' ? note.path : '',
      noteTitle: typeof note.title === 'string' ? note.title : '',
      filePath: typeof file.path === 'string' ? file.path : '',
      fileBackend: file.backend === 'data' ? 'data' : 'home',
      fileInsert: typeof file.insert === 'string' ? file.insert : '',
      notifyReply: output.notify === true,
    }
  }

  const actions: ActionRow[] = []
  for (const act of rule.then || []) {
    // Per-action approval holds are JSON-only — the builder only models the
    // rule-level checkbox, and re-emitting this action would strip the flag.
    if (act.approval !== undefined) return null
    if (act.action === 'link' && Array.isArray(act.paths)) {
      actions.push({ ...emptyAction('link'), a: (act.paths as string[]).join(', '), b: Array.isArray(act.tags) ? (act.tags as string[]).join(', ') : '' })
    } else if (act.action === 'unlink' && Array.isArray(act.paths)) {
      actions.push({ ...emptyAction('unlink'), a: (act.paths as string[]).join(', ') })
    } else if (act.action === 'tag' && Array.isArray(act.tags)) {
      actions.push({ ...emptyAction('tag'), a: (act.tags as string[]).join(', ') })
    } else if (act.action === 'notify' && typeof act.message === 'string') {
      actions.push({ ...emptyAction('notify'), a: act.message })
    } else if (act.action === 'delete') {
      actions.push(emptyAction('delete'))
    } else if (act.action === 'destroy') {
      actions.push(emptyAction('destroy'))
    } else if (act.action === 'agent' && typeof act.slug === 'string' && typeof act.prompt === 'string') {
      const out = parseOutput(act as Record<string, unknown>)
      if (!out) return null
      actions.push({ ...emptyAction('agent'), a: act.slug, b: act.prompt, ...out })
    } else if (act.action === 'script' && typeof act.path === 'string') {
      const out = parseOutput(act as Record<string, unknown>)
      if (!out) return null
      actions.push({ ...emptyAction('script'), a: act.path, ...out })
    } else {
      return null
    }
  }

  return {
    id: rule.id,
    description: rule.description || '',
    event,
    schema: typeof schema === 'string' ? schema : '',
    cascade: rule.cascade === true,
    approval: rule.approval === true,
    ...(rule.editable?.length ? { editable: rule.editable } : {}),
    ...(rule.ttl !== undefined ? { ttl: rule.ttl } : {}),
    conditions,
    actions: actions.length ? actions : [emptyAction('link')],
  }
}

function summarizeWhen(rule: HookRule): string {
  const parts: string[] = []
  const w = rule.when
  const schemaLabel = SCHEMA_OPTIONS.find((s) => s.value === w.schema)?.label || (w.schema ? String(w.schema) : 'any item')
  const eventLabel = EVENT_OPTIONS.find((e) => e.value === w.event)?.label || String(w.event)
  parts.push(`When ${schemaLabel} ${eventLabel}`)
  const fmt = (v: unknown) => (Array.isArray(v) ? v.join(' or ') : typeof v === 'object' ? JSON.stringify(v) : String(v))
  for (const key of ['from', 'to', 'subject', 'url', 'path', 'mime', 'attachment']) {
    if (w[key] !== undefined) parts.push(`${key === 'attachment' ? 'attachment mime' : key}: ${fmt(w[key])}`)
  }
  if (rule.cascade === true) parts.push('incl. automation-created items')
  if (rule.approval === true) parts.push('requires approval')
  return parts.join(' · ')
}

function summarizeOutput(a: Record<string, unknown>): string {
  const out = (a.output || {}) as Record<string, unknown>
  const note = (out.note || {}) as Record<string, unknown>
  const file = (out.file || {}) as Record<string, unknown>
  return [
    note.path ? `output → note ${note.path}` : '',
    file.path ? `output → file ${file.backend === 'data' ? 'data:' : 'home/'}${file.path}${file.insert ? ` (indexed at ${file.insert})` : ''}` : '',
    out.notify ? 'output → notify' : '',
  ].filter(Boolean).join(', ')
}

function summarizeThen(rule: HookRule): string {
  return (rule.then || []).map((a) => {
    if (a.action === 'link') return `file into ${(a.paths as string[])?.join(', ')}`
    if (a.action === 'unlink') return `remove from ${(a.paths as string[])?.join(', ')}`
    if (a.action === 'tag') return `tag ${(a.tags as string[])?.join(', ')}`
    if (a.action === 'notify') return 'notify me'
    if (a.action === 'delete') return 'delete from Canvas (keeps stored files/mail)'
    if (a.action === 'destroy') return '⚠ delete everywhere (index + storage)'
    if (a.action === 'agent') {
      const extras = summarizeOutput(a as Record<string, unknown>)
      return `ask agent "${a.slug}"${extras ? ` (${extras})` : ''}`
    }
    if (a.action === 'script') {
      const extras = summarizeOutput(a as Record<string, unknown>)
      return `run ${a.path}${extras ? ` (${extras})` : ''}`
    }
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

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])
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

  // Backfill: dry-run first, show what would fire, then execute on confirm.
  const [backfillingId, setBackfillingId] = useState<string | null>(null)
  const backfillRule = async (id: string) => {
    setBackfillingId(id)
    try {
      const dry = await backfillHook(workspaceId, { ruleId: id, dryRun: true })
      const wouldFire = dry.results.filter((r) => r.matched).length
      if (!wouldFire) {
        showToast({ title: 'Backfill', description: `No matches among ${dry.processed} existing documents (path conditions can't match during backfill).` })
        return
      }
      if (!confirm(`Rule "${id}" matches ${wouldFire} of ${dry.processed} existing documents. Run its actions on them now?`)) return
      const run = await backfillHook(workspaceId, { ruleId: id })
      showToast({
        title: 'Backfill finished',
        description: `${run.matched} documents processed, ${run.failed} failed — details in the Runs tab`,
        ...(run.failed ? { variant: 'destructive' as const } : {}),
      })
    } catch (error) {
      showToast({ title: 'Backfill failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBackfillingId(null)
    }
  }

  const setField = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  const selectClass = 'h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-sm text-muted-foreground">
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
              <label
                className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
                title="By default rules ignore items created by other rules, hooks or agents (so automations can't trigger each other in a loop). Tick to also react to those — a server-side depth limit still stops runaway chains."
              >
                <input type="checkbox" checked={form.cascade} onChange={(e) => setField('cascade', e.target.checked)} />
                incl. automation-created items
              </label>
              <label
                className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
                title="Instead of running immediately, the rule's actions are held in the Pending queue for you to review — approve (optionally amended) or decline. Leave unticked to run automatically."
              >
                <input type="checkbox" checked={form.approval} onChange={(e) => setField('approval', e.target.checked)} />
                request my approval before running
              </label>
            </div>
            {form.conditions.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span
                  className="text-xs text-muted-foreground w-7"
                  title="Same condition again = either may match (OR); different conditions must all match (AND)"
                >
                  {form.conditions.slice(0, i).some((c) => c.field === row.field) ? 'or' : 'and'}
                </span>
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
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 touch-target" onClick={() => setField('conditions', form.conditions.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setField('conditions', [...form.conditions, { field: 'from', value: '' }])}>
              <Plus className="mr-1 h-3 w-3" /> add condition
            </Button>
            <p className="text-xs text-muted-foreground">
              Conditions combine with AND. Separate alternatives with <span className="font-mono">|</span> for OR —
              e.g. subject contains <span className="font-mono">FMO | DC Migration | SDI</span>.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Then…</label>
            {form.actions.map((row, i) => {
              const set = (patch: Partial<ActionRow>) => setField('actions', form.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)))
              // Shared output pipeline UI (agent reply / script stdout).
              const outputControls = (label: string) => (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{label} →</span>
                  <Input className="h-7 w-56 font-mono text-xs" placeholder="save as note at /path (optional)" title="Context path by default, dir:/path for the directory tree" value={row.notePath} onChange={(e) => set({ notePath: e.target.value })} />
                  {row.notePath.trim() && (
                    <Input className="h-7 w-56 text-xs" placeholder={'note title, e.g. Summary: {{doc.data.subject}}'} value={row.noteTitle} onChange={(e) => set({ noteTitle: e.target.value })} />
                  )}
                  <Input className="h-7 w-56 font-mono text-xs" placeholder="save as file, e.g. logs/agent.log" title="Relative path — written under the workspace home/ folder, or into the data blob store" value={row.filePath} onChange={(e) => set({ filePath: e.target.value })} />
                  {row.filePath.trim() && (<>
                    <select className="h-7 rounded-md border bg-background px-1 text-xs outline-none" value={row.fileBackend} onChange={(e) => set({ fileBackend: e.target.value as 'home' | 'data' })}>
                      <option value="home">in home folder</option>
                      <option value="data">in data store</option>
                    </select>
                    <Input className="h-7 w-48 font-mono text-xs" placeholder="then file under /path (optional)" title="Index the saved file as a document at this tree path (dir:/path for the directory tree)" value={row.fileInsert} onChange={(e) => set({ fileInsert: e.target.value })} />
                  </>)}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={row.notifyReply} onChange={(e) => set({ notifyReply: e.target.checked })} /> notify me
                  </label>
                </div>
              )
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className={selectClass} value={row.kind} onChange={(e) => set(emptyAction(e.target.value as ActionKey))}>
                    {ACTION_FIELDS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                  {row.kind === 'link' && (<>
                    <Input className="h-8 w-64 font-mono text-sm" placeholder="/work/urgent or dir:/projects/x" title="Context-tree path by default; prefix with dir: for the directory tree, ctx: to be explicit. Comma-separate multiple paths." value={row.a} onChange={(e) => set({ a: e.target.value })} />
                    <Input className="h-8 w-44 font-mono text-sm" placeholder="tags (optional)" value={row.b} onChange={(e) => set({ b: e.target.value })} />
                  </>)}
                  {row.kind === 'unlink' && (
                    <Input className="h-8 w-64 font-mono text-sm" placeholder="/inbox or dir:/staging" title="Remove (unlink) the item from these paths — it stays everywhere else. Comma-separate multiple paths." value={row.a} onChange={(e) => set({ a: e.target.value })} />
                  )}
                  {row.kind === 'tag' && (
                    <Input className="h-8 w-64 font-mono text-sm" placeholder="urgent, follow-up" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                  )}
                  {row.kind === 'notify' && (
                    <Input className="h-8 w-96 max-w-full text-sm" placeholder={'New mail from {{doc.data.from}}: {{doc.data.subject}}'} value={row.a} onChange={(e) => set({ a: e.target.value })} />
                  )}
                  {row.kind === 'delete' && (
                    <span className="text-xs text-muted-foreground">removes it from the Canvas index — files, blobs and mail on storage backends stay untouched</span>
                  )}
                  {row.kind === 'destroy' && (
                    <span className="text-xs text-destructive">⚠ irreversible: deletes the stored bytes too (blobs, workspace files, mail on the server), then removes it from the index</span>
                  )}
                  {row.kind === 'agent' && (
                    <div className="flex w-full flex-col gap-2 pl-1">
                      <Input className="h-8 w-40 font-mono text-sm" placeholder="agent slug" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                      <textarea
                        className="min-h-20 w-full rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder={'Dear agent, you will get an email subject and body. Summarize it in plain markdown.\n\nSubject: {{doc.data.subject}}\nBody: {{doc.data.body}}'}
                        value={row.b}
                        onChange={(e) => set({ b: e.target.value })}
                      />
                      {outputControls('reply')}
                    </div>
                  )}
                  {row.kind === 'script' && (
                    <div className="flex w-full flex-col gap-2 pl-1">
                      {scripts.length ? (
                        <select className={`${selectClass} w-64 font-mono`} value={row.a} onChange={(e) => set({ a: e.target.value })}>
                          <option value="">pick a script…</option>
                          {scripts.map((s) => <option key={s} value={`scripts/${s}`}>{s}</option>)}
                        </select>
                      ) : (
                        <Input className="h-8 w-64 font-mono text-sm" placeholder="scripts/my-script.sh" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                      )}
                      {outputControls('output')}
                    </div>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 touch-target" onClick={() => setField('actions', form.actions.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setField('actions', [...form.actions, emptyAction('tag')])}>
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
                    size="sm" variant="ghost" className="h-7 w-7 p-0 touch-target"
                    title="Backfill: apply this rule to existing documents (dry-run first)"
                    disabled={backfillingId !== null}
                    onClick={() => backfillRule(rule.id)}
                  >
                    <PlayCircle className={`h-3.5 w-3.5 ${backfillingId === rule.id ? 'animate-pulse' : ''}`} />
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-7 w-7 p-0 touch-target"
                    title={editable ? 'Edit rule' : 'This rule uses advanced matchers — edit it as JSON'}
                    disabled={!editable}
                    onClick={() => { const parsed = parseRule(rule); if (parsed) setForm(parsed) }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive touch-target" onClick={() => deleteRule(rule.id)}>
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

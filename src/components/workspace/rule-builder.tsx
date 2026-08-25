import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Plus, Pencil, Trash2, Save, X, Braces, PlayCircle, FolderTree, FolderSymlink, HardDrive, Image, Mail, Globe, Bot,
  Sparkles, Tag, Bell, Terminal, Trash, ChevronDown, ArrowRight, Loader2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  getRules, saveRules, backfillHook, getHooksMeta, listRuns, ruleEvents, rulePaths, splitBackendsPath,
  type HookRule, type HookRuleAction, type HookRun, type RulePrefill,
} from '@/services/hooks'
import { listScripts } from '@/services/scripts'
import { listBackends, type Backend } from '@/services/workspace'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from '@/components/menu/shared/LinkToSidePanel'
import { LinkToCard, type LinkToTarget } from '@/components/menu/shared/LinkToCard'

// Rule builder: recipes → a sentence-style form ("when … then …") that
// translates 1:1 into canvas.hook-rules/v1 rules in git/hooks/rules.json.
// Advanced users edit the same file as JSON in the Hooks section; anything the
// builder cannot represent stays JSON-only and is shown read-only here.

interface RuleBuilderProps {
  workspaceId: string
  /** Open rules.json in the advanced editor (Hooks section). */
  onOpenJson?: () => void
  /** Documents per backfill pass (see hooks.ts DEFAULT_BACKFILL_LIMIT). */
  backfillLimit?: number
  /** Open the form prefilled from a tree context menu (mirror / store rule). */
  prefill?: RulePrefill | null
  onPrefillConsumed?: () => void
}

// Fallback only — the builder prefers the workspace's LIVE schema list from
// the hooks meta endpoint (what's actually in the DB, with counts).
const SCHEMA_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'any item' },
  { value: 'email', label: 'an email' },
  { value: 'tab', label: 'a browser tab / link' },
  { value: 'note', label: 'a note' },
  { value: 'file', label: 'a file' },
  { value: 'todo', label: 'a todo / task' },
]

const EVENT_OPTIONS = [
  { value: 'document.inserted', label: 'is added', hint: 'Fires when the item is created or uploaded.' },
  { value: 'document.updated', label: 'is updated', hint: 'Fires on every edit of the item.' },
  { value: 'document.linked', label: 'is filed into a folder', hint: 'Fires when the item is (re)filed into a tree path — the usual pair with "is added" for folder rules.' },
  { value: 'document.unlinked', label: 'is removed from a folder', hint: 'Fires when the item leaves a tree path.' },
] as const

type ConditionKey = 'from' | 'to' | 'subject' | 'urlHost' | 'urlContains' | 'path' | 'mime' | 'attachment'

const CONDITION_FIELDS: Array<{ key: ConditionKey; label: string; hint: string }> = [
  { key: 'path', label: 'is under the folder', hint: '/projects/canvas/UI or backends:/workspace/home/foo' },
  { key: 'mime', label: 'file type is', hint: 'image/*, application/pdf' },
  { key: 'from', label: 'sender contains', hint: 'boss@company.tld' },
  { key: 'to', label: 'recipient (To/Cc) contains', hint: 'invoice@my-company.tld' },
  { key: 'subject', label: 'subject contains', hint: 'invoice' },
  { key: 'urlHost', label: 'website is', hint: 'youtube.com' },
  { key: 'urlContains', label: 'URL contains', hint: '/watch?v=' },
  { key: 'attachment', label: 'has an attachment of type', hint: 'application/pdf, or * for any' },
]

type ActionKey = 'link' | 'unlink' | 'tag' | 'store' | 'unstore' | 'notify' | 'agent' | 'script' | 'delete' | 'destroy'

const ACTION_FIELDS: Array<{ key: ActionKey; label: string; icon: LucideIcon; tone: string }> = [
  { key: 'store', label: 'keep the file on a storage backend', icon: HardDrive, tone: 'text-sky-600 dark:text-sky-400 bg-sky-500/10' },
  { key: 'link', label: 'file it into a folder', icon: FolderSymlink, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  { key: 'unlink', label: 'remove it from a folder', icon: FolderSymlink, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  { key: 'tag', label: 'add tags', icon: Tag, tone: 'text-violet-600 dark:text-violet-400 bg-violet-500/10' },
  { key: 'unstore', label: 'delete the file from a storage backend', icon: Trash, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  { key: 'notify', label: 'send me a message', icon: Bell, tone: 'text-pink-600 dark:text-pink-400 bg-pink-500/10' },
  { key: 'agent', label: 'ask an agent', icon: Bot, tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10' },
  { key: 'script', label: 'run a script', icon: Terminal, tone: 'text-slate-600 dark:text-slate-300 bg-slate-500/10' },
  { key: 'delete', label: 'delete it from Canvas', icon: Trash2, tone: 'text-destructive bg-destructive/10' },
  { key: 'destroy', label: 'delete it everywhere', icon: Trash2, tone: 'text-destructive bg-destructive/10' },
]
const actionMeta = (key: string) => ACTION_FIELDS.find((a) => a.key === key) || ACTION_FIELDS[1]

// File-name presets for the store action. Anything else is a custom template.
type StoreName = 'keep' | 'title' | 'dated' | 'custom'
const TITLE_NAME = '{{title}}{{ext}}'
const DATED_NAME = '{{YYYY}}/{{MM}}/{{YYYY}}{{MM}}{{DD}}_{{HH}}{{mm}}{{ss}}{{ext}}'
const STORE_NAME_OPTIONS: Array<{ value: StoreName; label: string }> = [
  { value: 'keep', label: 'keep the original file name' },
  { value: 'title', label: 'use the item title as file name' },
  { value: 'dated', label: 'photo style: 2024/07/20240714_183012.jpg' },
  { value: 'custom', label: 'custom template…' },
]

interface ConditionRow { field: ConditionKey; value: string }
interface ActionRow {
  kind: ActionKey
  a: string // primary slot: link/unlink paths / tags / notify message / agent slug / script path / store target backend
  b: string // secondary slot: link tags / agent prompt / store custom name template / unstore ifOn
  // link/unlink/store: append the item's sub-path below the rule's "is under
  // the folder" prefix to the target (mirror a folder subtree 1:1).
  recursive: boolean
  // store action
  storeFrom: string // backend the bytes must currently be on ('' = any other than the target)
  storeFolder: string // directory below the target backend's root
  storeName: StoreName
  storeMode: 'move' | 'copy'
  storeConflict: 'rename' | 'error' | 'overwrite'
  // unstore action: keep the last remaining copy (guard, on by default).
  keepLast: boolean
  // output pipeline (agent reply / script stdout):
  notePath: string
  noteTitle: string
  filePath: string
  fileBackend: 'home' | 'data'
  fileInsert: string
  notifyReply: boolean
}

const emptyAction = (kind: ActionKey): ActionRow => ({
  kind, a: '', b: '', recursive: false, storeFrom: '', storeFolder: '', storeName: 'keep', storeMode: 'move', storeConflict: 'rename', keepLast: true,
  notePath: '', noteTitle: '', filePath: '', fileBackend: 'home', fileInsert: '', notifyReply: false,
})

interface RuleForm {
  id: string | null // null = new (slug generated from description)
  description: string
  events: string[] // at least one EVENT_OPTIONS value (engine ORs arrays)
  schema: string
  cascade: boolean
  approval: boolean
  // JSON-only knobs carried through so a builder edit never strips them:
  editable?: string[]
  ttl?: string | number
  conditions: ConditionRow[]
  actions: ActionRow[]
}

const EMPTY_FORM: RuleForm = {
  id: null, description: '', events: ['document.inserted'], schema: '', cascade: false, approval: false,
  conditions: [], actions: [emptyAction('link')],
}

// 'FMO | DC Migration | SDI' → ['FMO', 'DC Migration', 'SDI'] (engine ORs arrays)
const splitAlternatives = (value: string) => value.split('|').map((s) => s.trim()).filter(Boolean)

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `rule-${Math.random().toString(36).slice(2, 7)}`
}

const splitList = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean)

// ── recipes ──────────────────────────────────────────────────────────────────
// Starting points for the most common rules; each is just a prefilled form.

interface Recipe {
  id: string
  title: string
  blurb: string
  icon: LucideIcon
  tone: string
  build: (ctx: { backend: string }) => RuleForm
}

const RECIPES: Recipe[] = [
  {
    id: 'store', title: 'Keep files in a real folder', icon: HardDrive, tone: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
    blurb: 'Uploads land in the managed blob store. Pick a folder in Canvas and a folder on a storage backend — every file filed there is moved across, sub-folders kept.',
    build: ({ backend }) => ({
      ...EMPTY_FORM, description: 'Keep files in a real folder', schema: 'file', events: ['document.inserted', 'document.linked'],
      conditions: [{ field: 'path', value: '' }],
      actions: [{ ...emptyAction('store'), a: backend, recursive: true }],
    }),
  },
  {
    id: 'photos', title: 'Sort photos by date', icon: Image, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    blurb: 'Images filed into a folder are stored as Photos / 2024 / 07 / 20240714_183012.jpg — by the time the photo was taken (EXIF), not uploaded.',
    build: ({ backend }) => ({
      ...EMPTY_FORM, description: 'Sort photos by date', schema: 'file', events: ['document.inserted', 'document.linked'],
      conditions: [{ field: 'path', value: '' }, { field: 'mime', value: 'image/*' }],
      actions: [{ ...emptyAction('store'), a: backend, storeFolder: 'Photos', storeName: 'dated' }],
    }),
  },
  {
    id: 'mirror', title: 'Mirror a storage folder', icon: FolderSymlink, tone: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
    blurb: 'Everything that appears under a folder of a storage backend shows up 1:1 in the Directory tree.',
    build: () => ({
      ...EMPTY_FORM, description: 'Mirror a storage folder', events: ['document.inserted', 'document.linked'],
      conditions: [{ field: 'path', value: 'backends:/workspace/home/' }],
      actions: [{ ...emptyAction('link'), a: 'dir:/', recursive: true }],
    }),
  },
  {
    id: 'mail', title: 'File mail from a sender', icon: Mail, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    blurb: 'Emails from a person or domain are filed into a folder and you get a notification.',
    build: () => ({
      ...EMPTY_FORM, description: 'Mail from …', schema: 'email',
      conditions: [{ field: 'from', value: '' }],
      actions: [{ ...emptyAction('link'), a: '/work/urgent' }, { ...emptyAction('notify'), a: 'New mail from {{doc.data.from}}: {{doc.data.subject}}' }],
    }),
  },
  {
    id: 'links', title: 'Collect links from a website', icon: Globe, tone: 'text-pink-600 dark:text-pink-400 bg-pink-500/10',
    blurb: 'Tabs and links from a site are filed into a folder and tagged.',
    build: () => ({
      ...EMPTY_FORM, description: 'Links from …', schema: 'tab',
      conditions: [{ field: 'urlHost', value: '' }],
      actions: [{ ...emptyAction('link'), a: '/media/to-watch', b: '' }],
    }),
  },
  {
    id: 'agent', title: 'Ask an agent', icon: Bot, tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
    blurb: 'Hand new items to an agent with a prompt; save its reply as a note or get it as a message.',
    build: () => ({
      ...EMPTY_FORM, description: 'Summarize new items',
      actions: [{ ...emptyAction('agent'), b: 'Summarize this in three bullet points.\n\nTitle: {{doc.data.title}}\n{{doc.data.body}}', notifyReply: true }],
    }),
  },
  {
    id: 'blank', title: 'Start from scratch', icon: Sparkles, tone: 'text-muted-foreground bg-muted',
    blurb: 'An empty rule: choose what it reacts to, add conditions and actions.',
    build: () => ({ ...EMPTY_FORM }),
  },
]

// ── form → rule ──────────────────────────────────────────────────────────────

function buildRule(form: RuleForm): HookRule {
  const when: HookRule['when'] = { event: form.events.length === 1 ? form.events[0] : form.events }
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
    const recursive = row.recursive ? { recursive: true } : {}
    if (row.kind === 'link' && a) then.push({ action: 'link', paths: splitList(a), ...recursive, ...(b ? { tags: splitList(b) } : {}) })
    if (row.kind === 'unlink' && a) then.push({ action: 'unlink', paths: splitList(a), ...recursive })
    if (row.kind === 'tag' && a) then.push({ action: 'tag', tags: splitList(a) })
    if (row.kind === 'store' && a) {
      const folder = row.storeFolder.trim().replace(/^\/+|\/+$/g, '')
      const key = row.storeName === 'title' ? TITLE_NAME : row.storeName === 'dated' ? DATED_NAME : row.storeName === 'custom' ? b : ''
      then.push({
        action: 'store',
        to: a,
        ...(row.storeFrom ? { from: row.storeFrom } : {}),
        mode: row.storeMode,
        ...(folder ? { folder } : {}),
        ...recursive,
        ...(key ? { key } : {}),
        onConflict: row.storeConflict,
      })
    }
    if (row.kind === 'unstore' && a) {
      then.push({
        action: 'unstore',
        from: a,
        ...(b ? { ifOn: b } : {}),
        ...(row.keepLast ? {} : { keepLast: false }),
      })
    }
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
  const events = Array.isArray(event) ? event : [event]
  if (!events.length || !events.every((e) => typeof e === 'string' && EVENT_OPTIONS.some((o) => o.value === e))) return null
  if (schema !== undefined && typeof schema !== 'string') return null

  const conditions: ConditionRow[] = []
  const push = (field: ConditionKey, value: unknown): boolean => {
    const values = Array.isArray(value) ? value : [value]
    if (!values.every((v) => typeof v === 'string')) return false
    conditions.push({ field, value: (values as string[]).join(' | ') })
    return true
  }
  if (path !== undefined && !push('path', path)) return null
  if (mime !== undefined && !push('mime', mime)) return null
  if (from !== undefined && !push('from', from)) return null
  if (to !== undefined && !push('to', to)) return null
  if (subject !== undefined && !push('subject', subject)) return null
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
    if (act.approval !== undefined) return null
    if (act.action === 'link' && Array.isArray(act.paths)) {
      actions.push({ ...emptyAction('link'), a: (act.paths as string[]).join(', '), b: Array.isArray(act.tags) ? (act.tags as string[]).join(', ') : '', recursive: act.recursive === true })
    } else if (act.action === 'unlink' && Array.isArray(act.paths)) {
      actions.push({ ...emptyAction('unlink'), a: (act.paths as string[]).join(', '), recursive: act.recursive === true })
    } else if (act.action === 'tag' && Array.isArray(act.tags)) {
      actions.push({ ...emptyAction('tag'), a: (act.tags as string[]).join(', ') })
    } else if (act.action === 'notify' && typeof act.message === 'string') {
      actions.push({ ...emptyAction('notify'), a: act.message })
    } else if (act.action === 'store' && typeof act.to === 'string') {
      if (act.folder !== undefined && typeof act.folder !== 'string') return null
      if (act.key !== undefined && typeof act.key !== 'string') return null
      const key = typeof act.key === 'string' ? act.key : ''
      actions.push({
        ...emptyAction('store'),
        a: act.to,
        b: key === TITLE_NAME || key === DATED_NAME ? '' : key,
        storeFolder: typeof act.folder === 'string' ? act.folder : '',
        recursive: act.recursive === true,
        storeName: !key ? 'keep' : key === TITLE_NAME ? 'title' : key === DATED_NAME ? 'dated' : 'custom',
        storeFrom: typeof act.from === 'string' ? act.from : (Array.isArray(act.from) ? String(act.from[0] ?? '') : ''),
        storeMode: act.mode === 'copy' ? 'copy' : 'move',
        storeConflict: act.onConflict === 'error' || act.onConflict === 'overwrite' ? act.onConflict : 'rename',
      })
    } else if (act.action === 'unstore' && (typeof act.from === 'string' || Array.isArray(act.from))) {
      const first = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')
      actions.push({ ...emptyAction('unstore'), a: first(act.from), b: first(act.ifOn), keepLast: act.keepLast !== false })
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
    events: events as string[],
    schema: typeof schema === 'string' ? schema : '',
    cascade: rule.cascade === true,
    approval: rule.approval === true,
    ...(rule.editable?.length ? { editable: rule.editable } : {}),
    ...(rule.ttl !== undefined ? { ttl: rule.ttl } : {}),
    conditions,
    actions: actions.length ? actions : [emptyAction('link')],
  }
}

// ── human summaries ──────────────────────────────────────────────────────────

const schemaLabel = (schema: unknown, options: ReadonlyArray<{ value: string; label: string }>) =>
  options.find((s) => s.value === schema)?.label?.replace(/\s\(\d+\)$/, '')
  || (schema ? String(schema).replace(/^data\/schema\//, '') : 'any item')

function summarizeWhen(rule: HookRule, options: ReadonlyArray<{ value: string; label: string }> = SCHEMA_OPTIONS): string {
  const w = rule.when
  const eventLabel = ruleEvents(rule).map((e) => EVENT_OPTIONS.find((o) => o.value === e)?.label || e).join(' or ')
  const parts: string[] = [`When ${schemaLabel(w.schema, options)} ${eventLabel}`]
  const fmt = (v: unknown) => (Array.isArray(v) ? v.join(' or ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))
  const labels: Record<string, string> = { path: 'under', mime: 'type', from: 'from', to: 'to', subject: 'subject', url: 'url', attachment: 'attachment' }
  for (const key of ['path', 'mime', 'from', 'to', 'subject', 'url', 'attachment']) {
    if (w[key] !== undefined) parts.push(`${labels[key]} ${fmt(w[key])}`)
  }
  return parts.join(' · ')
}

function summarizeOutput(a: Record<string, unknown>): string {
  const out = (a.output || {}) as Record<string, unknown>
  const note = (out.note || {}) as Record<string, unknown>
  const file = (out.file || {}) as Record<string, unknown>
  return [
    note.path ? `reply → note ${note.path}` : '',
    file.path ? `reply → file ${file.backend === 'data' ? 'data:' : 'home/'}${file.path}${file.insert ? ` (indexed at ${file.insert})` : ''}` : '',
    out.notify ? 'reply → notify' : '',
  ].filter(Boolean).join(', ')
}

function summarizeAction(a: HookRuleAction): string {
  if (a.action === 'link') return `file into ${(a.paths as string[])?.join(', ')}${a.recursive === true ? ' (sub-folders kept)' : ''}`
  if (a.action === 'unlink') return `remove from ${(a.paths as string[])?.join(', ')}${a.recursive === true ? ' (sub-folders kept)' : ''}`
  if (a.action === 'tag') return `tag ${(a.tags as string[])?.join(', ')}`
  if (a.action === 'store') {
    const folder = typeof a.folder === 'string' && a.folder ? `/${a.folder}` : ''
    const name = a.key === TITLE_NAME ? ', named by title' : a.key === DATED_NAME ? ', by date' : typeof a.key === 'string' && a.key ? `, as ${a.key}` : ''
    return `${a.mode === 'copy' ? 'copy' : 'move'} the file to ${a.to}${folder}${a.recursive === true ? ' (sub-folders kept)' : ''}${name}`
  }
  if (a.action === 'unstore') return `delete the file from ${Array.isArray(a.from) ? a.from.join(', ') : a.from}${a.ifOn ? ` once it is on ${Array.isArray(a.ifOn) ? a.ifOn.join(', ') : a.ifOn}` : ''}`
  if (a.action === 'notify') return 'notify me'
  if (a.action === 'delete') return 'delete from Canvas (keeps stored files/mail)'
  if (a.action === 'destroy') return '⚠ delete everywhere (index + storage)'
  if (a.action === 'agent') { const extras = summarizeOutput(a as Record<string, unknown>); return `ask agent "${a.slug}"${extras ? ` (${extras})` : ''}` }
  if (a.action === 'script') { const extras = summarizeOutput(a as Record<string, unknown>); return `run ${a.path}${extras ? ` (${extras})` : ''}` }
  return a.action
}

function summarizeThen(rule: HookRule): string {
  return (rule.then || []).map(summarizeAction).join(' · ') || '(no actions)'
}

// A rule is a "folder / storage rule" when it has a path condition and only
// moves items or their bytes around: they get their own group in the list.
function isFolderRule(rule: HookRule): boolean {
  return rulePaths(rule).length > 0 && (rule.then || []).length > 0
    && (rule.then || []).every((a) => a.action === 'link' || a.action === 'unlink' || a.action === 'store' || a.action === 'unstore')
}

interface RunStat { count: number; errors: number; last: HookRun }

function aggregateRuns(runs: HookRun[]): Record<string, RunStat> {
  const out: Record<string, RunStat> = {}
  for (const run of runs) {
    if (run.handlerType !== 'rule') continue
    const stat = (out[run.handler] ||= { count: 0, errors: 0, last: run })
    stat.count++
    if (run.status === 'error') stat.errors++
    if (run.ts > stat.last.ts) stat.last = run
  }
  return out
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff) || diff < 0) return ''
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Backend to suggest for storage rules: the workspace home folder, else the
// first writable backend that is not the managed blob store.
function preferredBackend(backends: Backend[]): string {
  if (backends.some((b) => b.address === 'workspace:home')) return 'workspace:home'
  return backends.find((b) => b.address !== 'workspace:data')?.address || backends[0]?.address || ''
}

// Form for a tree context-menu prefill (mirror / store rule).
function formFromPrefill(prefill: RulePrefill): RuleForm {
  if (prefill.kind === 'store') {
    const where = prefill.path ? ` filed under ${prefill.path.replace(/^(ctx|dir):/, '')}` : ''
    return {
      ...EMPTY_FORM,
      description: prefill.storeTo
        ? `Keep files${where} on ${prefill.storeTo}${prefill.storeFolder ? `/${prefill.storeFolder}` : ''}`
        : `Keep files${where} in a real folder`,
      schema: 'file',
      events: ['document.inserted', 'document.linked'],
      conditions: [{ field: 'path', value: prefill.path || '' }],
      actions: [{ ...emptyAction('store'), a: prefill.storeTo || '', storeFolder: prefill.storeFolder || '', recursive: true }],
    }
  }
  return {
    ...EMPTY_FORM,
    description: `Mirror ${prefill.path} into ${prefill.target}`,
    events: ['document.inserted', 'document.linked'],
    conditions: [{ field: 'path', value: prefill.path || '' }],
    actions: [{ ...emptyAction('link'), a: prefill.target || 'dir:/', recursive: true }],
  }
}

// ── small presentational pieces ──────────────────────────────────────────────

const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'
const inputClass = 'h-10 text-sm'

function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50', checked && 'border-primary/40 bg-primary/5')}
    >
      <span className={cn('mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors', checked ? 'bg-primary' : 'bg-muted-foreground/30')}>
        <span className={cn('h-4 w-4 rounded-full bg-background shadow transition-transform', checked && 'translate-x-4')} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs leading-relaxed text-muted-foreground">{hint}</span>}
      </span>
    </button>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex h-10 rounded-md border bg-background p-1">
      {options.map((o) => (
        <button
          key={o.value} type="button"
          onClick={() => onChange(o.value)}
          className={cn('rounded px-3 text-sm transition-colors', value === o.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button" title={title} onClick={onClick} aria-pressed={active}
      className={cn('h-9 rounded-full border px-3.5 text-sm transition-colors', active ? 'border-primary bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
    >
      {children}
    </button>
  )
}

function SectionHeading({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{step}</span>
      <div>
        <h3 className="text-base font-semibold leading-7">{title}</h3>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

function IconBadge({ icon: Icon, tone, size = 'md' }: { icon: LucideIcon; tone: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-xl', size === 'lg' ? 'h-12 w-12' : 'h-10 w-10', tone)}>
      <Icon className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />
    </span>
  )
}

// ── component ────────────────────────────────────────────────────────────────

export function RuleBuilder({ workspaceId, onOpenJson, backfillLimit, prefill, onPrefillConsumed }: RuleBuilderProps) {
  const { showToast } = useToast()
  const [rules, setRules] = useState<HookRule[]>([])
  const [runStats, setRunStats] = useState<Record<string, RunStat>>({})
  const loadRunStats = (id: string) => {
    listRuns(id, { limit: 500 }).then((runs) => setRunStats(aggregateRuns(runs))).catch(() => setRunStats({}))
  }
  const [isLoading, setIsLoading] = useState(true)
  const [form, setForm] = useState<RuleForm | null>(null)
  const [choosing, setChoosing] = useState(false) // recipe gallery open
  const [isSaving, setIsSaving] = useState(false)
  const [scripts, setScripts] = useState<string[]>([])
  const [backends, setBackends] = useState<Backend[]>([])
  const formRef = useRef<HTMLDivElement>(null)

  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId)
  if (workspaceId !== prevWorkspaceId) {
    setPrevWorkspaceId(workspaceId)
    setIsLoading(true)
  }

  useEffect(() => {
    void getRules(workspaceId)
      .then((r) => setRules(r))
      .finally(() => setIsLoading(false))
    loadRunStats(workspaceId)
  }, [workspaceId])

  // Prefilled rule from a tree context menu. Applied during render
  // (prev-value-in-state, like the workspace switch above) so the form is
  // there on the very first paint; the parent is told afterwards so it can
  // drop the prefill from the URL.
  const [prevPrefill, setPrevPrefill] = useState<RulePrefill | null | undefined>(null)
  if (prefill !== prevPrefill) {
    setPrevPrefill(prefill)
    if (prefill) {
      setForm(formFromPrefill(prefill))
      setChoosing(false)
    }
  }
  useEffect(() => {
    if (prefill) onPrefillConsumed?.()
  }, [prefill, onPrefillConsumed])

  useEffect(() => {
    listScripts(workspaceId).then((files) => setScripts(files.map((f) => f.path))).catch(() => setScripts([]))
  }, [workspaceId])

  // Storage backends for the store/unstore pickers (writable ones only — a
  // rule that files photos onto a read-only mount can never succeed). Store
  // actions still waiting for a backend (recipe/prefill opened before the
  // list arrived) get the preferred one.
  useEffect(() => {
    listBackends(workspaceId)
      .then((list) => {
        const writable = list.filter((b) => b.kind === 'storage' && b.config?.readOnly !== true)
        setBackends(writable)
        const fallback = preferredBackend(writable)
        if (fallback) {
          setForm((f) => (f && f.actions.some((a) => a.kind === 'store' && !a.a)
            ? { ...f, actions: f.actions.map((a) => (a.kind === 'store' && !a.a ? { ...a, a: fallback } : a)) }
            : f))
        }
      })
      .catch(() => setBackends([]))
  }, [workspaceId])

  const [schemaOptions, setSchemaOptions] = useState(SCHEMA_OPTIONS)
  useEffect(() => {
    getHooksMeta(workspaceId).then((meta) => {
      if (meta.schemas?.length) {
        setSchemaOptions([
          { value: '', label: 'any item' },
          ...meta.schemas.map((s) => ({ value: s.id, label: `${s.name} (${s.count})` })),
        ])
      }
    }).catch(() => {})
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
      showToast({ title: 'Add an action', description: 'Pick at least one "then" action and fill in its fields.', variant: 'destructive' })
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

  const [backfillingId, setBackfillingId] = useState<string | null>(null)
  const backfillRule = async (id: string) => {
    setBackfillingId(id)
    try {
      const dry = await backfillHook(workspaceId, { ruleId: id, dryRun: true, limit: backfillLimit })
      const wouldFire = dry.results.filter((r) => r.matched).length
      if (!wouldFire) {
        showToast({ title: 'Apply to existing items', description: `No matches among ${dry.processed} existing documents (conditions evaluate against each document's current tree placements). Raise the batch size in the toolbar to cover more.` })
        return
      }
      if (!confirm(`Rule "${id}" matches ${wouldFire} of ${dry.processed} existing documents. Run its actions on them now?`)) return
      const run = await backfillHook(workspaceId, { ruleId: id, limit: backfillLimit })
      showToast({
        title: 'Done',
        description: `${run.matched} documents processed, ${run.failed} failed. Details in the Runs tab`,
        ...(run.failed ? { variant: 'destructive' as const } : {}),
      })
    } catch (error) {
      showToast({ title: 'Backfill failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBackfillingId(null)
      loadRunStats(workspaceId)
    }
  }

  const setField = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  const openRecipe = (recipe: Recipe) => {
    setForm(recipe.build({ backend: preferredBackend(backends) }))
    setChoosing(false)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const editRule = (rule: HookRule) => {
    const parsed = parseRule(rule)
    if (parsed) { setForm(parsed); setChoosing(false); requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
    else onOpenJson?.()
  }

  // Tree picker for path fields. Conditions may match anywhere incl. the
  // backends mirror; link/unlink targets exclude it (read-only for rules);
  // the store folder picker browses the backends mirror only.
  const [picker, setPicker] = useState<{ target: 'condition' | 'action' | 'storeFolder'; index: number } | null>(null)

  const prefixedPath = (path: string, ctx: LinkToTarget) =>
    ctx.treeType === 'context' ? path : ctx.treeName === 'directory' ? `dir:${path}` : `${ctx.treeName}:${path}`

  const applyPicked = (paths: string[], ctx: LinkToTarget) => {
    if (!picker || !form || !paths.length) { setPicker(null); return }
    if (picker.target === 'storeFolder') {
      const parts = splitBackendsPath(paths[0])
      setField('actions', form.actions.map((a, j) => (j === picker.index
        ? { ...a, storeFolder: parts?.rel || '', ...(parts?.backend && backends.some((b) => b.address === parts.backend) ? { a: parts.backend } : {}) }
        : a)))
    } else if (picker.target === 'condition') {
      const prefixed = paths.map((p) => prefixedPath(p, ctx))
      setField('conditions', form.conditions.map((c, j) => (j === picker.index ? { ...c, value: prefixed.join(' | ') } : c)))
    } else {
      const prefixed = paths.map((p) => prefixedPath(p, ctx))
      setField('actions', form.actions.map((a, j) => (j === picker.index ? { ...a, a: prefixed.join(', ') } : a)))
    }
    setPicker(null)
  }

  const browseButton = (target: 'condition' | 'action' | 'storeFolder', index: number, title = 'Browse…') => (
    <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 px-3" title={title} onClick={() => setPicker({ target, index })}>
      <FolderTree className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Browse</span>
    </Button>
  )

  const hasPathCondition = Boolean(form?.conditions.some((c) => c.field === 'path' && c.value.trim()))
  const backendLabel = (b: Backend) => `${b.address}${b.address === 'workspace:data' ? ' — managed blob store (default)' : b.address === 'workspace:home' ? ' — workspace home folder' : b.driver ? ` — ${b.driver}` : ''}`

  const backendSelect = (value: string, onChange: (v: string) => void, emptyLabel: string, placeholder = 'workspace:home') => (
    backends.length ? (
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {backends.map((b) => <option key={b.address} value={b.address}>{backendLabel(b)}</option>)}
        {value && !backends.some((b) => b.address === value) && <option value={value}>{value}</option>}
      </select>
    ) : (
      <Input className={cn(inputClass, 'font-mono')} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    )
  )

  const folderRules = rules.filter(isFolderRule)
  const otherRules = rules.filter((r) => !isFolderRule(r))

  // ── rule card ──
  const RuleCard = ({ rule }: { rule: HookRule }) => {
    const enabled = rule.enabled !== false
    const editable = parseRule(rule) !== null
    const stat = runStats[rule.id]
    const primary = actionMeta(rule.then?.[0]?.action || 'link')
    const paths = rulePaths(rule)
    return (
      <div className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4 transition-opacity sm:flex-row sm:items-start sm:gap-4', !enabled && 'opacity-60')}>
        <IconBadge icon={primary.icon} tone={primary.tone} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold leading-6">{rule.description || rule.id}</h3>
            {rule.approval === true && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">needs approval</span>}
            {rule.cascade === true && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">incl. automation-created</span>}
            {!editable && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title="This rule uses matchers the builder cannot show; edit it as JSON.">JSON only</span>}
          </div>
          <p className="text-sm text-muted-foreground">{summarizeWhen(rule, schemaOptions)}</p>
          <p className="flex items-start gap-1.5 text-sm"><ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span>{summarizeThen(rule)}</span></p>
          {paths.length > 0 && (
            <p className="truncate font-mono text-xs text-muted-foreground" title={paths.join(' | ')}>{paths.join(' | ')}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {stat ? (
              <span className={stat.last.status === 'error' ? 'text-destructive' : ''} title={stat.last.error || stat.last.skipReason || ''}>
                ran {stat.count}×{stat.errors ? ` (${stat.errors} failed)` : ''} · last {stat.last.status} {relativeTime(stat.last.ts)}
              </span>
            ) : 'not run yet'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
          <button
            type="button" role="switch" aria-checked={enabled} disabled={isSaving}
            title={enabled ? 'Enabled — click to pause' : 'Paused — click to enable'}
            onClick={() => toggleRule(rule.id)}
            className={cn('mr-1 inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors', enabled ? 'bg-primary' : 'bg-muted-foreground/30')}
          >
            <span className={cn('h-5 w-5 rounded-full bg-background shadow transition-transform', enabled && 'translate-x-5')} />
          </button>
          <Button size="sm" variant="ghost" className="h-9 px-2.5" title="Apply this rule to existing items (dry-run first)" disabled={backfillingId !== null} onClick={() => backfillRule(rule.id)}>
            {backfillingId === rule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            <span className="ml-1.5 hidden md:inline">Apply</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-9 px-2.5" title={editable ? 'Edit rule' : 'Edit as JSON'} onClick={() => editRule(rule)}>
            {editable ? <Pencil className="h-4 w-4" /> : <Braces className="h-4 w-4" />}
            <span className="ml-1.5 hidden md:inline">Edit</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-9 px-2.5 text-destructive hover:text-destructive" title="Delete rule" onClick={() => deleteRule(rule.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  const gallery = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">What should happen automatically?</h3>
        {choosing && <Button size="sm" variant="ghost" onClick={() => setChoosing(false)}><X className="mr-1 h-4 w-4" /> Close</Button>}
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RECIPES.map((r) => (
          <button
            key={r.id} type="button" onClick={() => openRecipe(r)}
            className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <IconBadge icon={r.icon} tone={r.tone} size="lg" />
            <span className="min-w-0">
              <span className="block text-base font-semibold leading-6">{r.title}</span>
              <span className="mt-1 block break-words text-sm leading-relaxed text-muted-foreground">{r.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rules</h2>
          <p className="text-sm text-muted-foreground">
            Rules run automatically as items arrive or get filed — no code needed. Stored in{' '}
            <span className="font-mono">rules.json</span> in the workspace git.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {onOpenJson && (
            <Button variant="ghost" onClick={onOpenJson} title="Edit rules.json directly">
              <Braces className="mr-1.5 h-4 w-4" /> JSON
            </Button>
          )}
          <Button onClick={() => { setForm(null); setChoosing(true) }} disabled={choosing}>
            <Plus className="mr-1.5 h-4 w-4" /> New rule
          </Button>
        </div>
      </div>

      {choosing && !form && gallery}

      {form && (
        <div ref={formRef} className="scroll-mt-4 space-y-6 rounded-xl border bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">{form.id ? 'Edit rule' : 'New rule'}</h3>
            <Button variant="ghost" size="sm" onClick={() => setForm(null)}><X className="mr-1 h-4 w-4" /> Cancel</Button>
          </div>

          <Field label="Name" hint="Shown in the list and the run log.">
            <Input className="h-11 text-base" placeholder="Keep UI designs in Projects/Canvas/UI" value={form.description} onChange={(e) => setField('description', e.target.value)} />
          </Field>

          {/* ── When ── */}
          <section className="space-y-4">
            <SectionHeading step={1} title="When…" hint="What the rule reacts to. All conditions must match; repeat a condition for either/or." />
            <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
              <Field label="Item">
                <select className={selectClass} value={form.schema} onChange={(e) => setField('schema', e.target.value)}>
                  {schemaOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {form.schema && !schemaOptions.some((o) => o.value === form.schema) && (
                    <option value={form.schema}>{form.schema.replace(/^data\/schema\//, '')}</option>
                  )}
                </select>
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Event <span className="font-normal text-muted-foreground">(any of)</span></span>
                <div className="flex flex-wrap gap-2">
                  {EVENT_OPTIONS.map((o) => {
                    const active = form.events.includes(o.value)
                    return (
                      <Chip key={o.value} active={active} title={o.hint} onClick={() => {
                        const next = active ? form.events.filter((v) => v !== o.value) : [...form.events, o.value]
                        if (next.length) setField('events', next)
                      }}>{o.label}</Chip>
                    )
                  })}
                </div>
              </div>
            </div>

            {form.conditions.length > 0 && (
              <div className="space-y-2">
                {form.conditions.map((row, i) => {
                  const field = CONDITION_FIELDS.find((f) => f.key === row.field)
                  return (
                    <div key={i} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-2 sm:grid-cols-[2.25rem_minmax(0,240px)_1fr_auto]">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground" title="Same condition again = either may match (OR); different conditions must all match (AND)">
                        {form.conditions.slice(0, i).some((c) => c.field === row.field) ? 'or' : i === 0 ? 'and' : 'and'}
                      </span>
                      <select
                        className={selectClass}
                        value={row.field}
                        onChange={(e) => setField('conditions', form.conditions.map((c, j) => (j === i ? { ...c, field: e.target.value as ConditionKey } : c)))}
                      >
                        {CONDITION_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      <div className="order-4 col-span-3 flex gap-2 sm:order-3 sm:col-span-1">
                        <Input
                          className={cn(inputClass, 'font-mono')}
                          placeholder={field?.hint}
                          value={row.value}
                          onChange={(e) => setField('conditions', form.conditions.map((c, j) => (j === i ? { ...c, value: e.target.value } : c)))}
                        />
                        {row.field === 'path' && browseButton('condition', i, 'Browse the workspace trees')}
                      </div>
                      <Button size="sm" variant="ghost" className="order-3 h-10 w-10 p-0 text-muted-foreground sm:order-4" title="Remove condition" onClick={() => setField('conditions', form.conditions.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" onClick={() => setField('conditions', [...form.conditions, { field: form.schema === 'email' ? 'from' : 'path', value: '' }])}>
                <Plus className="mr-1 h-4 w-4" /> Add condition
              </Button>
              <span className="text-xs text-muted-foreground">Separate alternatives with <span className="font-mono">|</span>, e.g. <span className="font-mono">image/* | video/*</span>.</span>
            </div>
          </section>

          {/* ── Then ── */}
          <section className="space-y-4">
            <SectionHeading step={2} title="Then…" hint="Actions run in order. The item keeps its id, tags and folders unless an action says otherwise." />
            {form.actions.map((row, i) => {
              const set = (patch: Partial<ActionRow>) => setField('actions', form.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)))
              const meta = actionMeta(row.kind)
              const outputControls = (label: string) => (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <p className="text-sm font-medium">What to do with the {label}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Save as a note at" hint="Context path by default, dir:/path for the directory tree.">
                      <Input className={cn(inputClass, 'font-mono')} placeholder="/notes/summaries (optional)" value={row.notePath} onChange={(e) => set({ notePath: e.target.value })} />
                    </Field>
                    {row.notePath.trim() && (
                      <Field label="Note title">
                        <Input className={inputClass} placeholder={'Summary: {{doc.data.subject}}'} value={row.noteTitle} onChange={(e) => set({ noteTitle: e.target.value })} />
                      </Field>
                    )}
                    <Field label="Save as a file at" hint="Relative path under the workspace home folder or in the data blob store.">
                      <Input className={cn(inputClass, 'font-mono')} placeholder="logs/agent.log (optional)" value={row.filePath} onChange={(e) => set({ filePath: e.target.value })} />
                    </Field>
                    {row.filePath.trim() && (<>
                      <Field label="File lives in">
                        <select className={selectClass} value={row.fileBackend} onChange={(e) => set({ fileBackend: e.target.value as 'home' | 'data' })}>
                          <option value="home">the workspace home folder</option>
                          <option value="data">the data blob store</option>
                        </select>
                      </Field>
                      <Field label="Also file the saved file under" hint="Index it as a document at this tree path.">
                        <Input className={cn(inputClass, 'font-mono')} placeholder="/path (optional)" value={row.fileInsert} onChange={(e) => set({ fileInsert: e.target.value })} />
                      </Field>
                    </>)}
                  </div>
                  <Toggle checked={row.notifyReply} onChange={(v) => set({ notifyReply: v })} label="Send it to me as a message" />
                </div>
              )
              const storeFolder = row.storeFolder.trim().replace(/^\/+|\/+$/g, '')
              const storePreview = row.kind === 'store' && row.a
                ? `${row.a}/${[storeFolder, row.recursive && hasPathCondition ? '<sub-folders>' : '', row.storeName === 'keep' ? '<original name>' : row.storeName === 'title' ? '<title>.<ext>' : row.storeName === 'dated' ? DATED_NAME : (row.b || '<name>')].filter(Boolean).join('/')}`
                : ''
              return (
                <div key={i} className="space-y-4 rounded-xl border bg-background p-4">
                  <div className="flex items-center gap-3">
                    <IconBadge icon={meta.icon} tone={meta.tone} />
                    <select className={cn(selectClass, 'flex-1 font-medium')} value={row.kind} onChange={(e) => set(emptyAction(e.target.value as ActionKey))}>
                      {ACTION_FIELDS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" className="h-10 w-10 shrink-0 p-0 text-muted-foreground" title="Remove action" disabled={form.actions.length === 1} onClick={() => setField('actions', form.actions.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {(row.kind === 'link' || row.kind === 'unlink') && (
                    <div className="space-y-3">
                      <Field label={row.kind === 'link' ? 'Folder(s)' : 'Remove from folder(s)'} hint="Context-tree path by default; dir:/path for the directory tree. Comma-separate several.">
                        <div className="flex gap-2">
                          <Input className={cn(inputClass, 'font-mono')} placeholder={row.kind === 'link' ? '/work/urgent or dir:/projects/x' : '/inbox or dir:/staging'} value={row.a} onChange={(e) => set({ a: e.target.value })} />
                          {browseButton('action', i)}
                        </div>
                      </Field>
                      {row.kind === 'link' && (
                        <Field label="Tags" hint="Optional, comma-separated.">
                          <Input className={cn(inputClass, 'font-mono')} placeholder="custom/design, ui" value={row.b} onChange={(e) => set({ b: e.target.value })} />
                        </Field>
                      )}
                      <Toggle
                        checked={row.recursive} onChange={(v) => set({ recursive: v })}
                        label="Keep sub-folders"
                        hint={hasPathCondition ? 'The part of the item\'s path below the "is under the folder" prefix is appended to the target: …/foo/a/b → target/a/b.' : 'Needs an "is under the folder" condition to know where sub-folders start.'}
                        disabled={!hasPathCondition}
                      />
                    </div>
                  )}

                  {row.kind === 'tag' && (
                    <Field label="Tags" hint="Comma-separated.">
                      <Input className={cn(inputClass, 'font-mono')} placeholder="urgent, follow-up" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                    </Field>
                  )}

                  {row.kind === 'store' && (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Storage backend" hint="Where the file's bytes should live. Only writable backends are listed.">
                          {backendSelect(row.a, (v) => set({ a: v }), 'pick a backend…')}
                        </Field>
                        <Field label="Folder on that backend" hint="Relative to the backend root. Leave empty for the root.">
                          <div className="flex gap-2">
                            <Input className={cn(inputClass, 'font-mono')} placeholder="Projects/Canvas/UI" value={row.storeFolder} onChange={(e) => set({ storeFolder: e.target.value })} />
                            {browseButton('storeFolder', i, 'Browse storage backends')}
                          </div>
                        </Field>
                        <Field label="File name">
                          <select className={selectClass} value={row.storeName} onChange={(e) => set({ storeName: e.target.value as StoreName })}>
                            {STORE_NAME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </Field>
                        <Field label="Move or copy" hint={row.storeMode === 'move' ? 'The blob-store copy is removed once the file is safely there.' : 'The file stays in the blob store as well.'}>
                          <Segmented value={row.storeMode} onChange={(v) => set({ storeMode: v })} options={[{ value: 'move', label: 'Move' }, { value: 'copy', label: 'Copy' }]} />
                        </Field>
                        {row.storeName === 'custom' && (
                          <Field className="sm:col-span-2" label="Name template" hint={'Tokens: {{YYYY}} {{MM}} {{DD}} {{HH}} {{mm}} {{ss}} (photo capture time when present), {{ext}} {{basename}} {{filename}} {{title}} {{id}}, plus {{doc.…}} fields. Slashes create sub-folders.'}>
                            <Input className={cn(inputClass, 'font-mono')} placeholder={'{{YYYY}}-{{MM}}-{{DD}} {{title}}{{ext}}'} value={row.b} onChange={(e) => set({ b: e.target.value })} />
                          </Field>
                        )}
                      </div>
                      <Toggle
                        checked={row.recursive} onChange={(v) => set({ recursive: v })}
                        label="Keep sub-folders"
                        hint={hasPathCondition ? 'Filed under …/UI/mobile → stored under Folder/mobile. Needs the "is under the folder" condition above.' : 'Add an "is under the folder" condition to mirror sub-folders.'}
                        disabled={!hasPathCondition}
                      />
                      {storePreview && (
                        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                          <span className="text-muted-foreground">Files land in</span>
                          <span className="break-all font-mono">{storePreview}</span>
                        </p>
                      )}
                      <details className="group rounded-lg border">
                        <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-medium">
                          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /> More options
                        </summary>
                        <div className="grid gap-4 border-t p-3 sm:grid-cols-2">
                          <Field label="Only when the file is currently on" hint="Guard that keeps the rule idempotent. Default: any backend other than the target.">
                            {backendSelect(row.storeFrom, (v) => set({ storeFrom: v }), 'any other backend', 'workspace:data (optional)')}
                          </Field>
                          <Field label="If the name is already taken">
                            <select className={selectClass} value={row.storeConflict} onChange={(e) => set({ storeConflict: e.target.value as 'rename' | 'error' | 'overwrite' })}>
                              <option value="rename">add -1, -2, … to the name</option>
                              <option value="error">skip the file</option>
                              <option value="overwrite">overwrite the existing file</option>
                            </select>
                          </Field>
                        </div>
                      </details>
                      <p className="text-xs text-muted-foreground">Moves the stored bytes only — the item keeps its id, tags and every folder it is filed in.</p>
                    </div>
                  )}

                  {row.kind === 'unstore' && (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Delete the file from">
                          {backendSelect(row.a, (v) => set({ a: v }), 'pick a backend…', 'workspace:data')}
                        </Field>
                        <Field label="…but only once it is also on" hint="Safety: the copy is dropped only after another backend holds the file.">
                          {backendSelect(row.b, (v) => set({ b: v }), 'anywhere else', 'workspace:home (optional)')}
                        </Field>
                      </div>
                      <Toggle checked={row.keepLast} onChange={(v) => set({ keepLast: v })} label="Never delete the last copy" hint="Off means the rule may delete the only remaining copy of a file. Leave it on unless you mean exactly that." />
                      <p className="text-xs text-muted-foreground">Deletes the stored bytes on that backend only — copies elsewhere and the item itself are kept.</p>
                    </div>
                  )}

                  {row.kind === 'notify' && (
                    <Field label="Message" hint={'Templates work: {{doc.data.subject}}, {{doc.data.from}}, {{doc.data.url}}, {{doc.data.title}}…'}>
                      <Input className={inputClass} placeholder={'New mail from {{doc.data.from}}: {{doc.data.subject}}'} value={row.a} onChange={(e) => set({ a: e.target.value })} />
                    </Field>
                  )}
                  {row.kind === 'delete' && (
                    <p className="text-sm text-muted-foreground">Removes the item from the Canvas index. Files, blobs and mail on storage backends stay untouched.</p>
                  )}
                  {row.kind === 'destroy' && (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">⚠ Irreversible: deletes the stored bytes too (blobs, workspace files, mail on the server), then removes the item from the index.</p>
                  )}
                  {row.kind === 'agent' && (
                    <div className="space-y-3">
                      <Field label="Agent" hint="The agent's slug.">
                        <Input className={cn(inputClass, 'font-mono sm:max-w-xs')} placeholder="assistant" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                      </Field>
                      <Field label="Prompt" hint={'Templates over the full document: {{doc.data.subject}}, {{doc.data.body}} / {{doc.data.bodyHtml}} (emails), {{doc.data.url}}… Objects are inserted as JSON.'}>
                        <textarea
                          className="min-h-28 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                          placeholder={'Dear agent, you will get an email subject and body. Summarize it in plain markdown.\n\nSubject: {{doc.data.subject}}\nBody: {{doc.data.body}}'}
                          value={row.b}
                          onChange={(e) => set({ b: e.target.value })}
                        />
                      </Field>
                      {outputControls('reply')}
                    </div>
                  )}
                  {row.kind === 'script' && (
                    <div className="space-y-3">
                      <Field label="Script" hint="From the Scripts section of this workspace.">
                        {scripts.length ? (
                          <select className={cn(selectClass, 'font-mono sm:max-w-md')} value={row.a} onChange={(e) => set({ a: e.target.value })}>
                            <option value="">pick a script…</option>
                            {scripts.map((s) => <option key={s} value={`scripts/${s}`}>{s}</option>)}
                          </select>
                        ) : (
                          <Input className={cn(inputClass, 'font-mono sm:max-w-md')} placeholder="scripts/my-script.sh" value={row.a} onChange={(e) => set({ a: e.target.value })} />
                        )}
                      </Field>
                      {outputControls('output')}
                    </div>
                  )}
                </div>
              )
            })}
            <Button size="sm" variant="outline" onClick={() => setField('actions', [...form.actions, emptyAction('tag')])}>
              <Plus className="mr-1 h-4 w-4" /> Add another action
            </Button>
          </section>

          {/* ── Options ── */}
          <section className="space-y-3">
            <SectionHeading step={3} title="Options" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                checked={form.approval} onChange={(v) => setField('approval', v)}
                label="Ask me before running"
                hint="Actions are held in the Pending queue for review — approve (optionally amended) or decline — instead of running automatically."
              />
              <Toggle
                checked={form.cascade} onChange={(v) => setField('cascade', v)}
                label="Also react to items created by automation"
                hint="Off by default so rules, hooks and agents cannot trigger each other in a loop. A server-side depth limit still stops runaway chains."
              />
            </div>
          </section>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button className="h-10 px-5" onClick={submit} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} {form.id ? 'Save changes' : 'Create rule'}
            </Button>
            <Button className="h-10" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {picker && (
        <LinkToSidePanel onClose={() => setPicker(null)}>
          <LinkToCard
            sizeClassName={LINK_TO_SIDE_SIZE}
            fixedWorkspaceName={workspaceId}
            multiple={picker.target !== 'storeFolder'}
            tabs={picker.target === 'condition' ? ['context', 'directory', 'backends'] : picker.target === 'storeFolder' ? ['backends'] : ['context', 'directory']}
            title={picker.target === 'condition' ? 'Match items under…' : picker.target === 'storeFolder' ? 'Store files under…' : 'File into…'}
            confirmLabel={picker.target === 'storeFolder' ? 'Use folder' : 'Use path'}
            onConfirm={applyPicked}
            onClose={() => setPicker(null)}
          />
        </LinkToSidePanel>
      )}

      {isLoading ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rules.length === 0 ? (
        !choosing && !form && (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="text-base font-medium">No rules yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Pick a starting point below, or right-click a folder in the tree and choose “Create rule…”.</p>
            </div>
            {gallery}
          </div>
        )
      ) : (
        <div className="space-y-6">
          {folderRules.length > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <FolderSymlink className="h-4 w-4" /> Folder &amp; storage rules
                <span className="font-normal normal-case tracking-normal">· right-click a folder in the tree to add one</span>
              </h3>
              <div className="space-y-3">{folderRules.map((rule) => <RuleCard key={rule.id} rule={rule} />)}</div>
            </section>
          )}
          {otherRules.length > 0 && (
            <section className="space-y-3">
              {folderRules.length > 0 && (
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><Sparkles className="h-4 w-4" /> Other rules</h3>
              )}
              <div className="space-y-3">{otherRules.map((rule) => <RuleCard key={rule.id} rule={rule} />)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

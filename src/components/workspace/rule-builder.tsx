import './rule-builder.css'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Plus, Pencil, Trash2, Save, X, Braces, PlayCircle, FolderTree, FolderSymlink, HardDrive, Image, Mail, Bot,
  Sparkles, Tag, Bell, Terminal, Trash, ChevronDown, ArrowRight, Loader2, Download,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { attachmentDestinationPreview } from '@/lib/attachment-destination'
import {
  getRules, saveRules, appendHookRules, backfillHook, getHooksMeta, listRuns, ruleEvents, rulePaths, splitBackendsPath,
  type HookRule, type HookRuleAction, type HookRun, type RulePrefill,
} from '@/services/hooks'
import { listScripts } from '@/services/scripts'
import { listBackends, type Backend } from '@/services/workspace'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from '@/components/menu/shared/LinkToSidePanel'
import { LinkToCard, type LinkToTarget } from '@/components/menu/shared/LinkToCard'
import { PathPickerField } from '@/components/menu/shared/PathPickerField'

// Rule builder: recipes → a sentence-style form ("when … then …") that
// translates 1:1 into canvas.hook-rules/v1 rules in git/hooks/rules.json.
// Advanced users edit the same file as JSON in the Hooks section; anything the
// builder cannot represent stays JSON-only and is shown read-only here.

interface RuleBuilderProps {
  workspaceId: string
  createOnly?: boolean
  onCreated?: () => void
  onCancel?: () => void
  /** Open rules.json in the advanced editor (Hooks section). */
  onOpenJson?: () => void
  /** Show the Runs section filtered to one rule (its execution log). */
  onShowRuns?: (handler: string) => void
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
  { value: 'message', label: 'a message' },
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

type ConditionKey = 'fromExact' | 'toExact' | 'senderExact' | 'threadExact' | 'channelExact' | 'platformExact' | 'body' | 'bodyRegex' | 'sender' | 'senderRegex' | 'fromRegex' | 'toRegex' | 'subjectRegex' | 'urlRegex' | 'from' | 'to' | 'subject' | 'urlHost' | 'urlContains' | 'path' | 'pathExact' | 'eventPathExact' | 'mime' | 'attachment'

const CONDITION_FIELDS: Array<{ key: ConditionKey; label: string; hint: string }> = [
  { key: 'toExact', label: 'recipient (To/Cc) is', hint: 'accounting@example.com' },
  { key: 'fromExact', label: 'email sender is', hint: 'person@example.com' },
  { key: 'senderExact', label: 'message sender is', hint: 'Sender ID' },
  { key: 'sender', label: 'message sender contains', hint: 'Sender ID or name' },
  { key: 'senderRegex', label: 'message sender matches regex', hint: 'Sender ID or name pattern' },
  { key: 'body', label: 'body / text contains', hint: 'Words in the email preview or message text' },
  { key: 'bodyRegex', label: 'body / text matches regex', hint: 'invoice\\s+\\d+' },
  { key: 'threadExact', label: 'thread is', hint: 'Thread ID' },
  { key: 'channelExact', label: 'channel / conversation is', hint: 'Channel or conversation ID' },
  { key: 'platformExact', label: 'platform is', hint: 'slack, whatsapp, teams' },
  { key: 'pathExact', label: 'is directly in the folder', hint: 'Current folder membership' },
  { key: 'eventPathExact', label: 'is inserted / linked directly into', hint: 'Exact event destination, e.g. ctx:/foo/bar/baz. Descendant inserts do not match.' },
  { key: 'path', label: 'is under the folder', hint: '/projects/canvas/UI or backends:/workspace/home/foo' },
  { key: 'mime', label: 'file type is', hint: 'image/*, application/pdf' },
  { key: 'from', label: 'sender contains', hint: 'boss@company.tld' },
  { key: 'to', label: 'recipient (To/Cc) contains', hint: 'invoice@my-company.tld' },
  { key: 'subject', label: 'subject contains', hint: 'invoice' },
  { key: 'fromRegex', label: 'sender matches regex', hint: '@(acme|example)\\.com$' },
  { key: 'toRegex', label: 'recipient (To/Cc) matches regex', hint: '^(billing|accounts)@' },
  { key: 'subjectRegex', label: 'subject matches regex', hint: '^invoice\\s+\\d+' },
  { key: 'urlRegex', label: 'URL matches regex', hint: '/(invoice|receipt)/' },
  { key: 'urlHost', label: 'website is', hint: 'youtube.com' },
  { key: 'urlContains', label: 'URL contains', hint: '/watch?v=' },
  { key: 'attachment', label: 'has an attachment of type', hint: 'application/pdf, or * for any' },
]

const EXACT_FIELDS = new Set(['toExact', 'fromExact', 'senderExact', 'threadExact', 'channelExact', 'platformExact'])
const conditionKey = (field: ConditionKey) => EXACT_FIELDS.has(field) ? field.replace(/Exact$/, '') : field.replace(/Regex$/, '')

type ActionKey = 'extractAttachments' | 'link' | 'unlink' | 'tag' | 'store' | 'download' | 'unstore' | 'notify' | 'agent' | 'script' | 'delete' | 'destroy'

const ACTION_FIELDS: Array<{ key: ActionKey; label: string; icon: LucideIcon; tone: string }> = [
  { key: 'extractAttachments', label: 'Extract email attachments to a folder', icon: Mail, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  { key: 'store', label: 'Copy/Move file(s) to a storage backend', icon: HardDrive, tone: 'text-sky-600 dark:text-sky-400 bg-sky-500/10' },
  { key: 'download', label: 'download what the link points at', icon: Download, tone: 'text-rose-600 dark:text-rose-400 bg-rose-500/10' },
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
type DownloadKind = 'auto' | 'image' | 'video' | 'arxiv' | 'page' | 'website'
const DOWNLOAD_KINDS: Array<{ value: DownloadKind; label: string; hint: string }> = [
  { value: 'auto', label: 'whatever it is (auto)', hint: 'arXiv → the PDF · YouTube, Vimeo, TikTok… → the video · image / video / PDF links → the file · anything else → the page.' },
  { value: 'image', label: 'the file itself (image, PDF, …)', hint: 'Fetches the bytes the URL serves.' },
  { value: 'video', label: 'the video (yt-dlp)', hint: 'Best video + audio, merged. Needs yt-dlp on the server.' },
  { value: 'arxiv', label: 'the arXiv paper (PDF)', hint: 'Works for abs/ and pdf/ links.' },
  { value: 'page', label: 'the page with its images & styles', hint: 'One page, offline-readable (wget --page-requisites).' },
  { value: 'website', label: 'the whole website (mirror)', hint: 'Follows links on the same site up to the chosen depth.' },
]

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
  attachmentMime: string
  attachmentName: string
  attachmentPath: string
  includeInline: boolean
  // download action
  dlKind: DownloadKind
  dlDepth: string // website mirror depth
  dlTags: string // tags for the downloaded file (comma-separated)
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
  kind, a: '', b: '', recursive: false, storeFrom: '', storeFolder: '', storeName: 'keep', storeMode: 'copy', storeConflict: 'rename',
  attachmentMime: 'application/pdf', attachmentName: '', attachmentPath: '{{YYYY}}/{{MM}}', includeInline: false,
  dlKind: 'auto', dlDepth: '2', dlTags: '', keepLast: true,
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
    id: 'attachments', title: 'File PDF email attachments by month', icon: Mail, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    blurb: 'Choose a recipient and extract PDF attachments into Accounting / year / month, using the email date. Add a subject or filename filter to narrow it to invoices.',
    build: () => ({
      ...EMPTY_FORM, description: 'File accounting PDF attachments by month', schema: 'email',
      conditions: [{ field: 'toExact', value: '' }],
      actions: [{ ...emptyAction('extractAttachments'), a: 'workspace:home', storeFolder: 'Accounting' }],
    }),
  },
  {
    id: 'store', title: 'Copy/Move file(s) to a storage backend', icon: HardDrive, tone: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
    blurb: 'Uploads land in the managed blob store. Pick a folder in Canvas and a folder on a storage backend — copy or move matching files and optionally recreate their sub-folder paths.',
    build: ({ backend }) => ({
      ...EMPTY_FORM, description: 'Copy/Move file(s) to a storage backend', schema: 'file', events: ['document.inserted', 'document.linked'],
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
    id: 'download', title: 'Download what links point at', icon: Download, tone: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
    blurb: 'Bookmarks filed into a folder are fetched for real — images, videos (yt-dlp), arXiv papers, a page or a whole website — saved to a folder and filed next to the link.',
    build: ({ backend }) => ({
      ...EMPTY_FORM, description: 'Download what links point at', schema: 'tab', events: ['document.inserted', 'document.linked'],
      conditions: [{ field: 'path', value: '' }],
      actions: [{ ...emptyAction('download'), a: backend, storeFolder: 'Downloads', recursive: true }],
    }),
  },
  {
    id: 'agent', title: 'Ask an agent', icon: Bot, tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
    blurb: 'Hand new items to an agent with a prompt; save its reply as a note or get it as a message.',
    build: () => ({
      ...EMPTY_FORM, description: 'Summarize new items',
      actions: [{ ...emptyAction('agent'), b: 'Read document #{{doc.id}} in full with canvas_get, then summarize it in three bullet points.', notifyReply: true }],
    }),
  },
  {
    id: 'blank', title: 'Start from scratch', icon: Sparkles, tone: 'text-muted-foreground bg-muted',
    blurb: 'An empty rule: choose what it reacts to, add conditions and actions.',
    build: () => ({ ...EMPTY_FORM }),
  },
]

// ── form → rule ──────────────────────────────────────────────────────────────

function exactContextSource(conditions: ConditionRow[]): string | null {
  const sources = conditions.filter(c => ['path', 'pathExact', 'eventPathExact'].includes(c.field))
  if (sources.length !== 1 || sources[0].field !== 'eventPathExact') return null
  const paths = splitAlternatives(sources[0].value)
  return paths.length === 1 && /^(ctx|context):\//.test(paths[0]) ? paths[0].replace(/^(ctx|context):/, '').replace(/\/+$/, '') || '/' : null
}

function canKeepStorageSubfolders(conditions: ConditionRow[]): boolean {
  if (exactContextSource(conditions) !== null) return true
  const paths = conditions.filter(c => ['path', 'pathExact', 'eventPathExact'].includes(c.field)).flatMap(c => splitAlternatives(c.value))
  return paths.length > 0 && paths.every(path => /^(dir|directory|backends):\//.test(path))
}

function storagePathPreview(row: ActionRow, conditions: ConditionRow[], backend?: Backend): { root: string; recreated: string; result: string } {
  const clean = (value: string) => value.replace(/\\/g, '/').split('/').filter(part => part && part !== '.' && part !== '..').join('/')
  const root = `${backend?.treePath ? `backends:${backend.treePath}` : row.a}/${clean(row.storeFolder.trim())}`.replace(/\/+$/, '')
  const contextPath = exactContextSource(conditions)
  const recreated = row.recursive ? contextPath !== null ? clean(contextPath) : '<sub-folders>' : ''
  const name = row.storeName === 'keep' ? '<original filename>' : row.storeName === 'title' ? '<title>.<ext>' : row.storeName === 'dated' ? DATED_NAME : (row.b || '<filename>')
  return { root, recreated, result: [root, recreated, name].filter(Boolean).join('/') }
}

function buildRule(form: RuleForm, backends: Backend[] = []): HookRule {
  const when: HookRule['when'] = { event: form.events.length === 1 ? form.events[0] : form.events }
  if (form.schema) when.schema = form.schema

  const multi: Partial<Record<string, unknown[]>> = {}
  const url: Record<string, unknown> = {}
  for (const row of form.conditions) {
    const regex = row.field.endsWith('Regex')
    const exact = EXACT_FIELDS.has(row.field)
    const values = regex || exact ? (row.value.trim() ? [row.value] : []) : splitAlternatives(row.value)
    if (regex && values.length) {
      try { new RegExp(row.value, 'i') } catch { throw new Error(`Invalid regular expression for ${CONDITION_FIELDS.find(field => field.key === row.field)?.label}: ${row.value}`) }
    }
    if (!values.length) throw new Error(`Enter a value for ${CONDITION_FIELDS.find(field => field.key === row.field)?.label || row.field}, or remove that condition.`)
    if (row.field === 'urlHost' || row.field === 'urlContains' || row.field === 'urlRegex') {
      const key = row.field === 'urlHost' ? 'host' : row.field === 'urlRegex' ? 'regex' : 'contains'
      const prev = url[key]
      const merged = [...(Array.isArray(prev) ? prev : prev != null ? [prev] : []), ...values]
      url[key] = merged.length === 1 ? merged[0] : merged
    } else (multi[conditionKey(row.field)] ||= []).push(...(regex ? values.map(regex => ({ regex })) : exact ? values.map(equals => ({ equals })) : values))
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
      if (row.storeMode === 'move' && !row.storeFrom.trim()) throw new Error('Choose the source backend whose copy should be moved.')
      if (row.recursive && !canKeepStorageSubfolders(form.conditions)) throw new Error('Choose a Directory/Backends source path, or one exact Context insertion path, to recreate the path.')
      if (row.recursive && backends.find(backend => backend.address === a)?.capabilities?.paths !== true) throw new Error('This destination has not reported support for folder paths. Choose a supported backend or turn off path recreation.')
      const folder = row.storeFolder.trim().replace(/^\/+|\/+$/g, '')
      const key = row.storeName === 'title' ? TITLE_NAME : row.storeName === 'dated' ? DATED_NAME : row.storeName === 'custom' ? b : ''
      then.push({
        action: 'store',
        to: a,
        ...(row.storeFrom.trim() ? { from: row.storeFrom.trim() } : {}),
        mode: row.storeMode,
        ...(folder ? { folder } : {}),
        ...recursive,
        ...(row.recursive && exactContextSource(form.conditions) !== null ? { pathMode: 'full' } : {}),
        ...(key ? { key } : {}),
        onConflict: row.storeConflict,
      })
    }
    if (row.kind === 'extractAttachments') {
      if (!a) throw new Error('Choose a destination backend for the attachments.')
      const backend = backends.find(backend => backend.address === a)
      if (backend?.capabilities?.paths !== true) throw new Error('Choose an attachment destination with support for folder paths.')
      const mime = splitList(row.attachmentMime)
      if (!mime.length || mime.some(pattern => !/^(\*|[a-z0-9!#$&^_.+-]+\/(\*|[a-z0-9!#$&^_.+-]+)|\*\/\*)$/i.test(pattern))) throw new Error('Enter attachment MIME types, such as application/pdf or image/*. Use * for all attachments.')
      if (!['rename', 'error'].includes(row.storeConflict)) throw new Error('Choose rename or skip for attachment filename conflicts.')
      then.push({
        action: 'extractAttachments', to: a, mime: mime.length === 1 ? mime[0] : mime,
        ...(row.storeFolder.trim() ? { folder: row.storeFolder.trim() } : {}),
        ...(row.attachmentPath.trim() ? { subfolder: row.attachmentPath.trim() } : {}),
        ...(row.attachmentName.trim() ? { filename: row.attachmentName.trim() } : {}),
        ...(row.includeInline ? { includeInline: true } : {}),
        onConflict: row.storeConflict,
      })
    }
    if (row.kind === 'download') {
      const folder = row.storeFolder.trim().replace(/^\/+|\/+$/g, '')
      const depth = Number(row.dlDepth)
      then.push({
        action: 'download',
        to: a || 'workspace:home',
        ...(folder ? { folder } : {}),
        ...recursive,
        ...(row.dlKind !== 'auto' ? { kind: row.dlKind } : {}),
        ...(b ? { insert: splitList(b) } : {}),
        ...(row.dlTags.trim() ? { tags: splitList(row.dlTags) } : {}),
        ...(row.dlKind === 'website' && Number.isFinite(depth) && depth > 0 && depth !== 2 ? { depth } : {}),
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
  const { event, schema, from, to, subject, body, sender, thread, channel, platform, path, pathExact, eventPathExact, mime, url, attachment, ...restWhen } = rule.when
  if (Object.keys(restWhen).length > 0) return null
  const events = Array.isArray(event) ? event : [event]
  if (!events.length || !events.every((e) => typeof e === 'string' && EVENT_OPTIONS.some((o) => o.value === e))) return null
  if (schema !== undefined && typeof schema !== 'string') return null

  const conditions: ConditionRow[] = []
  const push = (field: ConditionKey, value: unknown): boolean => {
    const values = Array.isArray(value) ? value : [value]
    if (field.endsWith('Regex')) {
      if (!values.every(value => typeof value === 'string')) return false
      for (const value of values) conditions.push({ field, value: value as string })
    } else if (EXACT_FIELDS.has(field)) {
      for (const value of values) {
        if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || typeof value.equals !== 'string') return false
        conditions.push({ field, value: value.equals })
      }
    } else if (['from', 'to', 'subject', 'body', 'sender'].includes(field)) {
      for (const value of values) {
        if (typeof value === 'string') conditions.push({ field, value })
        else if ((['from', 'to', 'sender'].includes(field)) && value && typeof value === 'object' && Object.keys(value).length === 1 && typeof value.equals === 'string') conditions.push({ field: `${field}Exact` as ConditionKey, value: value.equals })
        else if (value && typeof value === 'object' && Object.keys(value).length === 1 && typeof value.regex === 'string') conditions.push({ field: `${field}Regex` as ConditionKey, value: value.regex })
        else return false
      }
    } else {
      if (!values.every((v) => typeof v === 'string')) return false
      conditions.push({ field, value: (values as string[]).join(' | ') })
    }
    return true
  }
  if (path !== undefined && !push('path', path)) return null
  if (pathExact !== undefined && !push('pathExact', pathExact)) return null
  if (eventPathExact !== undefined && !push('eventPathExact', eventPathExact)) return null
  if (mime !== undefined && !push('mime', mime)) return null
  if (from !== undefined && !push('from', from)) return null
  if (to !== undefined && !push('to', to)) return null
  if (subject !== undefined && !push('subject', subject)) return null
  if (body !== undefined && !push('body', body)) return null
  if (sender !== undefined && !push('sender', sender)) return null
  if (thread !== undefined && !push('threadExact', thread)) return null
  if (channel !== undefined && !push('channelExact', channel)) return null
  if (platform !== undefined && !push('platformExact', platform)) return null
  if (attachment !== undefined && !push('attachment', attachment)) return null
  if (url !== undefined) {
    if (typeof url === 'string') conditions.push({ field: 'urlContains', value: url })
    else if (url && typeof url === 'object') {
      const u = url as Record<string, unknown>
      const extra = Object.keys(u).filter((k) => k !== 'host' && k !== 'contains' && k !== 'regex')
      if (extra.length) return null
      if (u.host !== undefined && !push('urlHost', u.host)) return null
      if (u.contains !== undefined && !push('urlContains', u.contains)) return null
      if (u.regex !== undefined && !push('urlRegex', u.regex)) return null
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
      if (act.pathMode !== undefined && (act.pathMode !== 'full' || act.recursive !== true || exactContextSource(conditions) === null)) return null
      if (act.recursive === true && exactContextSource(conditions) !== null && act.pathMode !== 'full') return null
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
        storeMode: act.mode === 'move' ? 'move' : 'copy',
        storeConflict: act.onConflict === 'error' || act.onConflict === 'overwrite' ? act.onConflict : 'rename',
      })
    } else if (act.action === 'extractAttachments') {
      const known = new Set(['action', 'to', 'folder', 'subfolder', 'mime', 'filename', 'includeInline', 'onConflict'])
      if (Object.keys(act).some(key => !known.has(key)) || typeof act.to !== 'string') return null
      if (['folder', 'subfolder', 'filename'].some(key => act[key] !== undefined && typeof act[key] !== 'string')) return null
      if (act.includeInline !== undefined && typeof act.includeInline !== 'boolean') return null
      if (act.onConflict !== undefined && act.onConflict !== 'rename' && act.onConflict !== 'error') return null
      const types = Array.isArray(act.mime) ? act.mime : [act.mime ?? '*']
      if (!types.every(type => typeof type === 'string')) return null
      actions.push({
        ...emptyAction('extractAttachments'), a: act.to,
        storeFolder: typeof act.folder === 'string' ? act.folder : '',
        attachmentPath: typeof act.subfolder === 'string' ? act.subfolder : '',
        attachmentMime: types.join(', '), attachmentName: typeof act.filename === 'string' ? act.filename : '',
        includeInline: act.includeInline === true, storeConflict: act.onConflict === 'error' ? 'error' : 'rename',
      })
    } else if (act.action === 'download') {
      const known = new Set(['action', 'to', 'folder', 'recursive', 'kind', 'insert', 'tags', 'depth'])
      if (Object.keys(act).some((k) => !known.has(k))) return null
      const kind = typeof act.kind === 'string' ? act.kind : 'auto'
      if (!DOWNLOAD_KINDS.some((k) => k.value === kind)) return null
      const insert = Array.isArray(act.insert) ? act.insert : typeof act.insert === 'string' ? [act.insert] : []
      if (!insert.every((p) => typeof p === 'string')) return null
      actions.push({
        ...emptyAction('download'),
        a: typeof act.to === 'string' ? act.to : 'workspace:home',
        b: (insert as string[]).join(', '),
        storeFolder: typeof act.folder === 'string' ? act.folder : '',
        recursive: act.recursive === true,
        dlKind: kind as DownloadKind,
        dlDepth: typeof act.depth === 'number' ? String(act.depth) : '2',
        dlTags: Array.isArray(act.tags) ? (act.tags as string[]).join(', ') : '',
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
  const labels: Record<string, string> = { path: 'under', pathExact: 'directly in', eventPathExact: 'inserted / linked directly into', mime: 'type', from: 'from', to: 'to', subject: 'subject', body: 'body / text', sender: 'sender', thread: 'thread', channel: 'conversation', platform: 'platform', url: 'url', attachment: 'attachment' }
  for (const key of Object.keys(labels)) {
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
    return `${a.mode === 'move' ? 'move' : 'copy'} the file to ${a.to}${folder}${a.recursive === true ? a.pathMode === 'full' ? ' (full directory path recreated)' : ' (sub-folder path recreated)' : ''}${name}`
  }
  if (a.action === 'extractAttachments') {
    const destination = [a.to, a.folder, a.subfolder].filter(Boolean).join('/')
    return `extract ${Array.isArray(a.mime) ? a.mime.join(', ') : a.mime || 'all'} attachments to ${destination}${a.filename ? ` (filename contains ${a.filename})` : ''}`
  }
  if (a.action === 'download') {
    const what = DOWNLOAD_KINDS.find((k) => k.value === (a.kind || 'auto'))
    const folder = typeof a.folder === 'string' && a.folder ? `/${a.folder}` : ''
    const where = Array.isArray(a.insert) && a.insert.length ? `, filed at ${a.insert.join(', ')}` : ', filed next to the link'
    return `download ${what?.value === 'auto' ? 'the link (auto-detected)' : what?.label || a.kind} to ${a.to || 'workspace:home'}${folder}${a.recursive === true ? ' (sub-folders kept)' : ''}${where}`
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
  if (prefill.kind === 'document' && prefill.rule) return { ...(parseRule(prefill.rule) || EMPTY_FORM), id: null }
  if (prefill.kind === 'download') {
    const where = prefill.path ? ` filed under ${prefill.path.replace(/^(ctx|dir):/, '')}` : ''
    return {
      ...EMPTY_FORM,
      description: `Download links${where}`,
      schema: 'tab',
      events: ['document.inserted', 'document.linked'],
      conditions: [{ field: 'path', value: prefill.path || '' }],
      actions: [{ ...emptyAction('download'), a: prefill.storeTo || '', storeFolder: prefill.storeFolder || 'Downloads', recursive: true }],
    }
  }
  if (prefill.kind === 'store') {
    const path = prefill.path || ''
    const contextPath = /^(?:(?:ctx|context):)?\//.test(path)
    const conditions: ConditionRow[] = [{ field: contextPath ? 'eventPathExact' : 'path', value: contextPath && path.startsWith('/') ? `ctx:${path}` : path }]
    const where = prefill.path ? `${contextPath ? ' inserted / linked directly into' : ' filed under'} ${prefill.path.replace(/^(ctx|context|dir|directory):/, '')}` : ''
    return {
      ...EMPTY_FORM,
      description: prefill.storeTo
        ? `Copy files${where} to ${prefill.storeTo}${prefill.storeFolder ? `/${prefill.storeFolder}` : ''}`
        : `Copy files${where} to a storage backend`,
      schema: 'file',
      events: ['document.inserted', 'document.linked'],
      conditions,
      actions: [{ ...emptyAction('store'), a: prefill.storeTo || '', storeFolder: prefill.storeFolder || '', recursive: canKeepStorageSubfolders(conditions) }],
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

export function RuleBuilder({ workspaceId, onOpenJson, onShowRuns, backfillLimit, prefill, onPrefillConsumed, createOnly = false, onCreated, onCancel }: RuleBuilderProps) {
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
        const writable = list.filter((b) => b.kind === 'storage' && b.enabled !== false && b.config?.supported !== false && b.config?.readOnly !== true && b.capabilities?.write !== false)
        setBackends(writable)
        const fallback = preferredBackend(writable)
        if (fallback) {
          setForm((f) => (f && f.actions.some((a) => (a.kind === 'store' || a.kind === 'download') && !a.a)
            ? { ...f, actions: f.actions.map((a) => ((a.kind === 'store' || a.kind === 'download') && !a.a ? { ...a, a: fallback } : a)) }
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
    if (!form || isLoading || isSaving) return
    let rule: HookRule
    try { rule = buildRule(form, backends) } catch (error) {
      showToast({ title: 'Invalid rule', description: error instanceof Error ? error.message : 'Check the rule conditions and actions', variant: 'destructive' })
      return
    }
    if (!rule.then.length) {
      showToast({ title: 'Add an action', description: 'Pick at least one "then" action and fill in its fields.', variant: 'destructive' })
      return
    }
    if (createOnly) {
      // Re-read before appending: another editor may have saved while this
      // draft was open. Never replace a failed read with an empty rules file.
      rule.id = `${rule.id}-${Math.random().toString(36).slice(2, 10)}`
      setIsSaving(true)
      try {
        await appendHookRules(workspaceId, rule)
        showToast({ title: 'Rule created', description: 'The rule will run for matching new items.' })
        onCreated?.()
      } catch (error) {
        showToast({ title: 'Could not create rule', description: error instanceof Error ? error.message : 'Failed to save rule', variant: 'destructive' })
      } finally { setIsSaving(false) }
      return
    }
    if (!form.id && rules.some(existing => existing.id === rule.id)) rule.id = `${rule.id}-${Math.random().toString(36).slice(2, 10)}`
    const next = form.id
      ? rules.map((r) => (r.id === form.id ? { ...rule, enabled: r.enabled !== false } : r))
      : [...rules, rule]
    if (await persist(next, form.id ? 'Rule updated' : 'Rule created')) { setForm(null); onCreated?.() }
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
      const exactContext = ctx.treeType === 'context' && form.actions.some(action => action.kind === 'store')
      setField('conditions', form.conditions.map((c, j) => (j === picker.index ? { ...c, ...(exactContext ? { field: 'eventPathExact' as const } : {}), value: prefixed.join(' | ') } : c)))
    } else {
      const prefixed = paths.map((p) => prefixedPath(p, ctx))
      setField('actions', form.actions.map((a, j) => (j === picker.index
        ? (a.kind === 'download' ? { ...a, b: prefixed.join(', ') } : { ...a, a: prefixed.join(', ') })
        : a)))
    }
    setPicker(null)
  }

  const browseButton = (target: 'condition' | 'action' | 'storeFolder', index: number, title = 'Browse…') => (
    <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 px-3" title={title} onClick={() => setPicker({ target, index })}>
      <FolderTree className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Browse</span>
    </Button>
  )

  const hasStorageSourcePath = canKeepStorageSubfolders(form?.conditions || [])
  const hasPathCondition = Boolean(form?.conditions.some((c) => (['path', 'pathExact', 'eventPathExact'].includes(c.field)) && c.value.trim()))
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
      <div className={cn('rule-card rounded-xl border bg-card p-4 transition-opacity', !enabled && 'opacity-60')}>
        <IconBadge icon={primary.icon} tone={primary.tone} />
        <div className="rule-card-content min-w-0 space-y-1.5">
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
              <button
                type="button"
                className={cn('text-left underline-offset-2 hover:underline', stat.last.status === 'error' && 'text-destructive', !onShowRuns && 'cursor-default hover:no-underline')}
                title={onShowRuns ? 'Show this rule\'s run log' : (stat.last.error || stat.last.skipReason || '')}
                onClick={() => onShowRuns?.(rule.id)}
              >
                ran {stat.count}×{stat.errors ? ` (${stat.errors} failed)` : ''} · last {stat.last.status} {relativeTime(stat.last.ts)}
              </button>
            ) : 'not run yet'}
          </p>
        </div>
        <div className="rule-card-actions">
          <button
            type="button" role="switch" aria-checked={enabled} disabled={isSaving}
            title={enabled ? 'Enabled — click to pause' : 'Paused — click to enable'}
            onClick={() => toggleRule(rule.id)}
            className={cn('mr-1 inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors', enabled ? 'bg-primary' : 'bg-muted-foreground/30')}
          >
            <span className={cn('h-5 w-5 rounded-full bg-background shadow transition-transform', enabled && 'translate-x-5')} />
          </button>
          <Button size="sm" variant="ghost" className="h-9 px-2.5" title={rule.when.eventPathExact !== undefined ? 'Requires an original insert/link event. Current folder membership cannot reconstruct its destination.' : 'Apply this rule to existing items (dry-run first)'} disabled={backfillingId !== null || rule.when.eventPathExact !== undefined} onClick={() => backfillRule(rule.id)}>
            {backfillingId === rule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            <span className="rule-card-action-label ml-1.5">Apply</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-9 px-2.5" title={editable ? 'Edit rule' : 'Edit as JSON'} onClick={() => editRule(rule)}>
            {editable ? <Pencil className="h-4 w-4" /> : <Braces className="h-4 w-4" />}
            <span className="rule-card-action-label ml-1.5">Edit</span>
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
      {/* Column count follows the CONTAINER, not the viewport: with the settings
          menu docked, `lg:grid-cols-3` gave three ~200px cards whose text wrapped
          to one word per line. auto-fill only adds a column when one fits. */}
      <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
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
    <div className="rule-builder min-w-0 space-y-5">
      {!createOnly && <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-[1_1_20rem]">
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
      </div>}

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
                        {form.conditions.slice(0, i).some((c) => conditionKey(c.field) === conditionKey(row.field)) ? 'or' : 'and'}
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
                        {(['path', 'pathExact', 'eventPathExact'].includes(row.field)) && browseButton('condition', i, 'Browse the workspace trees')}
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
              <span className="text-xs text-muted-foreground">Contains matches literal text. Regex is case-insensitive: enter the pattern without /…/ delimiters; | stays part of the expression. For other filters, separate alternatives with <span className="font-mono">|</span>, e.g. <span className="font-mono">image/* | video/*</span>.</span>
            </div>
          </section>

          {/* ── Then ── */}
          <section className="space-y-4">
            <SectionHeading step={2} title="Then…" hint="Actions run in order. The item keeps its id, tags and folders unless an action says otherwise." />
            {form.actions.map((row, i) => {
              const set = (patch: Partial<ActionRow>) => setField('actions', form.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)))
              const destination = backends.find(backend => backend.address === row.a)
              const destinationSupportsPaths = destination?.capabilities?.paths === true
              const canRecreateStorageStructure = hasStorageSourcePath && destinationSupportsPaths
              const meta = actionMeta(row.kind)
              const outputControls = (label: string) => (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <p className="text-sm font-medium">What to do with the {label}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Save as a note at" hint="Context path by default, dir:/path for the directory tree.">
                      <PathPickerField inputClassName={inputClass} placeholder="/notes/summaries (optional)" value={row.notePath} onChange={(v) => set({ notePath: v })} fixedWorkspaceName={workspaceId} pickerTitle="Save note under…" onPickTarget={(path, ctx) => set({ notePath: ctx.treeType === 'directory' ? `dir:${path}` : path })} />
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
                        <PathPickerField inputClassName={inputClass} placeholder="/path (optional)" value={row.fileInsert} onChange={(v) => set({ fileInsert: v })} fixedWorkspaceName={workspaceId} tabs={['context']} pickerTitle="File under…" onPickTarget={(path) => set({ fileInsert: path })} />
                      </Field>
                    </>)}
                  </div>
                  <Toggle checked={row.notifyReply} onChange={(v) => set({ notifyReply: v })} label="Send it to me as a message" />
                </div>
              )
              const contextSource = exactContextSource(form.conditions)
              const storePreview = row.kind === 'store' && row.a && (!row.recursive || canRecreateStorageStructure)
                ? storagePathPreview(row, form.conditions, destination) : null
              const attachmentPreview = row.kind === 'extractAttachments' && row.a
                ? attachmentDestinationPreview(row.a, row.storeFolder, row.attachmentPath) : null
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
                        label="Recreate sub-folder path in destination"
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
                        <Field label="Destination root folder" hint="Choose the folder beneath which the path will be recreated. Leave empty to use the backend root.">
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
                        <Field label="Move or copy" hint={row.storeMode === 'move' ? 'Remove only the selected source copy after the destination is safely stored.' : 'Preserve every existing copy.'}>
                          <Segmented value={row.storeMode} onChange={(v) => set({ storeMode: v })} options={[{ value: 'copy', label: 'Copy' }, { value: 'move', label: 'Move' }]} />
                        </Field>
                        {row.storeMode === 'move' && <Field className="sm:col-span-2" label="Move bytes from (required)" hint="Context membership does not identify a source copy. If the file is absent here, nothing is moved. Multiple locations on this backend make the move ambiguous; use copy.">
                          {backendSelect(row.storeFrom, (v) => set({ storeFrom: v }), 'choose a source backend…', 'workspace:data')}
                        </Field>}
                        {row.storeName === 'custom' && (
                          <Field className="sm:col-span-2" label="Name template" hint={'Tokens: {{YYYY}} {{MM}} {{DD}} {{HH}} {{mm}} {{ss}} (photo capture time when present), {{ext}} {{basename}} {{filename}} {{title}} {{id}}, plus {{doc.…}} fields. Slashes create sub-folders.'}>
                            <Input className={cn(inputClass, 'font-mono')} placeholder={'{{YYYY}}-{{MM}}-{{DD}} {{title}}{{ext}}'} value={row.b} onChange={(e) => set({ b: e.target.value })} />
                          </Field>
                        )}
                      </div>
                      <Toggle
                        checked={row.recursive} onChange={(v) => set({ recursive: v })}
                        label={contextSource !== null ? 'Recreate directory path in destination' : 'Recreate sub-folder path in destination'}
                        hint={!destinationSupportsPaths
                          ? 'Choose a destination that reports support for folder paths. Content-addressed blob stores cannot recreate sub-folder paths.'
                          : !hasStorageSourcePath
                            ? 'For Context, choose one folder with “is inserted / linked directly into”. Directory and Backends sources can include sub-folders.'
                            : contextSource !== null
                              ? `Only inserts or links directly into ctx:${contextSource} trigger this rule. Its full path is appended beneath the destination root; descendant inserts do not match.`
                              : 'The path below the source folder is appended beneath the destination root: …/UI/mobile → Root/mobile. Missing destination folders are created.'}
                        disabled={!canRecreateStorageStructure && !row.recursive}
                      />
                      {storePreview && (
                        <div className="space-y-1.5 rounded-lg bg-muted/60 px-3 py-3 text-sm" aria-live="polite">
                          <p className="font-medium">Destination preview</p>
                          <p className="text-xs text-muted-foreground">Root folder: <span className="break-all font-mono">{storePreview.root}/</span></p>
                          {row.recursive && <p className="text-xs text-muted-foreground">Path added beneath it: <span className="break-all font-mono">{storePreview.recreated || '(root)'}/</span></p>}
                          <p className="break-all font-mono">{storePreview.result}</p>
                        </div>
                      )}
                      <details className="group rounded-lg border">
                        <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-medium">
                          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /> More options
                        </summary>
                        <div className="grid gap-4 border-t p-3 sm:grid-cols-2">
                          {row.storeMode === 'copy' && <Field label="Copy bytes from" hint="Optional source restriction. Default: any readable copy outside the destination backend.">
                            {backendSelect(row.storeFrom, (v) => set({ storeFrom: v }), 'any readable source', 'workspace:data (optional)')}
                          </Field>}
                          <Field label="If the name is already taken">
                            <select className={selectClass} value={row.storeConflict} onChange={(e) => set({ storeConflict: e.target.value as 'rename' | 'error' | 'overwrite' })}>
                              <option value="rename">add -1, -2, … to the name</option>
                              <option value="error">skip the file</option>
                              <option value="overwrite">overwrite the existing file</option>
                            </select>
                          </Field>
                        </div>
                      </details>
                      <p className="text-xs text-muted-foreground">The item keeps its id and virtual tree memberships. A move removes the chosen physical source location from the backend tree.</p>
                    </div>
                  )}

                  {row.kind === 'extractAttachments' && (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Attachment types" hint="MIME types, comma-separated. application/pdf for PDFs, image/* for images, or * for all.">
                          <Input className={cn(inputClass, 'font-mono')} placeholder="application/pdf" value={row.attachmentMime} onChange={e => set({ attachmentMime: e.target.value })} />
                        </Field>
                        <Field label="Attachment filename contains" hint="Optional: invoice, faktura, or another literal filename fragment. Every selected attachment must also match its type.">
                          <Input className={inputClass} placeholder="Any matching filename" value={row.attachmentName} onChange={e => set({ attachmentName: e.target.value })} />
                        </Field>
                        <Field label="Storage backend" hint="Choose a writable backend that supports folder paths.">
                          {backendSelect(row.a, v => set({ a: v }), 'pick a backend…')}
                        </Field>
                        <Field label="Destination root folder" hint="Choose the folder beneath which date subfolders will be created. Leave empty to use the backend root.">
                          <div className="flex gap-2">
                            <Input className={cn(inputClass, 'font-mono')} placeholder="Accounting" value={row.storeFolder} onChange={e => set({ storeFolder: e.target.value })} />
                            {browseButton('storeFolder', i, 'Browse storage backends')}
                          </div>
                        </Field>
                        <Field label="Sub-folder path template" hint={'Appended beneath the root folder. {{YYYY}} = year, {{MM}} = month, {{DD}} = day of the email. Leave empty to file directly in the root folder.'}>
                          <Input className={cn(inputClass, 'font-mono')} placeholder="No subfolders" value={row.attachmentPath} onChange={e => set({ attachmentPath: e.target.value })} />
                        </Field>
                        <Field label="If the attachment name is already taken">
                          <select className={selectClass} value={row.storeConflict} onChange={e => set({ storeConflict: e.target.value as 'rename' | 'error' })}>
                            <option value="rename">add -1, -2, … to the name</option>
                            <option value="error">skip the file and report the conflict</option>
                          </select>
                        </Field>
                      </div>
                      {!destinationSupportsPaths && <p className="text-sm text-amber-700 dark:text-amber-400">This destination has not reported support for folder paths. Select a supported backend before saving.</p>}
                      {attachmentPreview && (
                        <div className="space-y-1.5 rounded-lg bg-muted/60 px-3 py-3 text-sm" aria-live="polite">
                          <p className="font-medium">Destination preview</p>
                          <p className="text-xs text-muted-foreground">Example email dated {attachmentPreview.date}. Each email supplies its own date.</p>
                          <p className="text-xs text-muted-foreground">Root folder: <span className="break-all font-mono">{attachmentPreview.root}/</span></p>
                          <p className="text-xs text-muted-foreground">Path added beneath it: <span className="break-all font-mono">{attachmentPreview.added ? `${attachmentPreview.added}/` : '(none)'}</span></p>
                          <p className="break-all font-mono">{attachmentPreview.result}</p>
                        </div>
                      )}
                      <Toggle checked={row.includeInline} onChange={v => set({ includeInline: v })} label="Include inline attachments" hint="Off by default, so signature images and embedded resources are excluded." />
                      <p className="text-xs text-muted-foreground">Copies matching attachments and keeps the email and its original files. Missing folders are created on the backend. Dates use the email's sent date (received/content date, then creation date if absent), in the server's timezone. This does not read the invoice date from the PDF.</p>
                      <p className="text-xs text-muted-foreground">Use Apply on the saved rule to process existing mail within the selected batch size. Add a subject or attachment filename condition if you need to distinguish invoices from other PDFs.</p>
                    </div>
                  )}

                  {row.kind === 'download' && (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Download" hint={DOWNLOAD_KINDS.find((k) => k.value === row.dlKind)?.hint}>
                          <select className={selectClass} value={row.dlKind} onChange={(e) => set({ dlKind: e.target.value as DownloadKind })}>
                            {DOWNLOAD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                          </select>
                        </Field>
                        {row.dlKind === 'website' ? (
                          <Field label="Mirror depth" hint="How many link hops to follow on the same site (1–5).">
                            <Input type="number" min={1} max={5} className={cn(inputClass, 'sm:max-w-32')} value={row.dlDepth} onChange={(e) => set({ dlDepth: e.target.value })} />
                          </Field>
                        ) : <div className="hidden sm:block" />}
                        <Field label="Storage backend" hint="Where the downloaded file's bytes should live.">
                          {backendSelect(row.a, (v) => set({ a: v }), 'workspace:home (default)')}
                        </Field>
                        <Field label="Folder on that backend" hint="Relative to the backend root.">
                          <div className="flex gap-2">
                            <Input className={cn(inputClass, 'font-mono')} placeholder="Downloads" value={row.storeFolder} onChange={(e) => set({ storeFolder: e.target.value })} />
                            {browseButton('storeFolder', i, 'Browse storage backends')}
                          </div>
                        </Field>
                        <Field label="File the download under" hint="Leave empty to file it in the same folder(s) as the link. Comma-separate several.">
                          <div className="flex gap-2">
                            <Input className={cn(inputClass, 'font-mono')} placeholder="same folders as the link" value={row.b} onChange={(e) => set({ b: e.target.value })} />
                            {browseButton('action', i)}
                          </div>
                        </Field>
                        <Field label="Tags for the download" hint="Optional, comma-separated.">
                          <Input className={cn(inputClass, 'font-mono')} placeholder="downloaded, custom/paper" value={row.dlTags} onChange={(e) => set({ dlTags: e.target.value })} />
                        </Field>
                      </div>
                      <Toggle
                        checked={row.recursive} onChange={(v) => set({ recursive: v })}
                        label="Recreate sub-folder path in destination"
                        hint={hasPathCondition ? 'A link filed under …/folder/a/b is downloaded into Folder/a/b.' : 'Add an "is under the folder" condition to mirror sub-folders.'}
                        disabled={!hasPathCondition}
                      />
                      <p className="text-xs text-muted-foreground">
                        The link stays as it is; the download becomes a new file item next to it. Each link is downloaded once per rule.
                        Videos need <span className="font-mono">yt-dlp</span>, pages and websites <span className="font-mono">wget</span> on the server.
                      </p>
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
                      <Field label="Prompt" hint={'Templates use indexed fields: {{doc.id}}, {{doc.data.subject}}, {{doc.data.bodyPreview}} (emails), {{doc.data.url}}… Ask the agent to use canvas_get for full email content. Objects are inserted as JSON.'}>
                        <textarea
                          className="min-h-28 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                          placeholder={'Read email #{{doc.id}} in full with canvas_get and summarize it in plain markdown.\n\nSubject: {{doc.data.subject}}\nPreview: {{doc.data.bodyPreview}}'}
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
            <Button className="h-10 px-5" onClick={submit} disabled={isSaving || isLoading}>
              {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} {form.id ? 'Save changes' : 'Create rule'}
            </Button>
            <Button className="h-10" variant="outline" onClick={() => { setForm(null); onCancel?.() }}>Cancel</Button>
          </div>
        </div>
      )}

      {picker && (
        <LinkToSidePanel onClose={() => setPicker(null)}>
          <LinkToCard
            sizeClassName={LINK_TO_SIDE_SIZE}
            fixedWorkspaceName={workspaceId}
            multiple={picker.target !== 'storeFolder' && !(picker.target === 'condition' && form?.actions.some(action => action.kind === 'store'))}
            tabs={picker.target === 'condition' ? ['context', 'directory', 'backends'] : picker.target === 'storeFolder' ? ['backends'] : ['context', 'directory']}
            title={picker.target === 'condition' ? 'Choose source folder…' : picker.target === 'storeFolder' ? 'Store files under…' : 'File into…'}
            confirmLabel={picker.target === 'storeFolder' ? 'Use folder' : 'Use path'}
            onConfirm={applyPicked}
            onClose={() => setPicker(null)}
          />
        </LinkToSidePanel>
      )}

      {!createOnly && (isLoading ? (
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
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <h3 className="flex items-center gap-2 font-semibold uppercase tracking-wide">
                  <FolderSymlink className="h-4 w-4 shrink-0" /> Folder &amp; storage rules
                </h3>
                <p>Right-click a folder in the tree to add one</p>
              </div>
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
      ))}
    </div>
  )
}

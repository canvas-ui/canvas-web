import { api } from '@/lib/api'

export interface HookFile {
  path: string
  size: number
  modifiedAt: string
}

function hooksBase(workspaceId: string) {
  return `/workspaces/${workspaceId}/hooks`
}

export async function listHooks(workspaceId: string): Promise<HookFile[]> {
  const res = await api.get<HookFile[]>(hooksBase(workspaceId))
  return res || []
}

export async function getHook(workspaceId: string, path: string): Promise<string> {
  const res = await api.get<{ path: string; content: string }>(`${hooksBase(workspaceId)}/${path}`)
  return res?.content ?? ''
}

export async function saveHook(workspaceId: string, path: string, content: string): Promise<void> {
  await api.put(`${hooksBase(workspaceId)}/${path}`, { content })
}

export async function deleteHook(workspaceId: string, path: string): Promise<void> {
  await api.delete(`${hooksBase(workspaceId)}/${path}`)
}

// An `example-`, `disabled-` or (legacy) `_` prefix on the filename marks a
// hook as inactive; the engine skips those. Toggling enable/disable is just a
// rename: enabling strips the prefix, disabling prepends `disabled-`.
const DISABLED_PREFIXES = ['example-', 'disabled-', '_']

function splitPath(path: string): { dir: string; base: string } {
  const slash = path.lastIndexOf('/')
  return {
    dir: slash === -1 ? '' : path.slice(0, slash + 1),
    base: slash === -1 ? path : path.slice(slash + 1),
  }
}

function disabledPrefix(base: string): string | null {
  return DISABLED_PREFIXES.find((p) => base.startsWith(p)) ?? null
}

export function isHookEnabled(path: string): boolean {
  return disabledPrefix(splitPath(path).base) === null
}

export function isExampleHook(path: string): boolean {
  return splitPath(path).base.startsWith('example-')
}

export function toggledHookPath(path: string): string {
  const { dir, base } = splitPath(path)
  const prefix = disabledPrefix(base)
  return dir + (prefix ? base.slice(prefix.length) : `disabled-${base}`)
}

export async function setHookEnabled(workspaceId: string, path: string, enabled: boolean): Promise<string> {
  if (isHookEnabled(path) === enabled) return path
  const next = toggledHookPath(path)
  const content = await getHook(workspaceId, path)
  await saveHook(workspaceId, next, content)
  await deleteHook(workspaceId, path)
  return next
}

// Groups hook files by event for display. `{event}.js` and `{event}/*.js` both
// group under `event`; `lib/*.js` groups under `lib`; `rules.json` (with any
// inactive prefix) and `rules/*.json` group under `rules`.
export function groupHooksByEvent(files: HookFile[]): Record<string, HookFile[]> {
  const groups: Record<string, HookFile[]> = {}
  for (const file of files) {
    let group: string
    if (file.path.includes('/')) {
      group = file.path.split('/')[0]
    } else if (/^(?:example-|disabled-|_)?rules\.json$/.test(file.path)) {
      group = 'rules'
    } else {
      group = file.path.replace(/\.js$/, '')
    }
    ;(groups[group] ||= []).push(file)
  }
  return groups
}

// ── Declarative rules (canvas.hook-rules/v1 in git/hooks/rules.json) ────────
// The simple rule-builder UI reads/writes this file; advanced users can edit
// the same JSON directly in the Hooks section.

export interface HookRuleAction {
  action: string
  [key: string]: unknown
}

export interface HookRule {
  id: string
  enabled?: boolean
  description?: string
  /** Opt-in: also fire on events caused by automation (origin ≠ user). */
  cascade?: boolean
  /** Hold the whole then-block (or set on a single action) for human review. */
  approval?: boolean
  /** JSON paths (e.g. 'actions.0.paths') the reviewer may amend before approving. */
  editable?: string[]
  /** Expire undecided proposals after e.g. '24h', '15m' or ms. */
  ttl?: string | number
  /** `event` is one name or an array (any-of). */
  when: { event: string | string[]; [key: string]: unknown }
  then: HookRuleAction[]
}

/** Event names a rule listens to (normalizes the string | string[] shape). */
export function ruleEvents(rule: HookRule): string[] {
  const e = rule.when?.event
  return Array.isArray(e) ? e.map(String) : e ? [String(e)] : []
}

/** `when.path` of a rule as a list ('' when the rule has no path condition). */
export function rulePaths(rule: HookRule): string[] {
  const p = rule.when?.path
  return Array.isArray(p) ? p.map(String) : typeof p === 'string' ? [p] : []
}

// ── Folder rules (backends mirror → directory tree) ─────────────────────────
// A backends-tree path is /<driver>/<address>/<rel> (workspace:home mounts at
// /workspace/home, device mounts at /device/<device>/<mount>). Splitting it
// gives the backend name the hook needs and the folder below the mount.

export interface BackendsPathParts { backend: string; rel: string }

export function splitBackendsPath(path: string): BackendsPathParts | null {
  const parts = String(path || '').split('/').filter(Boolean)
  if (parts[0] === 'workspace' && parts.length >= 2) return { backend: `workspace:${parts[1]}`, rel: parts.slice(2).join('/') }
  if (parts[0] === 'device') return parts.length >= 3 ? { backend: parts[2], rel: parts.slice(3).join('/') } : null
  return parts.length >= 2 ? { backend: parts[1], rel: parts.slice(2).join('/') } : null
}

/** Default directory-tree target mirroring a backends-tree folder 1:1 below the mount: /workspace/home/foo → dir:/foo. */
export function defaultMirrorTarget(backendsPath: string): string {
  const parts = splitBackendsPath(backendsPath)
  return `dir:/${parts?.rel || ''}`
}

/** Prefill for the rule builder's "file this folder into…" flow (context menu on a backends-tree node). */
export interface RulePrefill {
  /** Tree-qualified source prefix, e.g. `backends:/workspace/home/foo`. */
  path: string
  /** Link target, e.g. `dir:/foo`. */
  target: string
}

/** The shipped folder-skeleton sync hook (started/…backend-tree-sync.js), enabled copy first; null when the workspace has none. */
export function findBackendTreeSyncHook(files: HookFile[]): string | null {
  const candidates = files.filter((f) => f.path.startsWith('started/') && f.path.includes('backend-tree-sync'))
  return candidates.find((f) => isHookEnabled(f.path))?.path ?? candidates[0]?.path ?? null
}

export const RULES_PATH = 'rules.json'

export async function getRules(workspaceId: string): Promise<HookRule[]> {
  try {
    const content = await getHook(workspaceId, RULES_PATH)
    const parsed = JSON.parse(content || '{}')
    return Array.isArray(parsed.rules) ? parsed.rules : []
  } catch {
    return [] // missing or malformed file → start empty
  }
}

export async function saveRules(workspaceId: string, rules: HookRule[]): Promise<void> {
  const doc = { $schema: 'canvas.hook-rules/v1', rules }
  await saveHook(workspaceId, RULES_PATH, JSON.stringify(doc, null, 2) + '\n')
}

// ── Pending actions (approval queue) ────────────────────────────────────────
// Automation held for review: GET /hooks/pending lists proposals, POST
// /hooks/pending/decisions approves (optionally amended) or declines in bulk.

export type PendingActionStatus = 'pending' | 'approved' | 'declined' | 'failed' | 'expired'

export interface PendingActionResult {
  action: string
  status: 'ok' | 'error' | 'skipped'
  error?: string
}

export interface PendingAction {
  actionId: string
  ts: string
  status: PendingActionStatus
  handlerType: 'rule' | 'hook'
  handler: string
  event: string | null
  envelope: { event: string | null; payload: Record<string, unknown> }
  provenance: { origin: string; causedBy: string | null; depth: number }
  title: string
  summary: string | null
  actions: HookRuleAction[]
  /** JSON paths (rooted at the record, e.g. 'actions.0.paths') the reviewer may amend. */
  editable: string[]
  expiresAt?: string
  decidedAt?: string | null
  decidedBy?: string | null
  amended?: boolean
  result?: PendingActionResult[] | null
}

export interface PendingDecisionOutcome {
  actionId: string
  status: string
  error?: string
  result?: PendingActionResult[] | null
}

export async function listPendingActions(
  workspaceId: string,
  opts: { status?: PendingActionStatus; handler?: string; limit?: number } = {},
): Promise<PendingAction[]> {
  const params = new URLSearchParams()
  if (opts.status) params.set('status', opts.status)
  if (opts.handler) params.set('handler', opts.handler)
  if (opts.limit) params.set('limit', String(opts.limit))
  const query = params.toString()
  const res = await api.get<PendingAction[]>(`${hooksBase(workspaceId)}/pending${query ? `?${query}` : ''}`)
  return res || []
}

export async function getPendingAction(workspaceId: string, actionId: string): Promise<PendingAction> {
  const res = await api.get<PendingAction>(`${hooksBase(workspaceId)}/pending/${actionId}`)
  return res
}

export async function decidePendingActions(
  workspaceId: string,
  decisions: {
    approve?: Array<string | { actionId: string; amend?: Record<string, unknown> }>
    decline?: string[]
  },
): Promise<{ decided: number; failed: number; results: PendingDecisionOutcome[] }> {
  const res = await api.post<{ decided: number; failed: number; results: PendingDecisionOutcome[] }>(
    `${hooksBase(workspaceId)}/pending/decisions`, decisions,
  )
  return res
}

// ── Run log + explain (GET /hooks/runs, POST /hooks/explain) ────────────────

export interface HookRunActionResult {
  action: string
  status: 'ok' | 'error' | 'skipped'
  error?: string
}

export interface HookRun {
  runId: string
  ts: string
  trigger: 'event' | 'backfill' | 'replay' | 'manual' | 'approval'
  event: string
  eventId: string | null
  origin: string
  depth: number
  batch: boolean
  handlerType: 'hook' | 'rule' | 'dispatch'
  handler: string
  docIds: number[]
  durationMs: number
  status: 'ok' | 'error' | 'skipped'
  error?: string
  skipReason?: string
  actions?: HookRunActionResult[]
  outputTail?: string
}

export async function listRuns(
  workspaceId: string,
  opts: { limit?: number; handler?: string; event?: string; failed?: boolean } = {},
): Promise<HookRun[]> {
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.handler) params.set('handler', opts.handler)
  if (opts.event) params.set('event', opts.event)
  if (opts.failed) params.set('failed', 'true')
  const query = params.toString()
  const res = await api.get<HookRun[]>(`${hooksBase(workspaceId)}/runs${query ? `?${query}` : ''}`)
  return res || []
}

export interface ExplainCheck {
  key: string
  expected: unknown
  matched: boolean
  unknown?: boolean
}

export interface ExplainResult {
  documentId: number
  event: string
  schema: string
  paths: string[]
  rules: Array<{ id: string; description?: string; cascade: boolean; matched: boolean; enabled: boolean; checks: ExplainCheck[] }>
  hooks: Array<{ path: string; note: string }>
}

export async function explainDocument(
  workspaceId: string,
  body: { documentId: number; event?: string; paths?: string[] },
): Promise<ExplainResult> {
  const res = await api.post<ExplainResult>(`${hooksBase(workspaceId)}/explain`, body)
  return res
}

// ── Backfill + replay + manual run ───────────────────────────────────────────

// Backfill batch size: how many existing documents one backfill/run pass
// feeds to a rule or hook. The server default (100) keeps an accidental click
// cheap; the hooks panel exposes the knob for deliberate bulk runs, persisted
// per browser. Hard server ceiling: BACKFILL_MAX_LIMIT.
export const DEFAULT_BACKFILL_LIMIT = 100
export const BACKFILL_MAX_LIMIT = 10000
const BACKFILL_LIMIT_KEY = 'canvas.hooks.backfillLimit'

export function clampBackfillLimit(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BACKFILL_LIMIT
  return Math.min(n, BACKFILL_MAX_LIMIT)
}

export function getBackfillLimit(): number {
  try {
    const raw = localStorage.getItem(BACKFILL_LIMIT_KEY)
    return raw ? clampBackfillLimit(raw) : DEFAULT_BACKFILL_LIMIT
  } catch {
    return DEFAULT_BACKFILL_LIMIT
  }
}

export function setBackfillLimit(value: number): number {
  const next = clampBackfillLimit(value)
  try { localStorage.setItem(BACKFILL_LIMIT_KEY, String(next)) } catch { /* private mode */ }
  return next
}

// Event a hook file is bound to by its location: `{event}.js` or `{event}/x.js`.
export function hookEventOf(path: string): string | null {
  if (path.includes('/')) {
    const dir = path.split('/')[0]
    return dir === 'lib' || dir === 'rules' ? null : dir
  }
  if (path.endsWith('.js')) return path.replace(/\.js$/, '').replace(/^(?:example-|disabled-|_)/, '')
  return null
}

export interface BackfillResult {
  target: { ruleId?: string; hookFile?: string }
  event: string
  dryRun: boolean
  processed: number
  matched: number
  failed: number
  results: Array<{ docId: number; schema: string; matched?: boolean | null; status?: string; checks?: ExplainCheck[] }>
}

export async function backfillHook(
  workspaceId: string,
  body: { ruleId?: string; hookFile?: string; event?: string; schema?: string; limit?: number; dryRun?: boolean },
): Promise<BackfillResult> {
  const res = await api.post<BackfillResult>(`${hooksBase(workspaceId)}/backfill`, body)
  return res
}

export interface HookRunResult {
  target: { hookFile: string }
  event: string
  status: 'ok' | 'error' | 'skipped' | 'held'
  error?: string
  durationMs?: number
  runId?: string
}

// Run one JS hook by hand with a synthesized, document-less envelope
// ({ workspaceId, manual: true, origin: 'manual' }). For structural hooks
// (folder sync, housekeeping); document-shaped hooks go through backfillHook.
export async function runHook(
  workspaceId: string,
  body: { hookFile: string; event?: string; payload?: Record<string, unknown> },
): Promise<HookRunResult> {
  const res = await api.post<HookRunResult>(`${hooksBase(workspaceId)}/run`, body)
  return res
}

export async function replayRun(workspaceId: string, runId: string): Promise<{ status: string }> {
  const res = await api.post<{ status: string }>(`${hooksBase(workspaceId)}/runs/${runId}/replay`, {})
  return res
}

// ── Create-hook wizard backend (GET /hooks/meta + POST /hooks/generate) ─────

export interface HookEventMeta {
  name: string
  document: boolean
  description: string
  payload: string
}

export interface HookActionMeta {
  id: string
  label: string
  description: string
}

export interface HookContextApiEntry {
  name: string
  signature: string
  description: string
}

export interface HooksMeta {
  events: HookEventMeta[]
  actions: HookActionMeta[]
  classifier: { predicates: string[]; fields: string[] }
  contextApi: HookContextApiEntry[]
  /** Schemas actually present in this workspace (live document counts). */
  schemas?: Array<{ id: string; name: string; count: number }>
}

export async function getHooksMeta(workspaceId: string): Promise<HooksMeta> {
  const res = await api.get<HooksMeta>(`${hooksBase(workspaceId)}/meta`)
  return res
}

// Generates an editable, disabled-by-default skeleton on the server and
// returns its path; the caller opens it in the editor.
export async function generateHook(
  workspaceId: string,
  spec: { event: string; name: string; actions: string[] },
): Promise<{ path: string; content: string }> {
  const res = await api.post<{ path: string; content: string }>(
    `${hooksBase(workspaceId)}/generate`, spec,
  )
  return res
}

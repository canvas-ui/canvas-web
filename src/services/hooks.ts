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
  const res = await api.get<{ payload: HookFile[] }>(hooksBase(workspaceId))
  return res.payload || []
}

export async function getHook(workspaceId: string, path: string): Promise<string> {
  const res = await api.get<{ payload: { path: string; content: string } }>(`${hooksBase(workspaceId)}/${path}`)
  return res.payload?.content ?? ''
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
  when: { event: string; [key: string]: unknown }
  then: HookRuleAction[]
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
  const res = await api.get<{ payload: PendingAction[] }>(`${hooksBase(workspaceId)}/pending${query ? `?${query}` : ''}`)
  return res.payload || []
}

export async function getPendingAction(workspaceId: string, actionId: string): Promise<PendingAction> {
  const res = await api.get<{ payload: PendingAction }>(`${hooksBase(workspaceId)}/pending/${actionId}`)
  return res.payload
}

export async function decidePendingActions(
  workspaceId: string,
  decisions: {
    approve?: Array<string | { actionId: string; amend?: Record<string, unknown> }>
    decline?: string[]
  },
): Promise<{ decided: number; failed: number; results: PendingDecisionOutcome[] }> {
  const res = await api.post<{ payload: { decided: number; failed: number; results: PendingDecisionOutcome[] } }>(
    `${hooksBase(workspaceId)}/pending/decisions`, decisions,
  )
  return res.payload
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
  trigger: 'event' | 'backfill' | 'replay'
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
  const res = await api.get<{ payload: HookRun[] }>(`${hooksBase(workspaceId)}/runs${query ? `?${query}` : ''}`)
  return res.payload || []
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
  const res = await api.post<{ payload: ExplainResult }>(`${hooksBase(workspaceId)}/explain`, body)
  return res.payload
}

// ── Backfill + replay ────────────────────────────────────────────────────────

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
  const res = await api.post<{ payload: BackfillResult }>(`${hooksBase(workspaceId)}/backfill`, body)
  return res.payload
}

export async function replayRun(workspaceId: string, runId: string): Promise<{ status: string }> {
  const res = await api.post<{ payload: { status: string } }>(`${hooksBase(workspaceId)}/runs/${runId}/replay`, {})
  return res.payload
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
}

export async function getHooksMeta(workspaceId: string): Promise<HooksMeta> {
  const res = await api.get<{ payload: HooksMeta }>(`${hooksBase(workspaceId)}/meta`)
  return res.payload
}

// Generates an editable, disabled-by-default skeleton on the server and
// returns its path; the caller opens it in the editor.
export async function generateHook(
  workspaceId: string,
  spec: { event: string; name: string; actions: string[] },
): Promise<{ path: string; content: string }> {
  const res = await api.post<{ payload: { path: string; content: string } }>(
    `${hooksBase(workspaceId)}/generate`, spec,
  )
  return res.payload
}

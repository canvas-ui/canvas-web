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

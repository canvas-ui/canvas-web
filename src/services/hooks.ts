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

// A leading underscore on the filename marks a hook as disabled; the engine
// skips `_*.js`. Toggling enable/disable is just a rename.
export function isHookEnabled(path: string): boolean {
  return !(path.split('/').pop() || path).startsWith('_')
}

export function toggledHookPath(path: string): string {
  const slash = path.lastIndexOf('/')
  const dir = slash === -1 ? '' : path.slice(0, slash + 1)
  const base = slash === -1 ? path : path.slice(slash + 1)
  return dir + (base.startsWith('_') ? base.slice(1) : `_${base}`)
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
// group under `event`; `lib/*.js` groups under `lib`.
export function groupHooksByEvent(files: HookFile[]): Record<string, HookFile[]> {
  const groups: Record<string, HookFile[]> = {}
  for (const file of files) {
    const group = file.path.includes('/') ? file.path.split('/')[0] : file.path.replace(/\.js$/, '')
    ;(groups[group] ||= []).push(file)
  }
  return groups
}

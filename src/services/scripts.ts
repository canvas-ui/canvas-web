import { api } from '@/lib/api'
import type { HookFile } from '@/services/hooks'

// Workspace scripts (git/scripts) — the shell helpers hooks spawn. Same
// file-management contract as hooks, one level flatter.

function scriptsBase(workspaceId: string) {
  return `/workspaces/${workspaceId}/scripts`
}

export async function listScripts(workspaceId: string): Promise<HookFile[]> {
  const res = await api.get<{ payload: HookFile[] }>(scriptsBase(workspaceId))
  return res.payload || []
}

export async function getScript(workspaceId: string, path: string): Promise<string> {
  const res = await api.get<{ payload: { path: string; content: string } }>(`${scriptsBase(workspaceId)}/${path}`)
  return res.payload?.content ?? ''
}

export async function saveScript(workspaceId: string, path: string, content: string): Promise<void> {
  await api.put(`${scriptsBase(workspaceId)}/${path}`, { content })
}

export async function deleteScript(workspaceId: string, path: string): Promise<void> {
  await api.delete(`${scriptsBase(workspaceId)}/${path}`)
}

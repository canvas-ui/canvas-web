import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'
import type { BackendTrashItem } from '@/lib/backend-trash'
import { backendTrashLocation } from '@/lib/backend-trash'
import { invalidateWorkspaceTreeCache } from '@/services/workspace'

const route = (workspace: string, backend: string) => `${API_ROUTES.workspaces}/${encodeURIComponent(workspace)}/backends/file/${encodeURIComponent(backend)}/trash`

export async function listBackendTrash(workspace: string, backend: string) {
  const items: BackendTrashItem[] = []
  const cursors = new Set<string>()
  let cursor: string | null = null
  let days: number | null = null
  do {
    const query = new URLSearchParams({ limit: '1000', ...(cursor ? { cursor } : {}) })
    const page: { items: BackendTrashItem[]; cursor: string | null; retention: { days: number } | null } = await api.get(`${route(workspace, backend)}?${query}`)
    items.push(...page.items)
    days = page.retention?.days ?? null
    cursor = page.cursor
    if (cursor && cursors.has(cursor)) throw new Error('Trash listing returned a repeated cursor')
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return { items, days }
}

export interface TrashRestoreResult { id: string; key?: string; ok: boolean; reason?: string; message?: string }

export async function restoreBackendTrash(workspace: string, backend: string, ids: string[]) {
  const unique = [...new Set(ids)]
  const results: TrashRestoreResult[] = []
  try {
    for (let offset = 0; offset < unique.length; offset += 100) {
      const page = await api.post<{ results: TrashRestoreResult[] }>(`${route(workspace, backend)}/restore`, { ids: unique.slice(offset, offset + 100) })
      results.push(...page.results)
    }
    return results
  } finally {
    invalidateWorkspaceTreeCache(workspace, 'backends')
    window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName: workspace, treeName: 'backends' } }))
    window.dispatchEvent(new CustomEvent('workspace:documents:refresh', { detail: { workspaceName: workspace } }))
    window.dispatchEvent(new CustomEvent('workspace:trash:refresh', { detail: { workspaceName: workspace, backend } }))
  }
}

export async function restoreBackendTrashPath(workspace: string, path: string) {
  const target = backendTrashLocation('backends', path)
  if (!target?.backend) return
  const { items } = await listBackendTrash(workspace, target.backend)
  const selected = items.filter(item => !target.prefix || item.key === target.prefix || item.key.startsWith(`${target.prefix}/`))
    .sort((a, b) => b.deletedAt - a.deletedAt)
  const results = await restoreBackendTrash(workspace, target.backend, selected.map(item => item.id))
  const failed = results.filter(result => !result.ok)
  if (failed.length) throw new Error(`${results.length - failed.length} restored; ${failed.length} remain in Trash. Existing paths were kept.`)
}

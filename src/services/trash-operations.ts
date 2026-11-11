import { api } from '@/lib/api'

export interface RemovalPolicy {
  membership: 'keep' | 'review' | 'trash'
  propagation: 'never' | 'review' | 'automatic'
  targets: string[] | 'all'
  acceptPropagatedDeletions: boolean
}
export const defaultRemovalPolicy: RemovalPolicy = { membership: 'keep', propagation: 'never', targets: [], acceptPropagatedDeletions: false }
export interface RemovalOperation {
  id: string
  documentId: number
  title: string
  source: { backend: string; driver: string; folder?: string; account?: string }
  state: string
  createdAt: string
  membership: RemovalPolicy['membership']
  membershipApplied?: boolean
  orphan: boolean
  error?: string | null
  placements: { tree: string; paths: string[] }[]
  remainingLocations: { url: string }[]
  targets: { backend: string; key: string; state: string; trashId?: string; error?: string | null }[]
}
const base = (workspace: string) => `/workspaces/${encodeURIComponent(workspace)}/trash/operations`
export const listRemovalOperations = (workspace: string, options: { view: string; backend?: string; search?: string; offset?: number }) =>
  api.get<{ operations: RemovalOperation[]; total: number }>(`${base(workspace)}?${new URLSearchParams(Object.entries(options).map(([k, v]) => [k, String(v)]))}`)
export const actOnRemovals = (workspace: string, ids: string[], action: 'approve' | 'keep' | 'retry' | 'restore' | 'purge', options: { targets?: string[]; membership?: boolean } = {}) =>
  api.post<{ results: { id: string; ok: boolean; error?: string; operation?: RemovalOperation }[] }>(`${base(workspace)}/${action}`, { ids, ...options })
export const saveMailboxRemovalPolicy = (workspace: string, account: string, folder: string, removalPolicy: RemovalPolicy) =>
  api.patch(`/workspaces/${encodeURIComponent(workspace)}/backends/imap/${encodeURIComponent(account)}/containers/${encodeURIComponent(folder)}`, { removalPolicy })

/** One row of "Recently deleted": a document, a file or a folder that can still be brought back. */
export interface DeletedItem {
  id: string
  kind: 'document' | 'file' | 'folder'
  name: string
  schema?: string | null
  backend?: string
  from: string[]
  reason: 'removed' | 'source-missing'
  deletedAt: string | null
  expiresAt: string | null
  size: number | null
}
export interface DeletedItemResult { id: string; ok: boolean; message?: string }
const items = (workspace: string) => `/workspaces/${encodeURIComponent(workspace)}/trash/items`
export const listDeleted = (workspace: string, options: { search?: string; limit?: number; offset?: number } = {}) =>
  api.get<{ items: DeletedItem[]; total: number; retentionDays: number }>(`${items(workspace)}?${new URLSearchParams(Object.entries(options).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`)
async function settleDeleted(workspace: string, action: 'restore' | 'discard', ids: string[]) {
  const results: DeletedItemResult[] = []
  for (let at = 0; at < ids.length; at += 200) {
    results.push(...(await api.post<{ results: DeletedItemResult[] }>(`${items(workspace)}/${action}`, { ids: ids.slice(at, at + 200) })).results)
  }
  return results
}
export const restoreDeleted = (workspace: string, ids: string[]) => settleDeleted(workspace, 'restore', ids)
export const discardDeleted = (workspace: string, ids: string[]) => settleDeleted(workspace, 'discard', ids)

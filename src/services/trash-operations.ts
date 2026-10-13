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

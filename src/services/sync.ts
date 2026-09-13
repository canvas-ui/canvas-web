import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'

// Device mirrors + the sync conflict inbox (canvas-server docs/sync-protocol.md).

export interface MirrorStatus {
  workspaceId: string
  workspaceName?: string
  backend: string
  client?: 'fuse' | 'daemon' | 'other'
  path?: string
  prefixes?: string[]
  cursor?: number
  pending?: number
  failed?: number
  conflicts?: number
  skipped?: number
  reverted?: number
  direction?: 'bi' | 'pull' | 'push'
  state?: string
  lastSync?: string
  lastError?: string | null
  version?: string
  firstSeen?: string
  lastSeen?: string
  reportedAt?: string
}

export interface WorkspaceMirror {
  deviceId: string
  name?: string
  platform?: string
  type?: string
  lastSeen?: string
  mirror: MirrorStatus
  head: number | null
  lag: number | null
  /** Replica policy (workspace.json `replicas`): whether this device counts toward "protected". */
  replica?: { role: 'full' | 'cache'; required: boolean }
  /** Documents whose current version this device does not hold yet (null = not computed). */
  behind?: number | null
  held?: number | null
}

export interface ProtectionSummary {
  backend: string
  required: string[]
  total: number
  unversioned: number
  protected: number | null
  unprotected: number | null
  partial: boolean
  replicas: Record<string, { behind: number; held: number; required: boolean; reportedAt?: number | null }>
  oldestUnprotected: Array<{ key: string; docId: number; version: number; mtime?: number | null; size?: number | null }>
  policy: Array<{ device: string; role: 'full' | 'cache'; required: boolean }>
}

export interface SyncConflict {
  docId: number
  key: string
  backend: string
  mode: 'inbox' | 'rename'
  conflictKey: string | null
  device: string | null
  deviceName: string | null
  ts: string | null
  incoming: { sha256: string | null; size: number | null; mtime: number | null }
  base: { sha256: string | null }
  hub: { sha256: string | null; size: number | null; mtime: number | null; docId: number | null } | null
  hubAtCreation: { sha256: string | null }
  resolvable: boolean
}

export type ConflictResolution = 'hub' | 'incoming' | 'both'

export interface ConflictResolutionResult {
  docId: number
  key: string
  keep: ConflictResolution
  survivorDocId: number | null
  resultKey?: string
  resolvedAt: string
}

const ws = (workspaceId: string) => `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}`

export async function listMirrors(workspaceId: string): Promise<WorkspaceMirror[]> {
  const res = await api.get<WorkspaceMirror[]>(`${ws(workspaceId)}/mirrors`)
  return res || []
}

export async function forgetMirror(workspaceId: string, deviceId: string): Promise<void> {
  await api.delete<unknown>(`${ws(workspaceId)}/mirrors/${encodeURIComponent(deviceId)}`)
}

export async function getProtection(workspaceId: string, sample = 10): Promise<ProtectionSummary> {
  return api.get<ProtectionSummary>(`${ws(workspaceId)}/mirrors/protection?sample=${sample}`)
}

export async function setReplicaPolicy(workspaceId: string, deviceId: string, patch: { required?: boolean; role?: 'full' | 'cache' }): Promise<{ device: string; role: 'full' | 'cache'; required: boolean }> {
  const res = await api.patch<{ replica: { device: string; role: 'full' | 'cache'; required: boolean } }>(`${ws(workspaceId)}/mirrors/${encodeURIComponent(deviceId)}`, patch)
  return res.replica
}

export async function listSyncConflicts(workspaceId: string): Promise<SyncConflict[]> {
  const res = await api.get<SyncConflict[]>(`${ws(workspaceId)}/sync/conflicts`)
  return res || []
}

export async function resolveSyncConflict(workspaceId: string, docId: number, keep: ConflictResolution): Promise<ConflictResolutionResult> {
  return api.post<ConflictResolutionResult>(`${ws(workspaceId)}/sync/conflicts/${docId}/resolve`, { keep })
}

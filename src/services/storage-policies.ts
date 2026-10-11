import { api } from '@/lib/api'
import type { Backend } from '@/services/workspace'

// Per-workspace storage policies: a virtual tree path (ctx:/… or dir:/…) is
// bound to one or more physical backends. Every supported document filed under
// the path is copied to each target (keeping the relative sub-path) and removed
// again when it is unlinked. Uploads land in the local blob store first; the
// blob copy is released once every target holds the bytes.

export interface StoragePolicyTarget {
  // Data backend name exactly as Backend.address reports it, e.g. "workspace:home" or "gdrive".
  backend: string
  // Backend-relative folder, "" = backend root. {{YYYY}}/{{MM}} tokens make it a filing target.
  folder: string
  // Append the document's sub-path below the policy path.
  recursive: boolean
  // Mirror empty virtual folders on backends with recoverable directory support.
  recreateDirectories: boolean
  // Optional file-name template, e.g. "{{YYYY}}{{MM}}{{DD}}_{{basename}}{{ext}}".
  key?: string
  onConflict?: 'error' | 'rename' | 'overwrite'
}

export interface StoragePolicyFilter {
  schema?: string
  mime?: string
  filename?: string
}

export interface StoragePolicy {
  kind?: 'mirror' | 'filing'
  id: string
  enabled: boolean
  description?: string
  // Qualified virtual path: "ctx:/Accounting" or "dir:/Accounting".
  path: string
  recursive: boolean
  filter?: StoragePolicyFilter
  targets: StoragePolicyTarget[]
}

export interface StoragePoliciesResponse {
  policies: StoragePolicy[]
  revision: string
  status?: { state: string; error?: { message: string } | null; operations?: { operations: StorageOperation[] } }
  blobBackend: string | null
}

export interface StorageOperation { id: string; owner: string; state: string; phase: string; error?: { message: string }; outcomes: { backend: string; key: string; state: string }[] }

export interface StoragePolicyApplyResult {
  folders: number
  processed: number
  matched: number
  failed: number
  nextOffset: number | null
}

export type StoragePolicyTree = 'context' | 'directory'

const base = (workspaceId: string) => `/workspaces/${workspaceId}/storage-policies`

export function newStoragePolicyId(): string {
  return `policy-${crypto.randomUUID().slice(0, 8)}`
}

// Backends a policy may target: enabled, uploadable, writable, not the
// hash-keyed blob store (workspace:data, cacache) where uploads land anyway.
export function policyTargetBackends(backends: Backend[]): Backend[] {
  return backends.filter(b => b.enabled && b.capabilities?.upload && !b.config?.readOnly && b.driver !== 'cacache')
}

// Drivers that can mirror empty virtual folders as real directories.
export const DIRECTORY_CAPABLE_DRIVERS = new Set(['file'])

export function qualifyPolicyPath(tree: StoragePolicyTree, path: string): string {
  return `${tree === 'directory' ? 'dir' : 'ctx'}:${path.startsWith('/') ? path : `/${path}`}`
}

export function splitPolicyPath(qualified: string): { tree: StoragePolicyTree; path: string } | null {
  const match = /^(ctx|dir):(\/.*)$/.exec(qualified)
  if (!match) return null
  return { tree: match[1] === 'dir' ? 'directory' : 'context', path: match[2] }
}

// Default backend folder for a virtual path: the path without qualifier and
// leading slash, e.g. "ctx:/Architektúra" → "Architektúra".
export function defaultPolicyFolder(qualifiedPath: string): string {
  const parts = splitPolicyPath(qualifiedPath)
  return (parts?.path ?? qualifiedPath).replace(/^\/+/, '')
}

export function describePolicyTarget(target: StoragePolicyTarget): string {
  return `${target.backend}:${target.folder || '/'}`
}

export async function listStoragePolicies(workspaceId: string): Promise<StoragePoliciesResponse> {
  const res = await api.get<StoragePoliciesResponse>(base(workspaceId))
  return { ...res, policies: res?.policies ?? [], revision: res.revision, blobBackend: res?.blobBackend ?? null }
}

export async function saveStoragePolicies(workspaceId: string, policies: StoragePolicy[], revision: string): Promise<StoragePoliciesResponse> {
  return api.put<StoragePoliciesResponse>(base(workspaceId), { policies, revision })
}

export async function applyStoragePolicy(
  workspaceId: string,
  policyId: string,
  opts: { limit?: number; offset?: number; dryRun?: boolean } = {},
): Promise<StoragePolicyApplyResult> {
  const res = await api.post<StoragePolicyApplyResult>(`${base(workspaceId)}/${encodeURIComponent(policyId)}/apply`, opts)
  return res
}

// Read-modify-write helpers over PUT (the server replaces the whole list).
export async function upsertStoragePolicy(workspaceId: string, policy: StoragePolicy, snapshot?: StoragePoliciesResponse): Promise<StoragePoliciesResponse> {
  const { policies, revision } = snapshot ?? await listStoragePolicies(workspaceId)
  const index = policies.findIndex(p => p.id === policy.id)
  const next = index === -1 ? [...policies, policy] : policies.map((p, i) => (i === index ? policy : p))
  return saveStoragePolicies(workspaceId, next, revision)
}

export async function removeStoragePolicy(workspaceId: string, policyId: string): Promise<StoragePoliciesResponse> {
  const { policies, revision } = await listStoragePolicies(workspaceId)
  return saveStoragePolicies(workspaceId, policies.filter(p => p.id !== policyId), revision)
}

// Run `apply` to completion, paging on nextOffset. `onPage` fires after every
// batch so callers can show progress. Returns the summed counters.
export async function applyStoragePolicyAll(
  workspaceId: string,
  policyId: string,
  onPage?: (page: StoragePolicyApplyResult, totals: { folders: number; processed: number; matched: number; failed: number }) => void,
  opts: { limit?: number; dryRun?: boolean } = {},
): Promise<{ folders: number; processed: number; matched: number; failed: number }> {
  const totals = { folders: 0, processed: 0, matched: 0, failed: 0 }
  let next: number | null = 0
  while (next !== null) {
    const page: StoragePolicyApplyResult = await applyStoragePolicy(workspaceId, policyId, { limit: opts.limit ?? 100, offset: next, dryRun: opts.dryRun })
    totals.folders += page.folders ?? 0
    totals.processed += page.processed ?? 0
    totals.matched += page.matched ?? 0
    totals.failed += page.failed ?? 0
    onPage?.(page, totals)
    // Older servers do not expose continuation; never silently claim the
    // whole subtree was processed when only its first batch ran.
    if (page.nextOffset === undefined) throw new Error('The policy is saved, but applying it to existing documents needs an updated server.')
    next = page.nextOffset
  }
  return totals
}

// Policies that cover a virtual path: equal path always; descendants only when
// the policy is recursive. Disabled policies never match.
export function policiesForPath(policies: StoragePolicy[], tree: StoragePolicyTree, path: string): StoragePolicy[] {
  const qualified = qualifyPolicyPath(tree, path)
  const prefix = qualified.endsWith('/') ? qualified : `${qualified}/`
  return policies.filter(policy => {
    if (!policy.enabled) return false
    if (policy.path === qualified) return true
    if (!policy.recursive) return false
    const policyPrefix = policy.path.endsWith('/') ? policy.path : `${policy.path}/`
    return prefix.startsWith(policyPrefix)
  })
}

export function describePolicyTargets(policies: StoragePolicy[]): string {
  const seen = new Set<string>()
  for (const policy of policies) for (const target of policy.targets) seen.add(describePolicyTarget(target))
  return [...seen].join(', ')
}

export async function retryStorageOperation(workspaceId: string, id: string): Promise<void> { await api.post(`${base(workspaceId)}/operations/${encodeURIComponent(id)}/retry`, {}) }

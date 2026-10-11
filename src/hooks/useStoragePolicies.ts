import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { listStoragePolicies, type StoragePolicy, type StoragePoliciesResponse } from '@/services/storage-policies'

// Per-workspace storage-policy list behind a module-level store, so the tree
// badge does not refetch on every M2 mount and every consumer of the same
// workspace sees a save at once (`invalidateStoragePolicies` after writes).
interface Entry { policies: StoragePolicy[]; revision: string; status?: StoragePoliciesResponse['status']; loading: boolean; error: string }

const EMPTY: Entry = { policies: [], revision: '', loading: false, error: '' }
const store = new Map<string, Entry>()
const listeners = new Set<() => void>()

function emit() { for (const listener of listeners) listener() }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
function set(workspaceId: string, entry: Entry) { store.set(workspaceId, entry); emit() }

async function fetchPolicies(workspaceId: string): Promise<void> {
  set(workspaceId, { ...(store.get(workspaceId) ?? EMPTY), loading: true, error: '' })
  try {
    const { policies, revision, status } = await listStoragePolicies(workspaceId)
    set(workspaceId, { policies, revision, status, loading: false, error: '' })
  } catch (err) {
    // Older servers have no policies endpoint: an empty list, no badge.
    set(workspaceId, { policies: [], revision: '', loading: false, error: err instanceof Error ? err.message : 'Could not load storage policies' })
  }
}

export function invalidateStoragePolicies(workspaceId: string): void {
  store.delete(workspaceId)
  emit()
}

export function useStoragePolicies(workspaceId: string | null | undefined): {
  policies: StoragePolicy[]
  revision: string
  status?: StoragePoliciesResponse['status']
  loading: boolean
  error: string
  refresh: () => Promise<void>
} {
  const entry = useSyncExternalStore(subscribe, () => (workspaceId && store.get(workspaceId)) || EMPTY)

  // Fetch on first use and after an invalidate (the store entry is gone).
  const missing = !!workspaceId && !store.has(workspaceId)
  useEffect(() => {
    if (workspaceId && missing) void fetchPolicies(workspaceId)
  }, [workspaceId, missing])

  const refresh = useCallback(async () => {
    if (workspaceId) await fetchPolicies(workspaceId)
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId || !entry.policies.length) return
    const timer = window.setInterval(() => { if (!document.hidden && !store.get(workspaceId)?.loading) void fetchPolicies(workspaceId) }, 5000)
    return () => window.clearInterval(timer)
  }, [workspaceId, entry.policies.length])

  return { policies: entry.policies, revision: entry.revision, status: entry.status, loading: entry.loading, error: entry.error, refresh }
}

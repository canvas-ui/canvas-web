import { useEffect, useState } from 'react'
import { getRelationPredicates } from '@/services/workspace'

export function useRelationPredicates(workspaceId?: string | null) {
  const [result, setResult] = useState<{ workspaceId: string; predicates: string[]; error: boolean } | null>(null)
  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    getRelationPredicates(workspaceId).then(
      predicates => { if (!cancelled) setResult({ workspaceId, predicates, error: false }) },
      () => { if (!cancelled) setResult({ workspaceId, predicates: [], error: true }) },
    )
    return () => { cancelled = true }
  }, [workspaceId])
  const current = result?.workspaceId === workspaceId ? result : null
  return { predicates: current?.predicates ?? [], error: current?.error ?? false, loading: !!workspaceId && !current }
}

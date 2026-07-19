import { useEffect, useState } from 'react'
import { listWorkspaceTagSuggestions } from '@/services/workspace'

/**
 * Existing `tag/*` values in a workspace, offered to TagInput as autocomplete.
 *
 * Best-effort: a load failure or an unknown workspace (the home quick-add cards
 * only learn their target at Save time) just degrades to freeform — tags are
 * arbitrary strings server-side either way.
 *
 * Kept keyed by workspace so the returned list is DERIVED: switching target
 * shows the new workspace's tags (or nothing) rather than the previous one's,
 * with no synchronous reset inside the effect.
 */
export function useTagSuggestions(workspaceName?: string | null): string[] {
  const [loaded, setLoaded] = useState<{ workspace: string; tags: string[] } | null>(null)

  useEffect(() => {
    if (!workspaceName) return
    let cancelled = false
    listWorkspaceTagSuggestions(workspaceName)
      .then((s) => { if (!cancelled) setLoaded({ workspace: workspaceName, tags: s }) })
      .catch(() => { /* freeform */ })
    return () => { cancelled = true }
  }, [workspaceName])

  return loaded && loaded.workspace === workspaceName ? loaded.tags : []
}

import { useEffect, useState } from 'react'
import { getWorkspace } from '@/services/workspace'

/** Workspace identity for hosts (contexts/documents) that don't load it themselves. */
export function useWorkspaceIdentity(workspaceRef?: string) {
  const [result, setResult] = useState<{ ref: string; workspace: Workspace } | null>(null)
  useEffect(() => {
    if (!workspaceRef) return
    let cancelled = false
    const refresh = () => {
      void getWorkspace(workspaceRef).then(workspace => {
        if (!cancelled) setResult({ ref: workspaceRef, workspace })
      }).catch(() => {})
    }
    refresh()
    window.addEventListener('workspaces:refresh', refresh)
    return () => { cancelled = true; window.removeEventListener('workspaces:refresh', refresh) }
  }, [workspaceRef])
  return result?.ref === workspaceRef ? result?.workspace : undefined
}

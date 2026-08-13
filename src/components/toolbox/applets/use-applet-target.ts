import { createContext, useContext, useMemo } from 'react'
import { useToolboxOptional } from '../use-toolbox'
import { DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import type { AddTarget } from '../add/useAddTarget'

// Where an applet reads from and writes to. Same discriminated union as the
// add-panel target, because an applet's data scope and its insert destination
// are the same thing by design.
export type AppletTarget = AddTarget

export const AppletTargetCtx = createContext<AppletTarget | undefined>(undefined)

export function useAppletTarget(): AppletTarget {
  const provided = useContext(AppletTargetCtx)
  const toolbox = useToolboxOptional()
  const s = toolbox?.state
  // Destructured up front so the memo depends on the individual fields, not
  // the whole toolbox state object (which changes on every dispatch).
  const hasToolboxState = !!s
  const activeContextType = s?.activeContextType
  const activeContextId = s?.activeContextId
  const activeWorkspaceName = s?.activeWorkspaceName
  const activeContextPath = s?.activeContextPath
  const activeTreeName = s?.activeTreeName
  return useMemo<AppletTarget>(() => {
    if (provided !== undefined) return provided
    if (!hasToolboxState) return null
    if (activeContextType === 'context' && activeContextId) {
      return { mode: 'context', contextId: activeContextId }
    }
    if (activeWorkspaceName && activeContextPath) {
      return {
        mode: 'workspace',
        workspaceName: activeWorkspaceName,
        path: activeContextPath,
        treeName: activeTreeName || DEFAULT_WORKSPACE_TREE_NAME,
        treeType: (activeTreeName === 'directory' || activeTreeName === 'backends' ? 'directory' : 'context'),
      }
    }
    return null
  }, [provided, hasToolboxState, activeContextType, activeContextId, activeWorkspaceName, activeContextPath, activeTreeName])
}

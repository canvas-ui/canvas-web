import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useToolboxOptional } from '../toolbox-context'
import { DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import type { AddTarget } from '../add/useAddTarget'

// Where an applet reads from and writes to. Same discriminated union as the
// add-panel target, because an applet's data scope and its insert destination
// are the same thing by design.
export type AppletTarget = AddTarget

const AppletTargetCtx = createContext<AppletTarget | undefined>(undefined)

// Standalone hosts (the /apps/<app> route) provide an explicit binding; inside
// the toolbox no provider is mounted and the target derives from the focused
// navigation, mirroring useAddTarget's rules.
export function AppletTargetProvider({ target, children }: { target: AppletTarget; children: ReactNode }) {
  return <AppletTargetCtx.Provider value={target}>{children}</AppletTargetCtx.Provider>
}

export function useAppletTarget(): AppletTarget {
  const provided = useContext(AppletTargetCtx)
  const toolbox = useToolboxOptional()
  const s = toolbox?.state
  return useMemo<AppletTarget>(() => {
    if (provided !== undefined) return provided
    if (!s) return null
    if (s.activeContextType === 'context' && s.activeContextId) {
      return { mode: 'context', contextId: s.activeContextId }
    }
    if (s.activeWorkspaceName && s.activeContextPath) {
      return {
        mode: 'workspace',
        workspaceName: s.activeWorkspaceName,
        path: s.activeContextPath,
        treeName: s.activeTreeName || DEFAULT_WORKSPACE_TREE_NAME,
        treeType: (s.activeTreeName === 'directory' || s.activeTreeName === 'backends' ? 'directory' : 'context'),
      }
    }
    return null
  }, [provided, s?.activeContextType, s?.activeContextId, s?.activeWorkspaceName, s?.activeContextPath, s?.activeTreeName])
}

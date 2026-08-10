import { useContext } from 'react'
import { DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import { useToolboxOptional } from '../toolbox-context'
import { AppletTargetCtx } from './applet-target-context'
import type { AppletTarget } from './applet-target'

export function useAppletTarget(): AppletTarget {
  const provided = useContext(AppletTargetCtx)
  const state = useToolboxOptional()?.state
  if (provided !== undefined) return provided
  if (!state) return null
  if (state.activeContextType === 'context' && state.activeContextId) {
    return { mode: 'context', contextId: state.activeContextId }
  }
  if (state.activeWorkspaceName && state.activeContextPath) {
    return {
      mode: 'workspace',
      workspaceName: state.activeWorkspaceName,
      path: state.activeContextPath,
      treeName: state.activeTreeName || DEFAULT_WORKSPACE_TREE_NAME,
      treeType: state.activeTreeName === 'directory' || state.activeTreeName === 'backends' ? 'directory' : 'context',
    }
  }
  return null
}

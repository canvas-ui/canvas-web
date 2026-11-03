import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useToolboxOptional } from '@/components/toolbox/use-toolbox'
import type { AgentViewContext } from '@/lib/agent-view-context'

/** Publish the content area's actual query, including saved and local refinements. */
export function usePublishAgentView(view: AgentViewContext | null) {
  const { pathname } = useLocation()
  const setAgentView = useToolboxOptional()?.setAgentView
  const snapshot = JSON.stringify(view)
  useEffect(() => {
    setAgentView?.({ pathname, view: JSON.parse(snapshot) })
    return () => setAgentView?.(null)
  }, [pathname, snapshot, setAgentView])
}

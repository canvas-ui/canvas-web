import { useEffect } from 'react'
import socketService from '@/lib/socket'
import { ToolboxProvider } from '../toolbox-context'
import { useToolboxOptional } from '../use-toolbox'
import { ToolsPanel } from '../panels/ToolsPanel'
import { useAppletTarget } from './use-applet-target'
import { LensFeedProvider } from '../lens-feed-context'

/** Same filter app in the drawer and /apps/filters; binding is host-owned. */
export function FiltersApplet() {
  const target = useAppletTarget()
  const toolbox = useToolboxOptional()
  const state = toolbox?.state
  const sharesBinding = !!state && (target?.mode === 'context'
    ? state.activeContextType === 'context' && state.activeContextId === target.contextId
    : target?.mode === 'workspace'
      ? state.activeContextType !== 'context' && state.activeWorkspaceName === target.workspaceName && state.activeTreeName === target.treeName && state.activeContextPath === target.path
      : !state.activeWorkspaceName && !state.activeContextId)
  const contextId = !sharesBinding && target?.mode === 'context' ? target.contextId : null
  useEffect(() => {
    if (!contextId) return
    const channel = `context:${contextId}`
    const subscribe = () => socketService.emit('subscribe', { channel })
    const offConnect = socketService.on('connect', subscribe)
    subscribe()
    return () => { offConnect(); socketService.emit('unsubscribe', { channel }) }
  }, [contextId])
  if (sharesBinding) return <ToolsPanel />
  return <ToolboxProvider target={target}><LensFeedProvider><ToolsPanel /></LensFeedProvider></ToolboxProvider>
}

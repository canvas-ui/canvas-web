import { createContext, useCallback, useContext, useMemo } from 'react'
import type { AgentSession, AgentSessionList, AgentSessionMutationResult } from '@/services/agent'

export type SessionMode = 'persistent' | 'experimental' | 'incognito'
export interface AgentSessionState { current: AgentSession | null; sessions: AgentSessionList | null; isLoading: boolean; error: string | null }
export interface AgentSessionContextValue {
  getState: (agentId: string) => AgentSessionState
  refresh: (agentId: string) => Promise<void>
  create: (agentId: string, data: { mode: SessionMode; name?: string }) => Promise<AgentSessionMutationResult>
  select: (agentId: string, data: { mode: SessionMode; sessionId?: string }) => Promise<AgentSessionMutationResult>
  rename: (agentId: string, sessionId: string, name: string) => Promise<AgentSessionMutationResult>
  remove: (agentId: string, sessionId: string) => Promise<AgentSessionMutationResult>
}
export const defaultAgentSessionState: AgentSessionState = { current: null, sessions: null, isLoading: false, error: null }
export const AgentSessionContext = createContext<AgentSessionContextValue | null>(null)
export function useAgentSessions(agentId: string) {
  const context = useContext(AgentSessionContext)
  if (!context) throw new Error('useAgentSessions must be used within an AgentSessionProvider')
  const state = context.getState(agentId)
  const refresh = useCallback(() => context.refresh(agentId), [context, agentId])
  const create = useCallback((data: { mode: SessionMode; name?: string }) => context.create(agentId, data), [context, agentId])
  const select = useCallback((data: { mode: SessionMode; sessionId?: string }) => context.select(agentId, data), [context, agentId])
  const rename = useCallback((sessionId: string, name: string) => context.rename(agentId, sessionId, name), [context, agentId])
  const remove = useCallback((sessionId: string) => context.remove(agentId, sessionId), [context, agentId])
  return useMemo(() => ({ ...state, refresh, create, select, rename, remove }), [state, refresh, create, select, rename, remove])
}

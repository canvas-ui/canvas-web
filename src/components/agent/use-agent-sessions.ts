import { createContext, useCallback, useContext, useMemo } from 'react'
import type {
  AgentSession,
  AgentSessionList,
  AgentSessionMutationResult,
} from '@/services/agent'

export type SessionMode = 'persistent' | 'experimental' | 'incognito'

export interface AgentSessionState {
  current: AgentSession | null
  sessions: AgentSessionList | null
  isLoading: boolean
  error: string | null
}

export interface AgentSessionContextValue {
  getState: (agentId: string) => AgentSessionState
  refresh: (agentId: string) => Promise<void>
  create: (agentId: string, data: { mode: SessionMode; name?: string }) => Promise<AgentSessionMutationResult>
  select: (agentId: string, data: { mode: SessionMode; sessionId?: string }) => Promise<AgentSessionMutationResult>
  rename: (agentId: string, sessionId: string, name: string) => Promise<AgentSessionMutationResult>
  remove: (agentId: string, sessionId: string) => Promise<AgentSessionMutationResult>
}

export const AgentSessionContext = createContext<AgentSessionContextValue | null>(null)

export function useAgentSessions(agentId: string) {
  const context = useContext(AgentSessionContext)
  if (!context) {
    throw new Error('useAgentSessions must be used within an AgentSessionProvider')
  }

  const {
    getState,
    refresh: refreshSession,
    create: createSession,
    select: selectSession,
    rename: renameSession,
    remove: removeSession,
  } = context

  const state = getState(agentId)

  const refresh = useCallback(() => refreshSession(agentId), [refreshSession, agentId])
  const create = useCallback(
    (data: { mode: SessionMode; name?: string }) => createSession(agentId, data),
    [createSession, agentId],
  )
  const select = useCallback(
    (data: { mode: SessionMode; sessionId?: string }) => selectSession(agentId, data),
    [selectSession, agentId],
  )
  const rename = useCallback(
    (sessionId: string, name: string) => renameSession(agentId, sessionId, name),
    [renameSession, agentId],
  )
  const remove = useCallback(
    (sessionId: string) => removeSession(agentId, sessionId),
    [removeSession, agentId],
  )

  return useMemo(() => ({
    ...state,
    refresh,
    create,
    select,
    rename,
    remove,
  }), [state, refresh, create, select, rename, remove])
}

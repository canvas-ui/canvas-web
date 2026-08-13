import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  type AgentSessionMutationResult,
  createAgentSession,
  deleteAgentSession,
  getAgentSession,
  listAgentSessions,
  renameAgentSession,
  selectAgentSession,
} from '@/services/agent'
import {
  AgentSessionContext,
  type AgentSessionContextValue,
  type AgentSessionState,
  type SessionMode,
} from './use-agent-sessions'

const defaultState: AgentSessionState = {
  current: null,
  sessions: null,
  isLoading: false,
  error: null,
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : 'Session request failed'
}

export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, AgentSessionState>>({})

  const setState = useCallback((agentId: string, next: Partial<AgentSessionState>) => {
    setStates((prev) => ({
      ...prev,
      [agentId]: {
        ...(prev[agentId] || defaultState),
        ...next,
      },
    }))
  }, [])

  const applyMutation = useCallback((agentId: string, result: AgentSessionMutationResult) => {
    setState(agentId, {
      current: result.current,
      sessions: result.sessions,
      isLoading: false,
      error: null,
    })
    return result
  }, [setState])

  const refresh = useCallback(async (agentId: string) => {
    if (!agentId) return
    setState(agentId, { isLoading: true, error: null })
    try {
      const [current, sessions] = await Promise.all([
        getAgentSession(agentId),
        listAgentSessions(agentId),
      ])
      setState(agentId, { current, sessions, isLoading: false, error: null })
    } catch (error) {
      setState(agentId, { isLoading: false, error: normalizeError(error) })
      throw error
    }
  }, [setState])

  const create = useCallback(async (agentId: string, data: { mode: SessionMode; name?: string }) => {
    setState(agentId, { isLoading: true, error: null })
    try {
      return applyMutation(agentId, await createAgentSession(agentId, data))
    } catch (error) {
      setState(agentId, { isLoading: false, error: normalizeError(error) })
      throw error
    }
  }, [applyMutation, setState])

  const select = useCallback(async (agentId: string, data: { mode: SessionMode; sessionId?: string }) => {
    setState(agentId, { isLoading: true, error: null })
    try {
      return applyMutation(agentId, await selectAgentSession(agentId, data))
    } catch (error) {
      setState(agentId, { isLoading: false, error: normalizeError(error) })
      throw error
    }
  }, [applyMutation, setState])

  const rename = useCallback(async (agentId: string, sessionId: string, name: string) => {
    setState(agentId, { isLoading: true, error: null })
    try {
      return applyMutation(agentId, await renameAgentSession(agentId, sessionId, { name }))
    } catch (error) {
      setState(agentId, { isLoading: false, error: normalizeError(error) })
      throw error
    }
  }, [applyMutation, setState])

  const remove = useCallback(async (agentId: string, sessionId: string) => {
    setState(agentId, { isLoading: true, error: null })
    try {
      return applyMutation(agentId, await deleteAgentSession(agentId, sessionId))
    } catch (error) {
      setState(agentId, { isLoading: false, error: normalizeError(error) })
      throw error
    }
  }, [applyMutation, setState])

  const value = useMemo<AgentSessionContextValue>(() => ({
    getState: (agentId: string) => states[agentId] || defaultState,
    refresh,
    create,
    select,
    rename,
    remove,
  }), [states, refresh, create, select, rename, remove])

  return <AgentSessionContext.Provider value={value}>{children}</AgentSessionContext.Provider>
}


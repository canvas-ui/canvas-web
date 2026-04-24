import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  type AgentSession,
  type AgentSessionList,
  type AgentSessionMutationResult,
  createAgentSession,
  deleteAgentSession,
  getAgentSession,
  listAgentSessions,
  renameAgentSession,
  selectAgentSession,
} from '@/services/agent'

type SessionMode = 'persistent' | 'experimental' | 'incognito'

interface AgentSessionState {
  current: AgentSession | null
  sessions: AgentSessionList | null
  isLoading: boolean
  error: string | null
}

interface AgentSessionContextValue {
  getState: (agentId: string) => AgentSessionState
  refresh: (agentId: string) => Promise<void>
  create: (agentId: string, data: { mode: SessionMode; name?: string }) => Promise<AgentSessionMutationResult>
  select: (agentId: string, data: { mode: SessionMode; sessionId?: string }) => Promise<AgentSessionMutationResult>
  rename: (agentId: string, sessionId: string, name: string) => Promise<AgentSessionMutationResult>
  remove: (agentId: string, sessionId: string) => Promise<AgentSessionMutationResult>
}

const defaultState: AgentSessionState = {
  current: null,
  sessions: null,
  isLoading: false,
  error: null,
}

const AgentSessionContext = createContext<AgentSessionContextValue | null>(null)

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

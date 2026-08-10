import { useState, useEffect, useCallback, useRef } from 'react'
import { listAgents, type Agent } from '@/services/agent'
import socketService from '@/lib/socket'

function isAgent(value: unknown): value is Agent {
  return typeof value === 'object' && value !== null
    && typeof (value as { id?: unknown }).id === 'string'
}

function eventAgent(value: unknown): Agent | null {
  if (isAgent(value)) return value
  if (typeof value !== 'object' || value === null) return null
  return isAgent((value as { agent?: unknown }).agent) ? (value as { agent: Agent }).agent : null
}

export function useAgentListData(enabled: boolean) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const hasFetched = useRef(false)

  const fetch = useCallback(async () => {
    if (isLoading) return
    setIsLoading(true)
    try {
      const data = await listAgents()
      setAgents(data || [])
      hasFetched.current = true
    } catch (err) {
      console.error('Failed to fetch agents:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading])

  const refresh = useCallback(() => {
    hasFetched.current = false
    fetch()
  }, [fetch])

  // Initial fetch
  useEffect(() => {
    if (enabled && !hasFetched.current) fetch()
  }, [enabled, fetch])

  // Socket subscriptions
  useEffect(() => {
    if (!enabled) return

    const subscribe = () => socketService.emit('subscribe', { channel: 'agent' })
    const unsubscribe = () => socketService.emit('unsubscribe', { channel: 'agent' })

    const offConnect = socketService.on('connect', subscribe)
    subscribe()

    const handleCreated = (data: unknown) => {
      const agent = eventAgent(data)
      if (!agent) return
      setAgents(prev => prev.some(a => a.id === agent.id) ? prev : [...prev, agent])
    }

    const handleUpdated = (data: unknown) => {
      const agent = eventAgent(data)
      if (!agent) return
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, ...agent } : a))
    }

    const handleDeleted = (data: unknown) => {
      const event = data as { agentId?: string; id?: string }
      const id = event?.agentId ?? event?.id
      if (!id) return
      setAgents(prev => prev.filter(a => a.id !== id))
    }

    const handleStatusChanged = (data: unknown) => {
      const event = data as { agentId?: string; id?: string; status?: Agent['status'] }
      const id = event?.agentId ?? event?.id
      const status = event?.status
      if (!id || !status) return
      setAgents(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    }

    const events: Array<[string, (data: unknown) => void]> = [
      ['agent:created', handleCreated],
      ['agent.created', handleCreated],
      ['agent:updated', handleUpdated],
      ['agent.updated', handleUpdated],
      ['agent:deleted', handleDeleted],
      ['agent.deleted', handleDeleted],
      ['agent:status:changed', handleStatusChanged],
      ['agent.status.changed', handleStatusChanged],
    ]
    events.forEach(([e, h]) => socketService.on(e, h))

    return () => {
      unsubscribe()
      offConnect?.()
      events.forEach(([e, h]) => socketService.off(e, h))
    }
  }, [enabled, fetch])

  // Window event fallback
  useEffect(() => {
    const handleRefresh = () => { hasFetched.current = false; fetch() }
    window.addEventListener('agents:refresh', handleRefresh)
    return () => window.removeEventListener('agents:refresh', handleRefresh)
  }, [fetch])

  return { agents, isLoading, refresh }
}

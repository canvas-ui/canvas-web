import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { listContexts } from '@/services/context'
import { sortByOrder } from '@/lib/list-order'
import socketService from '@/lib/socket'

export function useContextListData(enabled: boolean) {
  const [contexts, setContexts] = useState<Context[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const hasFetched = useRef(false)

  const fetch = useCallback(async () => {
    if (isLoading) return
    setIsLoading(true)
    try {
      const data = await listContexts()
      setContexts(data || [])
      hasFetched.current = true
    } catch (err) {
      console.error('Failed to fetch contexts:', err)
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

    const subscribe = () => socketService.emit('subscribe', { channel: 'context' })
    const unsubscribe = () => socketService.emit('unsubscribe', { channel: 'context' })

    const offConnect = socketService.on('connect', subscribe)
    subscribe()

    const handleCreated = (data: any) => {
      if (!data?.id || !data?.userId) return
      setContexts(prev => {
        if (prev.some(c => c.id === data.id && c.userId === data.userId)) return prev
        return [...prev, data]
      })
    }

    const handleUpdated = (data: any) => {
      if (!data?.id || !data?.userId) return
      setContexts(prev => prev.map(c =>
        (c.id === data.id && c.userId === data.userId) ? { ...c, ...data } : c
      ))
    }

    const handleDeleted = (data: any) => {
      const id = data?.contextId ?? data?.id
      if (!id) return
      setContexts(prev => prev.filter(c => c.id !== id))
    }

    const handleUrlChanged = (data: any) => {
      if (!data?.id || !data?.userId) return
      setContexts(prev => prev.map(c =>
        (c.id === data.id && c.userId === data.userId) ? { ...c, ...data } : c
      ))
    }

    const handleWorkspaceStatusChanged = () => {
      hasFetched.current = false
      fetch()
    }

    const events: Array<[string, Function]> = [
      ['context:created', handleCreated],
      ['context.created', handleCreated],
      ['context:updated', handleUpdated],
      ['context.updated', handleUpdated],
      ['context:deleted', handleDeleted],
      ['context.deleted', handleDeleted],
      ['context:url:changed', handleUrlChanged],
      ['context.url.set', handleUrlChanged],
      ['context:url:set', handleUrlChanged],
      ['workspace:status:changed', handleWorkspaceStatusChanged],
      ['workspace.status.changed', handleWorkspaceStatusChanged],
    ]
    events.forEach(([e, h]) => socketService.on(e, h))

    return () => {
      unsubscribe()
      offConnect?.()
      events.forEach(([e, h]) => socketService.off(e, h))
    }
  }, [enabled])

  // Window event fallback
  useEffect(() => {
    const handleRefresh = () => { hasFetched.current = false; fetch() }
    window.addEventListener('contexts:refresh', handleRefresh)
    return () => window.removeEventListener('contexts:refresh', handleRefresh)
  }, [fetch])

  const sortedContexts = useMemo(() => sortByOrder(contexts), [contexts])
  return { contexts: sortedContexts, isLoading, refresh }
}

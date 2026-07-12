import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { listWorkspaces } from '@/services/workspace'
import { sortByOrder } from '@/lib/list-order'
import socketService from '@/lib/socket'

export function useWorkspaceListData(enabled: boolean) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const hasFetched = useRef(false)

  const fetch = useCallback(async () => {
    if (isLoading) return
    setIsLoading(true)
    try {
      const data = await listWorkspaces()
      setWorkspaces(data || [])
      hasFetched.current = true
    } catch (err) {
      console.error('Failed to fetch workspaces:', err)
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

    const subscribe = () => socketService.emit('subscribe', { channel: 'workspace' })
    const unsubscribe = () => socketService.emit('unsubscribe', { channel: 'workspace' })

    const offConnect = socketService.on('connect', subscribe)
    subscribe()

    const handleStatusChanged = (data: any) => {
      const id = data?.workspaceId ?? data?.id
      const status = data?.status
      if (!id || !status) return
      setWorkspaces(prev => prev.map(ws => ws.id === id ? { ...ws, status } : ws))
    }

    const handleCreated = (data: any) => {
      const ws = data?.workspace ?? data
      if (!ws?.id) return
      setWorkspaces(prev => prev.some(w => w.id === ws.id) ? prev : [...prev, ws])
    }

    const handleDeleted = (data: any) => {
      const id = data?.workspaceId ?? data?.id
      if (!id) return
      setWorkspaces(prev => prev.filter(ws => ws.id !== id))
    }

    const events: Array<[string, Function]> = [
      ['workspace:status:changed', handleStatusChanged],
      ['workspace.status.changed', handleStatusChanged],
      ['workspace:created', handleCreated],
      ['workspace.created', handleCreated],
      ['workspace:deleted', handleDeleted],
      ['workspace.deleted', handleDeleted],
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
    window.addEventListener('workspaces:refresh', handleRefresh)
    return () => window.removeEventListener('workspaces:refresh', handleRefresh)
  }, [fetch])

  const sortedWorkspaces = useMemo(() => sortByOrder(workspaces), [workspaces])
  return { workspaces: sortedWorkspaces, isLoading, refresh }
}

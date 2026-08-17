import { useEffect, useState } from 'react'
import { listBackends, listBackendContainers } from '@/services/workspace'

/**
 * Writable remote destinations for a new todo — every container of a
 * write-enabled GitHub connector backend ("save this todo as an issue in
 * owner/repo"). Canvas-local is always the first, implicit option; this hook
 * only supplies the extras.
 */
export interface TodoDestination {
  driver: 'github'
  address: string
  container: string
  label: string
}

export function useTodoDestinations(workspaceName: string | null | undefined): TodoDestination[] {
  // Results are keyed by the workspace they answer for — switching workspaces
  // derives an empty list until the new fetch lands (no setState-in-effect).
  const [loaded, setLoaded] = useState<{ key: string; list: TodoDestination[] }>({ key: '', list: [] })

  useEffect(() => {
    if (!workspaceName) return
    let cancelled = false
    listBackends(workspaceName, 'github')
      .then(async (backends) => {
        const writable = backends.filter((b) => b.capabilities?.write)
        const out: TodoDestination[] = []
        for (const backend of writable) {
          const containers = await listBackendContainers(workspaceName, 'github', backend.address).catch(() => [])
          for (const container of containers) {
            if (container.writable === false) continue
            const repo = container.id || container.name
            out.push({ driver: 'github', address: backend.address, container: repo, label: `GitHub: ${repo}` })
          }
        }
        if (!cancelled) setLoaded({ key: workspaceName, list: out })
      })
      .catch(() => { if (!cancelled) setLoaded({ key: workspaceName, list: [] }) })
    return () => { cancelled = true }
  }, [workspaceName])

  return workspaceName && loaded.key === workspaceName ? loaded.list : []
}

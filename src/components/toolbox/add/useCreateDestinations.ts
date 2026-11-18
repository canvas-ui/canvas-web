import { useEffect, useState } from 'react'
import { createBackendContainerDocument, listBackends, listBackendContainers } from '@/services/workspace'
import { linkExistingDocuments, type AddTarget } from './useAddTarget'

/** Document kinds a connected backend can create, named after their schema. */
export type CreateKind = 'task' | 'event'

/**
 * A place outside Canvas a new document can be created in: one container (a
 * repository, a calendar, a task list) of a connected backend with write-back
 * enabled. Which backends and containers qualify is the server's answer
 * (`capabilities.creates` and each container's `creates`).
 */
export interface CreateDestination {
  key: string
  driver: string
  address: string
  container: string
  label: string
  /** Calendar backends: the calendar's name in Canvas (`data.calendar`). */
  calendar?: string
  /** The backend's folder in the backends tree. */
  treePath?: string
}

/**
 * The destination a backends-tree folder stands for: the container whose
 * folder `path` is in, else the first one of the backend `path` belongs to.
 */
export function destinationForBackendPath(destinations: CreateDestination[], path: string): CreateDestination | undefined {
  const segments = path.toLowerCase().split('/').filter(Boolean)
  const under = destinations.filter((d) => {
    const root = (d.treePath || '').toLowerCase().split('/').filter(Boolean)
    return root.length > 0 && root.every((segment, index) => segments[index] === segment)
  })
  return under.find((d) => segments.includes(d.container.toLowerCase().split('/').pop() || '')) ?? under[0]
}

export function useCreateDestinations(workspaceName: string | null | undefined, kind: CreateKind): CreateDestination[] {
  // Results are keyed by what they answer for — switching workspaces derives
  // an empty list until the new fetch lands (no setState-in-effect).
  const requestKey = `${workspaceName ?? ''}\0${kind}`
  const [loaded, setLoaded] = useState<{ key: string; list: CreateDestination[] }>({ key: '', list: [] })

  useEffect(() => {
    if (!workspaceName) return
    let cancelled = false
    listBackends(workspaceName)
      .then(async (backends) => {
        const out: CreateDestination[] = []
        for (const backend of backends) {
          if (backend.enabled === false || !backend.capabilities?.creates?.includes(kind)) continue
          const containers = await listBackendContainers(workspaceName, backend.driver, backend.address, { quiet: true }).catch(() => [])
          for (const container of containers) {
            if (!container.creates?.includes(kind)) continue
            const id = container.id || container.name
            const name = container.calendar || container.name || id
            out.push({
              key: `${backend.driver}:${backend.address}:${id}`,
              driver: backend.driver, address: backend.address, container: id,
              label: `${name} (${backend.driver}: ${backend.address})`,
              ...(container.calendar ? { calendar: container.calendar } : {}),
              ...(backend.treePath ? { treePath: backend.treePath } : {}),
            })
          }
        }
        if (!cancelled) setLoaded({ key: requestKey, list: out })
      })
      .catch(() => { if (!cancelled) setLoaded({ key: requestKey, list: [] }) })
    return () => { cancelled = true }
  }, [workspaceName, kind, requestKey])

  return workspaceName && loaded.key === requestKey ? loaded.list : []
}

/**
 * Create a document on a connected backend and return the id of its mirror
 * in Canvas. The mirror lives under the backend's folder; `target` (the path
 * or context the user is in) gets a link to it as well.
 */
export async function createOnDestination(
  workspaceName: string, destination: CreateDestination, kind: CreateKind,
  data: Record<string, unknown>, options: { features?: string[]; target?: AddTarget } = {},
): Promise<number> {
  const created = await createBackendContainerDocument(workspaceName, destination.driver, destination.address, destination.container, {
    ...data, kind, ...(options.features?.length ? { features: options.features } : {}),
  })
  if (typeof created.docId !== 'number') throw new Error(`Created on ${destination.label}, but it has not synced into Canvas yet. Rescan the backend to see it.`)
  const target = options.target
  if (target && !(target.mode === 'workspace' && target.treeName === 'backends')) await linkExistingDocuments(target, [created.docId])
  return created.docId
}

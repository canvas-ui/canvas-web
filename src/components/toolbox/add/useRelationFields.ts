import { useCallback, useEffect, useState } from 'react'
import {
  createDocumentRelations,
  getRelationPredicates,
  getWorkspaceDocument,
  RELATION_PREDICATES,
} from '@/services/workspace'
import { announceRelationsChanged } from '@/lib/relation-events'
import type { Document } from '@/types/workspace'
import type { RelateSeed } from '../toolbox-context'
import { resolveUploadWorkspace, type AddTarget } from './useAddTarget'

// Relations picked while a document is being created. They cannot be written
// with the document: the relation endpoint needs the subject's id, and
// `data.relations` is owned by synapsd's write-through. So the forms keep
// pending rows here, save the document, then assert the edges — the same
// two-step the identity form already does for `member-of` (useIdentityFields
// linkOrganizations). A failed edge never fails the save: the document is
// worth more than the edge, and the edge is recoverable from the Synapses tab.

export interface PendingRelation {
  predicate: string
  // Axis, never an inverse predicate: 'out' = the new document points at
  // `target`, 'in' = `target` points at the new document.
  direction: 'in' | 'out'
  targetId: number
  // For the row label; null when the picker only handed back an id and the
  // read failed (the edge is still written).
  document: Document | null
}

export const DEFAULT_RELATION_PREDICATE = 'references'

function seedRows(seed: RelateSeed | null | undefined): PendingRelation[] {
  if (!seed) return []
  return seed.documents.map((document) => ({
    predicate: DEFAULT_RELATION_PREDICATE,
    direction: 'out',
    targetId: document.id,
    document,
  }))
}

export function useRelationFields(target: AddTarget, seed?: RelateSeed | null) {
  const [rows, setRows] = useState<PendingRelation[]>(() => seedRows(seed))
  const [predicates, setPredicates] = useState<string[]>([...RELATION_PREDICATES])
  // Relations are workspace-scoped (one edge plane per index). A context is
  // always bound to exactly one workspace, so context-mode targets resolve to
  // it — asynchronously, hence state rather than a derived value.
  const contextId = target?.mode === 'context' ? target.contextId : null
  const [contextWorkspace, setContextWorkspace] = useState<{ contextId: string; workspaceName: string } | null>(null)
  useEffect(() => {
    if (!contextId) return
    let cancelled = false
    resolveUploadWorkspace({ mode: 'context', contextId })
      .then((r) => { if (!cancelled) setContextWorkspace({ contextId, workspaceName: r.workspaceName }) })
      .catch(() => { /* stays unresolved: the widget disables itself */ })
    return () => { cancelled = true }
  }, [contextId])
  const workspaceName: string | null = target?.mode === 'workspace'
    ? target.workspaceName
    : contextId && contextWorkspace?.contextId === contextId
      ? contextWorkspace.workspaceName
      : seed?.workspaceName ?? null

  // The registry is the server's (synapsd predicates.js), never a local list —
  // the local constant only covers the request's round trip.
  useEffect(() => {
    let cancelled = false
    if (!workspaceName) return
    getRelationPredicates(workspaceName).then((list) => { if (!cancelled) setPredicates(list) })
    return () => { cancelled = true }
  }, [workspaceName])

  const add = useCallback(async (predicate: string, direction: 'in' | 'out', targetIds: number[]) => {
    const fresh = targetIds.filter((id) => !rows.some((r) => r.targetId === id && r.predicate === predicate && r.direction === direction))
    if (fresh.length === 0) return
    const docs = await Promise.all(fresh.map((id) =>
      workspaceName ? getWorkspaceDocument(workspaceName, id).catch(() => null) : Promise.resolve(null)))
    setRows((prev) => [
      ...prev,
      ...fresh.map((targetId, i) => ({ predicate, direction, targetId, document: (docs[i] as Document | null) ?? null })),
    ])
  }, [rows, workspaceName])

  const update = useCallback((index: number, patch: Partial<Pick<PendingRelation, 'predicate' | 'direction'>>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }, [])

  const remove = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /**
   * Assert every pending edge for each created document. Groups by
   * predicate+axis so a row set of N targets is one request, not N. Returns
   * the number of edge writes that failed; never throws.
   */
  const write = useCallback(async (documentIds: number[]): Promise<number> => {
    if (rows.length === 0 || documentIds.length === 0 || !workspaceName) return 0
    const groups = new Map<string, { predicate: string; direction: 'in' | 'out'; targets: number[] }>()
    for (const r of rows) {
      const key = `${r.direction}:${r.predicate}`
      const g = groups.get(key) ?? { predicate: r.predicate, direction: r.direction, targets: [] }
      g.targets.push(r.targetId)
      groups.set(key, g)
    }
    let failed = 0
    for (const id of documentIds) {
      for (const g of groups.values()) {
        try {
          await createDocumentRelations(workspaceName, id, g.predicate, g.targets, g.direction)
        } catch (err) {
          failed += 1
          console.error('Failed to relate document', id, g.predicate, err)
        }
      }
    }
    if (failed < documentIds.length * groups.size) announceRelationsChanged()
    return failed
  }, [rows, workspaceName])

  return { rows, predicates, workspaceName, add, update, remove, write, hasRows: rows.length > 0 }
}

export type RelationFieldsState = ReturnType<typeof useRelationFields>

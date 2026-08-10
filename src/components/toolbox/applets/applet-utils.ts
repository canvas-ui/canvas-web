import { useCallback, useEffect, useState } from 'react'
import {
  getWorkspaceDocuments,
  deleteWorkspaceDocuments,
  DEFAULT_WORKSPACE_TREE_NAME,
} from '@/services/workspace'
import { getContextDocuments, getContext } from '@/services/context'
import type { Document } from '@/types/workspace'
import type { AppletTarget } from './applet-target'

const APPLET_LIST_LIMIT = 50

function isDocument(value: unknown): value is Document {
  if (!value || typeof value !== 'object') return false
  const doc = value as Record<string, unknown>
  return typeof doc.id === 'number' &&
    typeof doc.schema === 'string' &&
    typeof doc.schemaVersion === 'string' &&
    typeof doc.createdAt === 'string' &&
    typeof doc.updatedAt === 'string' &&
    typeof doc.data === 'object' && doc.data !== null &&
    typeof doc.metadata === 'object' && doc.metadata !== null &&
    typeof doc.indexOptions === 'object' && doc.indexOptions !== null &&
    Array.isArray(doc.checksumArray)
}

export function formatCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export interface AppletScope {
  workspaceName: string
  path: string
  treeName: string
  treeType: 'context' | 'directory'
}

export function useAppletDocs(target: AppletTarget, schema: string) {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<AppletScope | null>(null)

  const load = useCallback(async () => {
    if (!target) { setDocs([]); setScope(null); return }
    setLoading(true)
    setError(null)
    try {
      if (target.mode === 'context') {
        const [list, ctx] = await Promise.all([
          getContextDocuments(target.contextId, [schema]),
          getContext(target.contextId),
        ])
        setDocs(Array.isArray(list) ? list.filter(isDocument) : [])
        const workspaceName = ctx.workspaceName || ctx.workspaceId
        setScope(workspaceName ? {
          workspaceName,
          path: ctx.path || '/',
          treeName: ctx.treeId || DEFAULT_WORKSPACE_TREE_NAME,
          treeType: 'context',
        } : null)
      } else {
        const res = await getWorkspaceDocuments(target.workspaceName, target.path, [schema], {
          treeName: target.treeName,
          treeType: target.treeType,
          limit: APPLET_LIST_LIMIT,
        })
        setDocs(res.payload || [])
        setScope({ workspaceName: target.workspaceName, path: target.path, treeName: target.treeName, treeType: target.treeType })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [target, schema])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  useEffect(() => {
    const onRefresh = () => { void load() }
    window.addEventListener('workspace:documents:refresh', onRefresh)
    return () => window.removeEventListener('workspace:documents:refresh', onRefresh)
  }, [load])

  const removeDoc = useCallback(async (id: number) => {
    if (!scope) throw new Error('No workspace scope resolved')
    await deleteWorkspaceDocuments(scope.workspaceName, [id], scope.path, [], scope.treeName, scope.treeType)
    setDocs(prev => prev.filter(d => d.id !== id))
  }, [scope])

  return { docs, setDocs, loading, error, scope, reload: load, removeDoc }
}

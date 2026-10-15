import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Document } from '@/types/workspace'
import { getWorkspaceDocument } from '@/services/workspace'
import { documentSideHash, readDocumentSideLocation } from '@/lib/document-side-location'
import { SideViewContext, type SideViewContextValue } from './use-side-view'

// Global "open document to the side" state — shrinks ContentArea's main pane
// and shows the doc in a B5Card sibling. Additive to (not a replacement for)
// the pre-existing MenuTreeView/WorkspaceM2 "open to side" (canvas/tree-path
// side pane local to the workspace detail page) — that stays untouched.
export function SideViewProvider({ children }: { children: ReactNode }) {
  const route = useLocation()
  const navigate = useNavigate()
  const location = useMemo(() => readDocumentSideLocation(route.hash), [route.hash])
  const workspaceId = location?.workspaceId
  const documentId = location?.documentId
  const key = workspaceId && documentId ? JSON.stringify([workspaceId, documentId]) : null
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; revision: number; document: Document | null; error?: string } | null>(null)
  const current = loaded?.key === key && loaded?.revision === revision ? loaded : null

  useEffect(() => {
    if (!key || !workspaceId || !documentId || current) return
    let cancelled = false
    getWorkspaceDocument(workspaceId, documentId).then(document => {
      if (!cancelled) setLoaded({ key, revision, document, error: document ? undefined : 'Document not found.' })
    }).catch(error => {
      if (!cancelled) setLoaded({ key, revision, document: null,
        error: error?.statusCode === 404 ? 'Document not found.' : 'Unable to load this document.' })
    })
    return () => { cancelled = true }
  }, [key, workspaceId, documentId, revision, current])

  const open = useCallback((document: Document, workspaceId: string) => {
    setLoaded({ key: JSON.stringify([workspaceId, document.id]), revision, document })
    navigate({ pathname: route.pathname, search: route.search,
      hash: documentSideHash({ workspaceId, documentId: document.id, section: 'view', maximized: false }) }, { state: route.state })
  }, [navigate, route.pathname, route.search, route.state, revision])
  const close = useCallback(() => {
    if (location) navigate({ pathname: route.pathname, search: route.search, hash: '' }, { replace: true, state: route.state })
  }, [location, navigate, route.pathname, route.search, route.state])
  const replace = useCallback((document: Document, workspaceId: string) => {
    if (!location) return
    setLoaded({ key: JSON.stringify([workspaceId, document.id]), revision, document })
    navigate({ pathname: route.pathname, search: route.search,
      hash: documentSideHash({ ...location, workspaceId, documentId: document.id }) }, { replace: true, state: route.state })
  }, [location, revision, navigate, route.pathname, route.search, route.state])
  const update = useCallback<NonNullable<SideViewContextValue['update']>>(change => {
    if (location) navigate({ pathname: route.pathname, search: route.search, hash: documentSideHash({ ...location, ...change }) }, { replace: true, state: route.state })
  }, [location, navigate, route.pathname, route.search, route.state])
  const retry = useCallback(() => setRevision(value => value + 1), [])

  const value = useMemo<SideViewContextValue>(() => ({
    entry: current?.document && workspaceId ? { document: current.document, workspaceId } : null,
    location, loading: !!location && !current, error: current?.error, open, replace, close, update, retry,
  }), [current, workspaceId, location, open, replace, close, update, retry])

  return <SideViewContext.Provider value={value}>{children}</SideViewContext.Provider>
}

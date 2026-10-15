import { useCallback, useEffect, useRef, useState } from 'react'
import { getWorkspaceDocument } from '@/services/workspace'
import type { Document } from '@/types/workspace'

/**
 * Keeps a detail host showing the SAVED document rather than the snapshot it
 * was opened with.
 *
 * Hosts (properties modal, side card) get their `document` from the list that
 * opened them. Saving an inline edit writes to the server and asks the list to
 * refresh, but the host keeps rendering the object it was handed — so the
 * header title, the view tab and a re-opened edit form all still show pre-edit
 * values until the host is closed and re-opened. Calling `refresh()` after a
 * change re-reads the document by id and overlays the fresh copy.
 */
export function useLiveDocument(workspaceId: string | undefined, document: Document | null) {
  const [fresh, setFresh] = useState<Document | null>(null)
  const id = document?.id ?? null
  const identity = `${workspaceId}:${id}`

  // Render-time reset: a host that swaps to another document must not keep
  // showing the previous one's refreshed copy.
  const [lastIdentity, setLastIdentity] = useState(identity)
  if (identity !== lastIdentity) {
    setLastIdentity(identity)
    setFresh(null)
  }

  // In-flight fetches are tagged with the id they were issued for: a slow read
  // that lands after the host moved on would otherwise overwrite the new doc.
  const wantedIdentity = useRef(identity)
  const request = useRef(0)
  useEffect(() => {
    wantedIdentity.current = identity
    request.current++
    return () => { wantedIdentity.current = '' }
  }, [identity])

  const currentId = fresh?.id ?? id
  const refresh = useCallback((saved?: Document) => {
    if (!workspaceId || currentId == null || wantedIdentity.current !== identity) return
    const sequence = ++request.current
    // The save has already read the committed row. Apply it before leaving the
    // editor, including a successor id when shared-content files split on edit.
    if (saved) { setFresh(saved); return }
    getWorkspaceDocument(workspaceId, currentId)
      .then((doc) => { if (wantedIdentity.current === identity && request.current === sequence && doc) setFresh(doc) })
      .catch(() => {})
  }, [workspaceId, currentId, identity])

  return { document: fresh ?? document, refresh }
}

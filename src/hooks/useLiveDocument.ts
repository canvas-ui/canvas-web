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

  // Render-time reset: a host that swaps to another document must not keep
  // showing the previous one's refreshed copy.
  const [lastId, setLastId] = useState(id)
  if (id !== lastId) {
    setLastId(id)
    setFresh(null)
  }

  // In-flight fetches are tagged with the id they were issued for: a slow read
  // that lands after the host moved on would otherwise overwrite the new doc.
  const wantedId = useRef(id)
  useEffect(() => { wantedId.current = id }, [id])

  const refresh = useCallback(() => {
    if (!workspaceId || id == null) return
    getWorkspaceDocument(workspaceId, id)
      .then((doc) => { if (wantedId.current === id && doc) setFresh(doc) })
      .catch(() => {})
  }, [workspaceId, id])

  return { document: fresh ?? document, refresh }
}

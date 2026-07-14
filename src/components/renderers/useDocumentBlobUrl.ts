import { useEffect, useState } from 'react'
import { useDocumentContent } from './public-share'

interface Options {
  // Target a specific location/attachment URL of the document.
  url?: string
  // 'blob' → objectURL for <img>/<video>/<iframe>; 'text' → decoded string
  // (read via blob.text(), NOT fetch(blob:) — that trips CSP connect-src).
  mode?: 'blob' | 'text'
  enabled?: boolean
  maxTextLength?: number
  // Correct MIME to stamp on the object URL when the server returns a generic
  // one (missing / application/octet-stream). <video>/<audio> won't decode a
  // typeless blob, so a `.mp4` served as octet-stream must be re-typed.
  typeHint?: string
}

interface State {
  blobUrl: string | null
  text: string | null
  mime: string | null
  error: string | null
  loading: boolean
}

const idleState = (loading: boolean): State => ({ blobUrl: null, text: null, mime: null, error: null, loading })

// Authed fetch of a document's bytes with objectURL lifecycle management
// (extracted from the old file-preview component so every renderer shares it).
export function useDocumentBlobUrl(
  workspaceId: string,
  documentId: number | string,
  { url, mode = 'blob', enabled = true, maxTextLength = 200_000, typeHint }: Options = {},
): State {
  const { isPublic, fetchBlob } = useDocumentContent(workspaceId)
  const fetchKey = `${isPublic ? 'pub' : 'ws'}:${workspaceId}:${documentId}:${url ?? ''}:${mode}:${enabled}:${typeHint ?? ''}`
  const [state, setState] = useState<State>(idleState(enabled))
  // Render-time reset when the fetch target changes (no setState-in-effect).
  const [lastKey, setLastKey] = useState(fetchKey)
  if (fetchKey !== lastKey) {
    setLastKey(fetchKey)
    setState(idleState(enabled))
  }

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let createdUrl: string | null = null

    fetchBlob(documentId, url ? { url } : {})
      .then(async ({ blob, mime }) => {
        if (cancelled) return
        if (mode === 'text') {
          const txt = await blob.text()
          if (!cancelled) setState({ blobUrl: null, text: txt.slice(0, maxTextLength), mime, error: null, loading: false })
        } else {
          // Re-type when the server gave a generic/empty MIME but we know better
          // from the filename — otherwise <video>/<audio> refuse to decode.
          const needsRetype = typeHint && (!blob.type || blob.type === 'application/octet-stream')
          const typed = needsRetype ? blob.slice(0, blob.size, typeHint) : blob
          createdUrl = URL.createObjectURL(typed)
          if (cancelled) { URL.revokeObjectURL(createdUrl); createdUrl = null; return }
          setState({ blobUrl: createdUrl, text: null, mime: needsRetype ? typeHint : mime, error: null, loading: false })
        }
      })
      .catch((e) => {
        if (!cancelled) setState({ blobUrl: null, text: null, mime: null, error: String(e instanceof Error ? e.message : e), loading: false })
      })

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
    // fetchKey encodes every input that must retrigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey])

  return state
}

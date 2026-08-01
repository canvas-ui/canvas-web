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
  // The fetched bytes themselves (blob mode) — for consumers that must read
  // the data (pdf.js), since fetch(blob:) is blocked by CSP connect-src.
  blob: Blob | null
  text: string | null
  mime: string | null
  error: string | null
  loading: boolean
}

const idleState = (loading: boolean): State => ({ blobUrl: null, blob: null, text: null, mime: null, error: null, loading })

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
          if (!cancelled) setState({ blobUrl: null, blob: null, text: txt.slice(0, maxTextLength), mime, error: null, loading: false })
        } else {
          // Re-type when the server gave a generic/empty MIME but we know better
          // from the filename — otherwise <video>/<audio> refuse to decode.
          const needsRetype = typeHint && (!blob.type || blob.type === 'application/octet-stream')
          const typed = needsRetype ? blob.slice(0, blob.size, typeHint) : blob
          createdUrl = URL.createObjectURL(typed)
          if (cancelled) { URL.revokeObjectURL(createdUrl); createdUrl = null; return }
          setState({ blobUrl: createdUrl, blob: typed, text: null, mime: needsRetype ? typeHint : mime, error: null, loading: false })
        }
      })
      .catch((e) => {
        if (!cancelled) setState({ blobUrl: null, blob: null, text: null, mime: null, error: String(e instanceof Error ? e.message : e), loading: false })
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

// Direct streaming source for a media element: mints the short-lived media
// cookie (authed app) or uses the public mirror URL (share), then returns a
// URL the browser can range-request. Unlike useDocumentBlobUrl this never
// downloads the whole file — playback/seeking stream on demand.
export function useDocumentStreamSrc(
  workspaceId: string,
  documentId: number | string,
): { src: string | null; error: string | null; loading: boolean } {
  const { isPublic, streamUrl, mintTicket } = useDocumentContent(workspaceId)
  const key = `${isPublic ? 'pub' : 'ws'}:${workspaceId}:${documentId}`
  const [state, setState] = useState<{ src: string | null; error: string | null; loading: boolean }>({ src: null, error: null, loading: true })
  // Render-time reset when the target changes (no setState-in-effect).
  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) {
    setLastKey(key)
    setState({ src: null, error: null, loading: true })
  }

  useEffect(() => {
    let cancelled = false
    mintTicket(documentId)
      .then((ok) => {
        if (cancelled) return
        if (ok) setState({ src: streamUrl(documentId), error: null, loading: false })
        else setState({ src: null, error: 'Could not authorize stream', loading: false })
      })
      .catch((e) => {
        if (!cancelled) setState({ src: null, error: e instanceof Error ? e.message : String(e), loading: false })
      })
    return () => { cancelled = true }
    // key encodes workspace + document + public/authed; the helpers are stable per that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

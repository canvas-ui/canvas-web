import { useEffect, useState } from 'react'
import { useDocumentContent } from './public-share'

interface State {
  blobUrl: string | null
  error: string | null
  loading: boolean
}

// Server-side thumbnail (on-demand sharp → stored.cache) with graceful
// fallback to the full-size bytes when no thumbnail is available (non-image,
// older server, generation failure). Share-aware like useDocumentBlobUrl.
// Pass blobFallback: false when the raw bytes are not renderable in an <img>
// (PDFs) — a failed thumbnail then reports error instead of a broken image.
export function useDocumentThumbnail(
  workspaceId: string,
  documentId: number | string,
  size = 256,
  { enabled = true, blobFallback = true }: { enabled?: boolean; blobFallback?: boolean } = {},
): State {
  const { isPublic, fetchBlob, fetchThumbnail } = useDocumentContent(workspaceId)
  const fetchKey = `${isPublic ? 'pub' : 'ws'}:${workspaceId}:${documentId}:${size}:${enabled}`
  const [state, setState] = useState<State>({ blobUrl: null, error: null, loading: enabled })
  const [lastKey, setLastKey] = useState(fetchKey)
  if (fetchKey !== lastKey) {
    setLastKey(fetchKey)
    setState({ blobUrl: null, error: null, loading: enabled })
  }

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let createdUrl: string | null = null

    fetchThumbnail(documentId, size)
      .catch((e) => { if (!blobFallback) throw e; return fetchBlob(documentId) }) // fallback: full-size bytes
      .then(({ blob }) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setState({ blobUrl: createdUrl, error: null, loading: false })
      })
      .catch((e) => {
        if (!cancelled) setState({ blobUrl: null, error: String(e instanceof Error ? e.message : e), loading: false })
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

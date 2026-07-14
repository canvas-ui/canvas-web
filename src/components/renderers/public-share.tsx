import { createContext, useContext } from 'react'
import { API_URL } from '@/config/api'
import { fetchDocumentBlob, downloadDocument, fetchDocumentThumbnail, documentStreamUrl, requestContentTicket } from '@/services/workspace'

// Public canvas share scope. When a share code is provided (pub viewer page),
// every document byte-fetch below it goes through the unauthenticated
// /pub/c/:code/documents/:docId/content mirror instead of the authenticated
// workspace route — anonymous viewers otherwise hit 401s (and the api client
// bounces them to /login on authed API calls).
export const PublicShareContext = createContext<string | null>(null)

export function usePublicShareCode(): string | null {
  return useContext(PublicShareContext)
}

export function publicDocumentContentUrl(code: string, documentId: number | string, opts: { url?: string; download?: boolean } = {}): string {
  const params = new URLSearchParams()
  if (opts.download) params.set('download', '1')
  if (opts.url) params.set('url', opts.url)
  const qs = params.toString()
  return `${API_URL}/pub/c/${encodeURIComponent(code)}/documents/${documentId}/content${qs ? `?${qs}` : ''}`
}

async function fetchPublicThumbnail(code: string, documentId: number | string, size = 256): Promise<{ blob: Blob; mime: string }> {
  const res = await fetch(`${API_URL}/pub/c/${encodeURIComponent(code)}/documents/${documentId}/thumbnail?size=${size}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mime = res.headers.get('content-type') || 'image/webp'
  return { blob: await res.blob(), mime }
}

async function fetchPublicBlob(code: string, documentId: number | string, opts: { url?: string } = {}): Promise<{ blob: Blob; mime: string }> {
  const res = await fetch(publicDocumentContentUrl(code, documentId, opts))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mime = res.headers.get('content-type') || 'application/octet-stream'
  return { blob: await res.blob(), mime }
}

async function downloadPublicDocument(code: string, documentId: number | string, filename: string, opts: { url?: string } = {}): Promise<void> {
  const { blob } = await fetchPublicBlob(code, documentId, { ...opts })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Share-aware document byte access. Components must use this instead of
 * calling fetchDocumentBlob/downloadDocument directly so they work in both
 * the authenticated app and the public canvas viewer.
 */
export function useDocumentContent(workspaceId: string) {
  const code = usePublicShareCode()
  return {
    isPublic: code != null,
    fetchBlob: (documentId: number | string, opts: { url?: string } = {}) =>
      code ? fetchPublicBlob(code, documentId, opts) : fetchDocumentBlob(workspaceId, documentId, opts),
    fetchThumbnail: (documentId: number | string, size = 256) =>
      code ? fetchPublicThumbnail(code, documentId, size) : fetchDocumentThumbnail(workspaceId, documentId, size),
    download: (documentId: number | string, filename: string, opts: { url?: string } = {}) =>
      code ? downloadPublicDocument(code, documentId, filename, opts) : downloadDocument(workspaceId, documentId, filename, opts),
    // Direct, range-streamable src for <video>/<audio>. Public shares hit the
    // unauthenticated mirror directly; the authed app streams via a short-lived
    // media cookie (mintTicket) so no token rides in the URL.
    streamUrl: (documentId: number | string, opts: { url?: string } = {}) =>
      code ? publicDocumentContentUrl(code, documentId, opts) : documentStreamUrl(workspaceId, documentId, opts),
    mintTicket: (documentId: number | string) =>
      code ? Promise.resolve(true) : requestContentTicket(workspaceId, documentId),
  }
}

import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

export interface BlobUploadResult {
  url: string
  key: string
  checksum: string
  size: number
  mimeType?: string | null
  metadata?: Record<string, unknown>
}

// Raw-bytes upload into a workspace's blob store (workspace:data). Returns a
// stored:// URL usable as a document location — see src/transports/routes/workspaces/blobs.js.
// api.post already unwraps the response envelope — the result IS the payload.
export async function uploadWorkspaceBlob(workspaceName: string, file: File | Blob): Promise<BlobUploadResult> {
  return api.post<BlobUploadResult>(
    `${API_ROUTES.workspaces}/${workspaceName}/blobs`,
    file,
    { headers: { 'Content-Type': 'application/octet-stream' } },
  )
}

// Batch existence check against the content-addressed store: sha256 hex →
// persistBlob-shaped result, or null when the workspace doesn't hold the bytes.
// The resume seam — hash locally, skip the transfer for anything already there.
export async function checkWorkspaceBlobs(
  workspaceName: string,
  checksums: string[],
): Promise<Record<string, BlobUploadResult | null>> {
  return api.post<Record<string, BlobUploadResult | null>>(
    `${API_ROUTES.workspaces}/${workspaceName}/blobs/exists`,
    { checksums },
  )
}

export interface UploadProgressOptions {
  /** Bytes sent so far / total. Fires on the browser's own progress cadence. */
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
}

// Same endpoint as uploadWorkspaceBlob, but via XMLHttpRequest — fetch() has
// no upload progress events, and per-file progress is the whole point of the
// multi-file upload queue. Auth mirrors lib/api: Bearer token from
// localStorage + credentials included for cookie sessions.
export function uploadWorkspaceBlobWithProgress(
  workspaceName: string,
  file: File | Blob,
  { onProgress, signal }: UploadProgressOptions = {},
): Promise<BlobUploadResult> {
  const url = `${API_ROUTES.workspaces}/${workspaceName}/blobs`
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.responseType = 'json'
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    const token = localStorage.getItem('authToken')
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total)
      })
    }

    const onAbort = () => xhr.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    xhr.addEventListener('load', () => {
      signal?.removeEventListener('abort', onAbort)
      const envelope = xhr.response as { payload?: BlobUploadResult; message?: string } | null
      if (xhr.status >= 200 && xhr.status < 300 && envelope?.payload) {
        resolve(envelope.payload)
      } else {
        reject(new Error(envelope?.message || `Upload failed (HTTP ${xhr.status})`))
      }
    })
    xhr.addEventListener('error', () => {
      signal?.removeEventListener('abort', onAbort)
      reject(new Error('Network error during upload'))
    })
    xhr.addEventListener('abort', () => {
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Upload aborted', 'AbortError'))
    })

    xhr.send(file)
  })
}

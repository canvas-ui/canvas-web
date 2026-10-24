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

export interface BackendObjectWriteResult {
  key: string
  sha256: string
  size: number
  mtime: number | null
  seq?: number
  docId: number | null
  version: number | null
  previous: { sha256: string | null } | null
  unchanged: boolean
}

// Write bytes IN PLACE onto the file backend that owns a key (workspace:home,
// a mounted folder): the sync-protocol route canvas-fuse uses. Unlike the
// blob store this replaces the real file on disk, so an edit made here is
// what every other integration (mirror, WebDAV, the folder watcher) sees.
// `ifMatch` is the sha256 the edit started from; a concurrent change answers
// 412 rather than being overwritten.
export async function writeBackendObject(
  workspaceName: string,
  target: { driver: string; address: string; key: string },
  body: Blob,
  { ifMatch, contentType }: { ifMatch?: string; contentType?: string } = {},
): Promise<BackendObjectWriteResult> {
  const key = target.key.split('/').map(encodeURIComponent).join('/')
  const url = `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceName)}/backends/${encodeURIComponent(target.driver)}/${encodeURIComponent(target.address)}/objects/${key}`
  return api.put<BackendObjectWriteResult>(url, body, {
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'X-Canvas-Mtime': String(Date.now()),
      ...(ifMatch ? { 'If-Match': `"${ifMatch}"` } : { 'If-None-Match': '*' }),
    },
  })
}

export interface UploadProgressOptions {
  /** Bytes sent so far / total. Fires on the browser's own progress cadence. */
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
}

// Same endpoint as uploadWorkspaceBlob, but via XMLHttpRequest — fetch() has
// no upload progress events, and per-file progress is the whole point of the
// multi-file upload queue. Auth mirrors lib/api: Bearer token from
// localStorage + credentials included for cookie sessions. Large files go
// through a resumable session.
export function uploadWorkspaceBlobWithProgress(
  workspaceName: string,
  file: File,
  { onProgress, signal, sha256 }: UploadProgressOptions & { sha256?: string } = {},
): Promise<BlobUploadResult> {
  if (file.size >= RESUMABLE_MIN_BYTES) return uploadResumable<BlobUploadResult>(workspaceName, file, { sha256, onProgress, signal })
  return uploadWithProgress<BlobUploadResult>(`${API_ROUTES.workspaces}/${workspaceName}/blobs`, 'POST', file, { onProgress, signal })
}

export function uploadBackendFileWithProgress(
  workspaceName: string,
  target: { driver: string; address: string; key: string },
  file: File,
  options: UploadProgressOptions = {},
): Promise<{ docId: number | null; key: string }> {
  if (file.size >= RESUMABLE_MIN_BYTES) {
    return uploadResumable(workspaceName, file, {
      ...options,
      target: { type: 'object', ...target, ifNoneMatch: '*', mtime: file.lastModified, ...(file.type ? { mimeType: file.type } : {}) },
    })
  }
  const key = target.key.split('/').map(encodeURIComponent).join('/')
  const url = `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceName)}/backends/${encodeURIComponent(target.driver)}/${encodeURIComponent(target.address)}/objects/${key}`
  return uploadWithProgress(url, 'PUT', file, options, { 'If-None-Match': '*', 'X-Canvas-Mtime': String(file.lastModified) })
}

export interface UploadSession<T = unknown> {
  id: string
  size: number
  offset: number
  state: 'open' | 'finalizing' | 'complete' | 'failed'
  result?: T
  error?: { code: string; message: string; retryable?: boolean }
}

export type UploadTarget =
  | { type: 'blob' }
  | { type: 'object'; driver: string; address: string; key: string; ifMatch?: string; ifNoneMatch?: string; mtime?: number; mimeType?: string }

/** Files from this size on upload through resumable sessions. */
export const RESUMABLE_MIN_BYTES = 8 * 1024 * 1024
const RESUME_ATTEMPTS = 10

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Upload aborted', 'AbortError')); return }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
  const onAbort = () => { clearTimeout(timer); reject(new DOMException('Upload aborted', 'AbortError')) }
  signal?.addEventListener('abort', onAbort, { once: true })
})

/** Identifies a local file across page reloads without reading it. */
export function fileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

/**
 * Upload through a server-side session (POST/PATCH/GET …/uploads): after a
 * dropped connection it asks the server how much arrived and sends only the
 * rest, backing off up to 30 s between attempts. Opening the same file again
 * (same sha256, or else the same name, size and mtime) continues an unfinished
 * session, so a reloaded page resumes too. Large files are never hashed here:
 * the server hashes what it receives. Resolves with what the target write
 * returned: a blob, or the backend object.
 */
export async function uploadResumable<T>(
  workspaceName: string,
  file: File,
  { sha256, target = { type: 'blob' }, onProgress, signal }: UploadProgressOptions & { sha256?: string; target?: UploadTarget },
): Promise<T> {
  const base = `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceName)}/uploads`
  let session = await api.post<UploadSession<T>>(base, { size: file.size, ...(sha256 ? { sha256 } : { fingerprint: fileFingerprint(file) }), target })
  const url = `${base}/${session.id}`
  let failures = 0
  let stale = false
  while (session.state === 'open' || session.state === 'finalizing' || (session.state === 'failed' && session.error?.retryable && failures === 0)) {
    if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError')
    try {
      if (stale) { session = await api.get<UploadSession<T>>(url); stale = false; continue }
      if (session.state === 'finalizing') { await sleep(1000, signal); stale = true; continue }
      const from = session.offset
      const before = session.offset
      session = await uploadWithProgress<UploadSession<T>>(url, 'PATCH', file.slice(from), {
        signal, onProgress: onProgress ? (sent) => onProgress(from + sent, file.size) : undefined,
      }, { 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(from) })
      if (session.state === 'failed') failures++
      else if (session.offset > before || session.state !== 'open') failures = 0
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (++failures >= RESUME_ATTEMPTS) throw error
      await sleep(Math.min(30_000, 1000 * 2 ** (failures - 1)), signal)
      stale = true
    }
  }
  if (session.state !== 'complete') throw new Error(session.error?.message || 'Upload failed')
  return session.result as T
}

function uploadWithProgress<T>(
  url: string, method: 'POST' | 'PUT' | 'PATCH', file: File | Blob,
  { onProgress, signal }: UploadProgressOptions,
  headers: Record<string, string> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Upload aborted', 'AbortError')); return }
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    xhr.withCredentials = true
    xhr.responseType = 'json'
    for (const [name, value] of Object.entries({ 'Content-Type': 'application/octet-stream', ...headers })) xhr.setRequestHeader(name, value)
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
      const envelope = xhr.response as { payload?: T; message?: string } | null
      if (xhr.status >= 200 && xhr.status < 300 && envelope?.payload) {
        resolve(envelope.payload)
      } else {
        reject(new Error(xhr.status === 412 ? 'A file with this name already exists. Rename the file before uploading; nothing was overwritten.' : envelope?.message || `Upload failed (HTTP ${xhr.status})`))
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

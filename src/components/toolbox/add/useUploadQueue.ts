import { useCallback, useEffect, useRef, useState } from 'react'
import { backendUploadKey, type BackendUploadTarget } from '@/lib/backend-upload'
import { sha256File } from '@/lib/sha256'
import {
  RESUMABLE_MIN_BYTES,
  checkWorkspaceBlobs,
  uploadWorkspaceBlobWithProgress,
  uploadBackendFileWithProgress,
  type BlobUploadResult,
} from '@/services/blobs'
import { submitDocuments, notifyWorkspaceDocumentsChanged, resolveUploadWorkspace, resolveBackendUpload, type AddTarget } from './useAddTarget'

// Per-file upload pipeline with resume semantics:
//   hash small files locally → batch-ask the server which checksums it already holds →
//   skip the byte transfer for those (content-addressed store) → upload the
//   rest with real progress → insert each File document as its blob lands.
// Large files upload through resumable sessions (services/blobs.ts): a
// dropped connection continues where the server's copy ends.
// A failed batch is re-runnable: retry (or re-selecting the same files later)
// re-hashes, the exists check marks everything already persisted as done
// instantly, and only the genuinely missing bytes travel again. Documents
// insert per file, so a batch that dies at photo 37 still keeps 1–36.

export type UploadStatus =
  | 'queued'
  | 'hashing'
  | 'checking'
  | 'uploading'
  | 'linking' // blob persisted, inserting the File document
  | 'done'
  | 'error'

export interface UploadItem {
  id: string
  file: File
  status: UploadStatus
  /** 0..1 — hashing progress while hashing, bytes sent while uploading. */
  progress: number
  /** Bytes were already server-side; no transfer happened. */
  resumed?: boolean
  error?: string
  docId?: number
}

export interface UploadSummary {
  done: number
  resumed: number
  failed: number
  total: number
  /** Ids of the documents created (or resumed) in this run. */
  docIds: number[]
}

const UPLOAD_CONCURRENCY = 3

export function itemKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function summarizeUpload(items: UploadItem[]): UploadSummary {
  return {
    done: items.filter((it) => it.status === 'done').length,
    resumed: items.filter((it) => it.status === 'done' && it.resumed).length,
    failed: items.filter((it) => it.status === 'error').length,
    total: items.length,
    docIds: items.flatMap((it) => (it.status === 'done' && it.docId != null ? [it.docId] : [])),
  }
}

export type BuildUploadDocument = (blob: BlobUploadResult, file: File) => Record<string, unknown>

/**
 * Runs every non-done item through the pipeline. State lives with the caller
 * (`items` reads it fresh between awaits, `patch` writes it), so the same
 * pipeline serves a form's own queue and the background upload manager.
 */
export async function runUploadPipeline({ target, destination, items, patch, buildDoc, signal }: {
  target: NonNullable<AddTarget>
  destination: { workspaceName: string; backend: BackendUploadTarget | null }
  items: () => UploadItem[]
  patch: (id: string, changes: Partial<UploadItem>) => void
  buildDoc: BuildUploadDocument
  signal: AbortSignal
}): Promise<void> {
  const { workspaceName, backend } = destination
  const pending = items().filter((it) => it.status !== 'done')
  // Fresh run over previously failed items: clear stale error state.
  for (const it of pending) patch(it.id, { status: 'queued', progress: 0, error: undefined })

  try {
    if (backend) {
      // Upload bytes straight to the selected backend folder. The server
      // indexes the resulting file, so never import a second DB document.
      let cursor = 0
      const worker = async () => {
        while (cursor < pending.length && !signal.aborted) {
          const it = pending[cursor++]
          try {
            patch(it.id, { status: 'uploading', progress: 0, resumed: false })
            const result = await uploadBackendFileWithProgress(workspaceName, {
              ...backend, key: backendUploadKey(backend.key, it.file.name),
            }, it.file, {
              signal: signal,
              onProgress: (sent, total) => patch(it.id, { progress: total ? sent / total : 0 }),
            })
            patch(it.id, { status: 'done', progress: 1, docId: result.docId ?? undefined })
          } catch (error) {
            patch(it.id, { status: 'error', error: error instanceof Error ? error.message : 'Upload failed' })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, worker))
    } else {
      // 1. Hash small files locally (sequential, disk/CPU bound) for the
      // exists check. Large files are never hashed in the browser: they
      // upload through resumable sessions and the server hashes them.
      const checksums = new Map<string, string>()
      for (const it of pending) {
        if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
        if (it.file.size >= RESUMABLE_MIN_BYTES) continue
        patch(it.id, { status: 'hashing' })
        try {
          const sum = await sha256File(it.file, (f) => patch(it.id, { progress: f }))
          checksums.set(it.id, sum)
          patch(it.id, { status: 'checking', progress: 0 })
        } catch (err) {
          patch(it.id, { status: 'error', error: err instanceof Error ? err.message : 'Failed to read file' })
        }
      }

      // 2. One batch round-trip: which of these does the workspace already hold?
      let existing: Record<string, BlobUploadResult | null> = {}
      if (checksums.size) {
        try {
          existing = await checkWorkspaceBlobs(workspaceName, [...new Set(checksums.values())])
        } catch {
          // Endpoint unavailable (older server) — degrade to plain uploads.
          existing = {}
        }
      }

      // 3. Upload the misses / link the hits, a small pool at a time.
      const queue = pending.filter((it) => checksums.has(it.id) || it.file.size >= RESUMABLE_MIN_BYTES)
      let cursor = 0
      const worker = async () => {
        while (cursor < queue.length) {
          if (signal.aborted) return
          const it = queue[cursor++]
          const checksum = checksums.get(it.id)
          try {
            let blob = checksum ? existing[checksum] ?? null : null
            if (blob) {
              patch(it.id, { status: 'linking', progress: 1, resumed: true })
            } else {
              patch(it.id, { status: 'uploading', progress: 0 })
              blob = await uploadWorkspaceBlobWithProgress(workspaceName, it.file, {
                sha256: checksum,
                signal: signal,
                onProgress: (sent, total) => patch(it.id, { progress: total ? sent / total : 0 }),
              })
              patch(it.id, { status: 'linking', progress: 1 })
            }
            // Insert immediately so a later failure can't orphan this file's
            // work. synapsd upserts by checksum, so re-runs are idempotent.
            const ids = await submitDocuments(target, [buildDoc(blob, it.file)], { refresh: false })
            patch(it.id, { status: 'done', docId: ids[0] })
          } catch (err) {
            const aborted = err instanceof DOMException && err.name === 'AbortError'
            patch(it.id, {
              status: 'error',
              error: aborted ? 'Cancelled' : err instanceof Error ? err.message : 'Upload failed',
            })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker))
    }
  } finally {
    if (signal.aborted) {
      for (const it of items()) {
        if (it.status !== 'done' && it.status !== 'error') patch(it.id, { status: 'error', error: 'Cancelled' })
      }
    }
    // One list reload for the whole batch, however far it got.
    if (items().some((it) => it.status === 'done')) {
      notifyWorkspaceDocumentsChanged(target)
    }
  }
}

interface UseUploadQueue {
  items: UploadItem[]
  running: boolean
  addFiles: (files: File[]) => void
  removeItem: (id: string) => void
  reset: () => void
  /** Runs every non-done item through the pipeline. Resolves with a summary. */
  start: (
    target: AddTarget,
    buildDoc: BuildUploadDocument,
  ) => Promise<UploadSummary>
  cancel: () => void
}

export function useUploadQueue(initialFiles: File[] = []): UseUploadQueue {
  const [items, setItems] = useState<UploadItem[]>(() => initialFiles.map((file) => ({ id: itemKey(file), file, status: 'queued', progress: 0 })))
  const [running, setRunning] = useState(false)
  // Mirrors `items` for the async pipeline, which must read fresh state
  // between awaits without re-rendering per read.
  const itemsRef = useRef<UploadItem[]>(items)
  const targetRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const setAll = useCallback((next: UploadItem[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    const next = itemsRef.current.map((it) => (it.id === id ? { ...it, ...changes } : it))
    itemsRef.current = next
    setItems(next)
  }, [])

  const addFiles = useCallback((files: File[]) => {
    const existing = new Set(itemsRef.current.map((it) => it.id))
    const added = files
      .filter((f) => !existing.has(itemKey(f)))
      .map<UploadItem>((f) => ({ id: itemKey(f), file: f, status: 'queued', progress: 0 }))
    if (added.length) setAll([...itemsRef.current, ...added])
  }, [setAll])

  const removeItem = useCallback((id: string) => {
    setAll(itemsRef.current.filter((it) => it.id !== id))
  }, [setAll])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setAll([])
    setRunning(false)
  }, [setAll])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const start = useCallback(async (
    target: AddTarget,
    buildDoc: BuildUploadDocument,
  ): Promise<UploadSummary> => {
    if (!target) throw new Error('No active workspace or context to add to')
    const { workspaceName, treeName, path } = await resolveUploadWorkspace(target)
    const backend = treeName === 'backends' ? await resolveBackendUpload(workspaceName, path) : null

    const targetKey = JSON.stringify([workspaceName, treeName, path])
    if (targetRef.current !== null && targetRef.current !== targetKey) {
      setAll(itemsRef.current.map(({ id, file }) => ({ id, file, status: 'queued', progress: 0 })))
    }
    targetRef.current = targetKey

    const abort = new AbortController()
    abortRef.current = abort
    setRunning(true)
    try {
      await runUploadPipeline({ target, destination: { workspaceName, backend }, items: () => itemsRef.current, patch, buildDoc, signal: abort.signal })
    } finally {
      setRunning(false)
      if (abortRef.current === abort) abortRef.current = null
    }

    return summarizeUpload(itemsRef.current)
  }, [patch, setAll])

  return { items, running, addFiles, removeItem, reset, start, cancel }
}

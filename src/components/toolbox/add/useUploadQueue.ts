import { useCallback, useRef, useState } from 'react'
import { sha256File } from '@/lib/sha256'
import {
  checkWorkspaceBlobs,
  uploadWorkspaceBlobWithProgress,
  type BlobUploadResult,
} from '@/services/blobs'
import { submitDocuments, notifyWorkspaceDocumentsChanged, resolveUploadWorkspace, type AddTarget } from './useAddTarget'

// Per-file upload pipeline with resume semantics:
//   hash locally → batch-ask the server which checksums it already holds →
//   skip the byte transfer for those (content-addressed store) → upload the
//   rest with real progress → insert each File document as its blob lands.
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
}

const UPLOAD_CONCURRENCY = 3

export function itemKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
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
    buildDoc: (blob: BlobUploadResult, file: File) => Record<string, unknown>,
  ) => Promise<UploadSummary>
  cancel: () => void
}

export function useUploadQueue(): UseUploadQueue {
  const [items, setItems] = useState<UploadItem[]>([])
  const [running, setRunning] = useState(false)
  // Mirrors `items` for the async pipeline, which must read fresh state
  // between awaits without re-rendering per read.
  const itemsRef = useRef<UploadItem[]>([])
  const abortRef = useRef<AbortController | null>(null)

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
    buildDoc: (blob: BlobUploadResult, file: File) => Record<string, unknown>,
  ): Promise<UploadSummary> => {
    if (!target) throw new Error('No active workspace or context to add to')
    const { workspaceName } = await resolveUploadWorkspace(target)

    const abort = new AbortController()
    abortRef.current = abort
    setRunning(true)

    const pending = itemsRef.current.filter((it) => it.status !== 'done')
    // Fresh run over previously failed items: clear stale error state.
    for (const it of pending) patch(it.id, { status: 'queued', progress: 0, error: undefined })

    try {
      // 1. Hash everything locally (sequential — it's disk/CPU bound and fast
      // relative to upload; progress shows on big files).
      const checksums = new Map<string, string>()
      for (const it of pending) {
        if (abort.signal.aborted) throw new DOMException('cancelled', 'AbortError')
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
      const queue = pending.filter((it) => checksums.has(it.id))
      let cursor = 0
      const worker = async () => {
        while (cursor < queue.length) {
          if (abort.signal.aborted) return
          const it = queue[cursor++]
          const checksum = checksums.get(it.id)!
          try {
            let blob = existing[checksum] ?? null
            if (blob) {
              patch(it.id, { status: 'linking', progress: 1, resumed: true })
            } else {
              patch(it.id, { status: 'uploading', progress: 0 })
              blob = await uploadWorkspaceBlobWithProgress(workspaceName, it.file, {
                signal: abort.signal,
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
    } finally {
      setRunning(false)
      if (abortRef.current === abort) abortRef.current = null
      // One list reload for the whole batch, however far it got.
      if (itemsRef.current.some((it) => it.status === 'done')) {
        notifyWorkspaceDocumentsChanged(target)
      }
    }

    const finals = itemsRef.current
    return {
      done: finals.filter((it) => it.status === 'done').length,
      resumed: finals.filter((it) => it.status === 'done' && it.resumed).length,
      failed: finals.filter((it) => it.status === 'error').length,
      total: finals.length,
    }
  }, [patch])

  return { items, running, addFiles, removeItem, reset, start, cancel }
}

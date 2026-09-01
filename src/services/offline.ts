import { API_ROUTES } from '@/config/api'
import { getWorkspaceDocuments, fetchDocumentBlob, fetchDocumentThumbnail } from './workspace'
import {
  getOfflineSettings,
  getPinScope,
  savePinScope,
  setPinned,
  unpinExcept,
  pinScopeId,
  type PinScope,
} from '@/lib/offline'

// Warm (or re-warm) a pin scope: a workspace, or a subtree of its context
// tree. The scope is resolved FRESH on every warm — contexts are movable and
// tree paths are ad-hoc by design, so the durable pin identity is
// workspace(+path), never a context id or a frozen URL list. Documents that
// left the subtree since the last warm are un-pinned via the URL-set diff
// (unless another scope still claims them); newly linked ones get warmed and
// pinned. Re-warming an unchanged scope is cheap: every content URL is
// immutable, so the fetches below are cache hits.
//
// Path semantics ride on the server's context selector: a path is the AND of
// its layers, so `context=/notes` matches the whole /notes subtree.

const WARM_CONCURRENCY = 3
const FILE_SCHEMA = 'data/schema/file'
// List rows request size=128 (document-list.tsx); larger grid sizes fall back
// to the full bytes offline via blobFallback.
const THUMB_SIZE = 128

export interface PinProgress {
  done: number
  total: number
  bytes: number
}

export async function warmPinScope(
  workspaceRef: string,
  path: string,
  onProgress?: (p: PinProgress) => void,
): Promise<PinScope> {
  const settings = await getOfflineSettings()
  if (!settings.enabled) throw new Error('Enable the offline cache first')
  if (settings.excludedWorkspaces.includes(workspaceRef)) {
    throw new Error(`Workspace "${workspaceRef}" is excluded from offline caching`)
  }

  const id = pinScopeId(workspaceRef, path)
  const normalizedPath = id.slice(workspaceRef.length + 1)
  const previous = await getPinScope(id)

  // The listing itself rides through the SW's network-first API cache, so the
  // workspace view for this path renders offline as a side effect.
  const envelope = await getWorkspaceDocuments(workspaceRef, normalizedPath, [], { limit: 10000 })
  const docs = envelope.payload ?? []
  const fileDocs = docs.filter((d) => d.schema === FILE_SCHEMA)

  const urls: string[] = []
  let bytes = 0
  let done = 0
  let truncated = false
  const total = fileDocs.length
  onProgress?.({ done, total, bytes })

  let cursor = 0
  const worker = async () => {
    while (cursor < fileDocs.length) {
      const doc = fileDocs[cursor++]
      // Pinned bytes are LRU-exempt, so never warm past the budget — a pin
      // larger than the budget would otherwise evict everything else and
      // then blow the origin quota anyway.
      if (bytes >= settings.budgetBytes * 0.9) { truncated = true; return }
      try {
        const { blob } = await fetchDocumentBlob(workspaceRef, doc.id)
        bytes += blob.size
        urls.push(`${API_ROUTES.workspaces}/${workspaceRef}/documents/${doc.id}/content`)
        try {
          await fetchDocumentThumbnail(workspaceRef, doc.id, THUMB_SIZE)
          urls.push(`${API_ROUTES.workspaces}/${workspaceRef}/documents/${doc.id}/thumbnail?size=${THUMB_SIZE}`)
        } catch { /* not thumbnailable */ }
      } catch { /* unreadable doc — skip, don't kill the warm */ }
      done += 1
      onProgress?.({ done, total, bytes })
    }
  }
  await Promise.all(Array.from({ length: Math.min(WARM_CONCURRENCY, fileDocs.length) }, worker))

  await setPinned(urls, true)
  const scope: PinScope = {
    id,
    workspaceRef,
    path: normalizedPath,
    urls,
    bytes,
    warmedAt: Date.now(),
    ...(truncated ? { truncated: true } : {}),
  }
  await savePinScope(scope)

  // Reconcile: URLs from the previous warm that this resolution no longer
  // contains have left the subtree — release them to the LRU (unless another
  // scope still claims them). Saved first so unpinExcept sees the new list.
  if (previous) {
    const current = new Set(urls)
    const departed = previous.urls.filter((u) => !current.has(u))
    if (departed.length) await unpinExcept(departed)
  }

  return scope
}

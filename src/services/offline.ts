import { API_ROUTES } from '@/config/api'
import { getContext, getContextDocuments, getContextTree } from './context'
import { fetchDocumentBlob, fetchDocumentThumbnail } from './workspace'
import {
  getOfflineSettings,
  saveContextPin,
  setPinned,
  type ContextPin,
} from '@/lib/offline'

// Pin a context for offline: warm every file-backed document's bytes (plus the
// small list-row thumbnail) through the normal fetch paths, so the service
// worker caches them, then flag the URLs as pinned (exempt from LRU).
//
// The context's own JSON (getContext, tree, document list) rides through the
// SW's network-first API cache as a side effect of the calls below, so the
// context page renders offline too. Fetches here use the same
// `workspaceName || workspaceId` ref the context page hands its renderers —
// the cache is URL-keyed, so the warm URL must be the view URL.

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

export async function pinContextForOffline(
  contextId: string,
  onProgress?: (p: PinProgress) => void,
): Promise<ContextPin> {
  const settings = await getOfflineSettings()
  if (!settings.enabled) throw new Error('Enable the offline cache first')

  const ctx = await getContext(contextId)
  const wsRef = ctx.workspaceName || ctx.workspaceId
  if (!wsRef) throw new Error('Context has no bound workspace')

  // Warm the tree alongside the list (both are what the page opens with).
  await getContextTree(contextId).catch(() => {})
  const docs = await getContextDocuments(contextId, [], [], { limit: 10000 })
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
        const { blob } = await fetchDocumentBlob(wsRef, doc.id)
        bytes += blob.size
        urls.push(`${API_ROUTES.workspaces}/${wsRef}/documents/${doc.id}/content`)
        try {
          await fetchDocumentThumbnail(wsRef, doc.id, THUMB_SIZE)
          urls.push(`${API_ROUTES.workspaces}/${wsRef}/documents/${doc.id}/thumbnail?size=${THUMB_SIZE}`)
        } catch { /* not thumbnailable */ }
      } catch { /* unreadable doc — skip, don't kill the pin */ }
      done += 1
      onProgress?.({ done, total, bytes })
    }
  }
  await Promise.all(Array.from({ length: Math.min(WARM_CONCURRENCY, fileDocs.length) }, worker))

  await setPinned(urls, true)
  const pin: ContextPin = {
    contextId,
    label: ctx.url || ctx.id,
    urls,
    bytes,
    pinnedAt: Date.now(),
    ...(truncated ? { truncated: true } : {}),
  }
  await saveContextPin(pin)
  return pin
}

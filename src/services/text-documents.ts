import { uploadWorkspaceBlob, writeBackendObject } from '@/services/blobs'
import { updateWorkspaceDocument } from '@/services/workspace'
import { getLocationFilename } from '@/lib/document-display'
import { documentBodyKind } from '@/lib/text-document'
import type { Document } from '@/types/workspace'

/** The managed blob store; everything else under `stored://` is a real file backend. */
const BLOB_BACKEND = 'workspace:data'

/**
 * Where the bytes of a file document really live, when that is a file backend
 * (`stored://workspace:home/<path>`): the backend and the key inside it. Null
 * for blob-store documents and for anything without a `stored://` location.
 */
export function fileBackendTarget(doc: Document): { backend: string; key: string } | null {
  for (const location of doc.locations || []) {
    const m = /^stored:\/\/([^/]+)\/(.+)$/.exec(String(location?.url || ''))
    if (!m || m[1] === BLOB_BACKEND) continue
    return { backend: m[1], key: m[2] }
  }
  return null
}

/**
 * Save edited body text back to a file document.
 *
 * A file that lives on a file backend (the workspace home folder, indexed by
 * its watcher and mirrored by canvas-fuse) is edited IN PLACE through the
 * backend's objects route: the bytes on disk change, the watcher re-indexes
 * the same document, every mirror and WebDAV client sees the edit. Uploading
 * to the blob store instead would leave the real file untouched and re-point
 * the document at a copy in `workspace:data` — the watcher then brings the
 * stale file back as a second document.
 *
 * A blob-store document stays content-addressed: upload the new bytes, then
 * point the document at them — new checksum (which is also the cache identity
 * every preview/thumbnail consumer keys on), new location, refreshed size.
 * Mirrors what the sketch editor does for drawings; `data` is deliberately
 * untouched, since a file's data belongs to whatever ingested it.
 */
export async function saveTextFileContent(
  workspaceId: string,
  doc: Document,
  content: string,
  extra: { comment?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  const filename = getLocationFilename(doc) || `document-${doc.id}.txt`
  const contentType = String(doc.metadata?.contentType ?? '')
    || (documentBodyKind(doc) === 'markdown' ? 'text/markdown' : 'text/plain')
  // Text files end with a newline; the markdown serializer drops it, which
  // would show up as a spurious "\ No newline at end of file" on every save.
  const body = content.endsWith('\n') ? content : `${content}\n`
  const blob = new Blob([body], { type: contentType })

  const target = fileBackendTarget(doc)
  if (target) {
    const current = String(doc.checksumArray?.[0] ?? '').replace(/^sha256\//, '')
    const written = await writeBackendObject(
      workspaceId,
      { driver: 'file', address: target.backend, key: target.key },
      blob,
      { ifMatch: current || undefined, contentType },
    )
    // Checksum, size and location follow from the file itself; only the
    // universal fields the form may have changed are ours to send.
    const hasExtra = extra.comment !== undefined || extra.metadata !== undefined
    if (hasExtra) {
      await updateWorkspaceDocument(workspaceId, {
        id: written.docId ?? doc.id,
        schema: doc.schema,
        schemaVersion: doc.schemaVersion,
        ...(extra.comment !== undefined ? { comment: extra.comment } : {}),
        ...(extra.metadata !== undefined ? { metadata: extra.metadata } : {}),
      })
    }
    return
  }

  const uploaded = await uploadWorkspaceBlob(workspaceId, blob)

  await updateWorkspaceDocument(workspaceId, {
    id: doc.id,
    schema: doc.schema,
    schemaVersion: doc.schemaVersion,
    ...(extra.comment !== undefined ? { comment: extra.comment } : {}),
    checksumArray: [`sha256/${uploaded.checksum}`],
    locations: [{ url: uploaded.url, metadata: { filename } }],
    // metadata is a shallow merge server-side: size/contentType move, the rest
    // (features, geo, extracted image meta) stays.
    metadata: { contentType, size: uploaded.size, ...(extra.metadata ?? {}) },
  })
}

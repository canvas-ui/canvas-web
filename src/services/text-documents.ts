import { uploadWorkspaceBlob } from '@/services/blobs'
import { updateWorkspaceDocument } from '@/services/workspace'
import { getLocationFilename } from '@/lib/document-display'
import { documentBodyKind } from '@/lib/text-document'
import type { Document } from '@/types/workspace'

/**
 * Save edited body text back to a blob-backed file document.
 *
 * Content-addressed store, so an edit is: upload the new bytes, then point the
 * document at them — new checksum (which is also the cache identity every
 * preview/thumbnail consumer keys on), new location, refreshed size. Mirrors
 * what the sketch editor does for drawings; `data` is deliberately untouched,
 * since a file's data belongs to whatever ingested it.
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

import { DRAWING_SCHEMA } from '@/components/renderers/types'
import type { BlobUploadResult } from '@/services/blobs'

export const DRAWING_SCHEMA_VERSION = '1.0'

// The Drawing document every sketch save produces. `sceneJson` (the canonical
// Excalidraw serialization) is the SOURCE OF TRUTH and re-opens the editor;
// the exported PNG in `locations` is what every blob consumer (thumbnails,
// cards, WebDAV/FUSE, offline warming) sees — a Drawing renders like a File.
// Identity is the checksum of the serialized scene: same sketch content =
// same document, and every edit moves the checksum (which also versions
// cached previews — see useDocumentThumbnail's `version`).
export function buildDrawingDocument(
  sceneJson: string,
  sceneChecksum: string,
  preview: BlobUploadResult,
  opts: { title?: string } = {},
): Record<string, unknown> {
  const title = opts.title?.trim()
  const filename = `${(title || 'sketch').replace(/[/\\:*?"<>|]/g, '_')}.png`
  return {
    schema: DRAWING_SCHEMA,
    schemaVersion: DRAWING_SCHEMA_VERSION,
    data: {
      ...(title ? { title } : {}),
      scene: sceneJson,
    },
    checksumArray: [`sha256/${sceneChecksum}`],
    locations: [{ url: preview.url, metadata: { filename } }],
    metadata: {
      contentType: 'image/png',
      size: preview.size,
    },
  }
}

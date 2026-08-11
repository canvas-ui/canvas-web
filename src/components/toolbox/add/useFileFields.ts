import { useState } from 'react'
import { tagsToFeatures } from './tags'
import { useTagSuggestions } from './useTagSuggestions'
import { useGeotag, type Geotag } from '@/hooks/useGeotag'
import type { BlobUploadResult } from '@/services/blobs'
import type { DocumentGeo } from '@/types/workspace'

const FILE_SCHEMA = 'data/schema/file'
const FILE_SCHEMA_VERSION = '3.0'

export interface FileFields {
  tags: string[]
  setTags: (v: string[]) => void
  comment: string
  setComment: (v: string) => void
  suggestions: string[]
  geotag: Geotag
}

/**
 * Tags + comment for the file/photo upload surfaces (toolbox FileForm, home
 * File/Photo cards), so all three build an identical document payload.
 *
 * `workspaceName` is optional because the home cards only learn their target
 * from the Save/Link-to picker, i.e. after the user has typed. Without it the
 * tag input simply degrades to freeform — suggestions are a convenience, never
 * a constraint (tags are arbitrary strings server-side either way).
 */
export function useFileFields(workspaceName?: string | null): FileFields {
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const suggestions = useTagSuggestions(workspaceName)
  const geotag = useGeotag()

  return { tags, setTags, comment, setComment, suggestions, geotag }
}

/** The File document every upload surface inserts. */
export function buildFileDocument(
  blob: BlobUploadResult,
  file: File,
  opts: { tags?: string[]; comment?: string; geo?: DocumentGeo | null } = {},
): Record<string, unknown> {
  const features = tagsToFeatures(opts.tags ?? [])
  const comment = opts.comment?.trim()
  return {
    schema: FILE_SCHEMA,
    schemaVersion: FILE_SCHEMA_VERSION,
    data: {},
    checksumArray: [`sha256/${blob.checksum}`],
    locations: [{ url: blob.url, metadata: { filename: file.name } }],
    // Top-level, not metadata (BaseDocument.comment): it's never regenerated,
    // a comment edit skips checksum recalculation, and it's FTS-indexed even for
    // files that declare no ftsSearchFields — so a photo's comment alone makes
    // it findable.
    ...(comment ? { comment } : {}),
    metadata: {
      contentType: file.type,
      size: blob.size,
      ...(features.length ? { features } : {}),
      // A photo's own EXIF fix outranks this one server-side (pickGeo: exif >
      // device), so tagging an upload from the couch never overwrites where the
      // shot was actually taken — but it does locate the scans, screenshots and
      // documents that carry no EXIF at all.
      ...(opts.geo ? { geo: opts.geo } : {}),
    },
  }
}

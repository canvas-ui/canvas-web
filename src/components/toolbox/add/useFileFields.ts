import { useEffect, useState } from 'react'
import { listWorkspaceTagSuggestions } from '@/services/workspace'
import { tagsToFeatures } from './tags'
import type { BlobUploadResult } from '@/services/blobs'

const FILE_SCHEMA = 'data/abstraction/file'
const FILE_SCHEMA_VERSION = '3.0'

export interface FileFields {
  tags: string[]
  setTags: (v: string[]) => void
  comment: string
  setComment: (v: string) => void
  suggestions: string[]
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
  // Kept keyed by workspace so `suggestions` can be DERIVED below: switching
  // target then shows nothing rather than the previous workspace's tags, with
  // no synchronous reset in the effect.
  const [loaded, setLoaded] = useState<{ workspace: string; tags: string[] } | null>(null)

  useEffect(() => {
    if (!workspaceName) return
    let cancelled = false
    // Existing `tag/*` bitmaps in the target workspace. Best-effort: a failure
    // here just means no autocomplete.
    listWorkspaceTagSuggestions(workspaceName)
      .then((s) => { if (!cancelled) setLoaded({ workspace: workspaceName, tags: s }) })
      .catch(() => { /* freeform */ })
    return () => { cancelled = true }
  }, [workspaceName])

  const suggestions = loaded && loaded.workspace === workspaceName ? loaded.tags : []

  return { tags, setTags, comment, setComment, suggestions }
}

/** The File document every upload surface inserts. */
export function buildFileDocument(
  blob: BlobUploadResult,
  file: File,
  opts: { tags?: string[]; comment?: string } = {},
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
    },
  }
}

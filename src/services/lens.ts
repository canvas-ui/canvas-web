import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'
import type { ResponseEnvelope } from '@augmentd-labs/canvas-protocol'
import type { Document } from '@/types/workspace'

/**
 * Search-by-image ("lens") — POST /workspaces/:ref/documents/search/image.
 *
 * The query image is EPHEMERAL: embedded via inferd, never stored or indexed.
 * With `q` set the server switches to fused mode (image vector leg RRF-merged
 * with the full text pipeline), so notes surface next to photos. `similarTo`
 * reuses an indexed document's stored vector — no bytes on the wire.
 */
export interface LensSearchOptions {
  /** Optional text → fused mode (notes + photos in one ranked page). */
  q?: string
  /** "More like this document" — mutually exclusive with an image frame. */
  similarTo?: number
  limit?: number
  /** Cosine-distance relevance floor (0 = identical). Absent = top-K. */
  maxDistance?: number
  minDistance?: number
  /** Attach per-hit cosine distances (floor calibration). */
  debug?: boolean
  /** Return matching ids only (skips document hydration server-side). */
  idsOnly?: boolean
  contextPath?: string | null
  signal?: AbortSignal
}

export interface LensDistance {
  id: number
  distance: number
}

export interface LensSearchResult {
  documents: Document[]
  /** Populated instead of documents when idsOnly was requested. */
  ids: number[]
  count: number
  totalCount: number
  distances: LensDistance[] | null
}

// Envelope variant: this read needs count/totalCount (pagination) and the
// `debug` distances, none of which the payload carries.
type LensPayload = Document[] | number[]
type LensEnvelope = ResponseEnvelope<LensPayload | undefined> & {
  debug?: {
    distances?: LensDistance[]
    imageDistances?: LensDistance[]
  }
}

export async function searchByImage(
  workspaceRef: string,
  imageDataUri: string | null,
  opts: LensSearchOptions = {},
): Promise<LensSearchResult> {
  const body: Record<string, unknown> = {
    limit: opts.limit ?? 12,
    // A bound path scopes the candidate set (pre-filtered before the kNN);
    // otherwise whole-workspace — photos usually live in backend mirrors, not
    // under the current context path.
    scope: opts.contextPath ? ('path' as const) : ('workspace' as const),
  }
  if (imageDataUri) body.image = imageDataUri
  if (opts.similarTo) body.similarTo = opts.similarTo
  const text = opts.q?.trim()
  if (text) body.q = text
  if (opts.maxDistance != null && Number.isFinite(opts.maxDistance)) body.maxDistance = opts.maxDistance
  if (opts.minDistance != null && Number.isFinite(opts.minDistance)) body.minDistance = opts.minDistance
  if (opts.debug) body.debug = true
  if (opts.idsOnly) body.idsOnly = true
  if (opts.contextPath) body.context = opts.contextPath

  const res = await api.postEnvelope<LensPayload | undefined>(
    `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceRef)}/documents/search/image`,
    body,
    opts.signal ? { signal: opts.signal } : undefined,
  ) as LensEnvelope
  const payload = res.payload ?? []
  const idsOnly = opts.idsOnly === true
  return {
    documents: idsOnly ? [] : (payload as Document[]),
    ids: idsOnly ? (payload as number[]) : (payload as Document[]).map((d) => d.id),
    count: res.count ?? payload.length,
    totalCount: res.totalCount ?? payload.length,
    distances: res.debug?.distances ?? res.debug?.imageDistances ?? null,
  }
}

import { events } from '@augmentd-labs/canvas-protocol'
import socketService from '@/lib/socket'
import type { Document } from '@/types/workspace'

/**
 * Query sessions — a long-running, refinable query living on the server.
 *
 * A session is an ordered map of labelled cues; each cue is resolved to a
 * bitmap once and the result is their hard-AND. Refining is a re-AND, dropping
 * a cue is free, and a write that touches a cue's keys pushes a `session.delta`
 * ({added, removed, count}) instead of the client re-running the whole query.
 *
 * That is the difference between a live view and snapshot-refetch: the lens
 * feed replaces its id-set every frame via `set()`, and the UI only ever
 * hydrates documents it has not seen.
 *
 * Sessions are CONNECTION-scoped: the server closes them on disconnect, so a
 * reconnect must open a fresh one (see useQuerySession).
 */

/** A cue spec in workspace query terms — the same vocabulary GET /documents takes. */
export interface SessionSpec {
  context?: string | null
  directory?: string | null
  features?: string[] | { allOf?: string[]; anyOf?: string[]; noneOf?: string[] }
  filters?: string[]
  /** Literal id-set operand — the external-producer seam (lens/kNN survivors). */
  ids?: number[]
  [key: string]: unknown
}

export interface SessionOpts {
  /** 'live' (default over this transport) slides relative windows; 'frozen' pins them. */
  mode?: 'frozen' | 'live'
  emit?: 'delta' | 'ids' | 'page'
  debounceMs?: number
  limit?: number
  offset?: number
}

export interface SessionState {
  /** Current survivor ids, or null when the session is unconstrained (all documents). */
  ids: number[] | null
  count: number
}

export interface OpenSessionResult extends SessionState {
  sessionId: string
  workspaceId: string
}

/** Server → client push. `added`/`removed` are present in the default emit mode. */
export interface SessionDelta {
  sessionId: string
  workspaceId?: string
  added?: number[]
  removed?: number[]
  ids?: number[] | null
  count: number | null
}

export function openSession(
  workspace: string,
  specs: Array<{ label: string; spec: SessionSpec }> | SessionSpec[],
  opts: SessionOpts = {},
): Promise<OpenSessionResult> {
  return socketService.request<OpenSessionResult>(events.EMIT_SESSION_OPEN, { workspace, specs, opts })
}

/**
 * REPLACE a cue (upsert). The streaming verb: a producer re-emitting a full cue
 * every tick must use this — patch() concatenates array buckets by design, so a
 * per-frame id-set would accumulate every id the feed ever saw.
 */
export function setSessionCue(sessionId: string, label: string, spec: SessionSpec): Promise<SessionState & { label: string }> {
  return socketService.request(events.EMIT_SESSION_SET, { sessionId, label, spec })
}

/** Merge into a cue's buckets — the interactive-refinement verb ("car" → +"red"). */
export function patchSessionCue(sessionId: string, label: string, spec: SessionSpec): Promise<SessionState & { label: string }> {
  return socketService.request(events.EMIT_SESSION_PATCH, { sessionId, label, spec })
}

export function removeSessionCue(sessionId: string, label: string): Promise<SessionState & { label: string }> {
  return socketService.request(events.EMIT_SESSION_REMOVE, { sessionId, label })
}

/**
 * Re-read the current survivor set. Cheap (bitmap only, no document load) and
 * the resync path for anything a delta cannot cover: a cue over a tree path
 * that did not exist when it was resolved has no bitmap key to invalidate, so
 * documents arriving there push no delta.
 */
export function getSessionIds(sessionId: string): Promise<SessionState> {
  return socketService.request<SessionState>(events.EMIT_SESSION_IDS, { sessionId })
}

/**
 * A ranking match — the SECOND stage of a session read.
 *
 * Cues (above) build the candidate set with bitmap algebra: the path, a
 * `geo:near` fix, the camera frame's kNN survivors. This ranks INSIDE that set.
 * Text and image fuse when both are given (the image becomes a vector leg
 * RRF-merged with the full text pipeline), so "broken door" surfaces the
 * summarized note about the entrance next to the photos the frame matched.
 */
export interface SessionMatch {
  text?: string
  /** EPHEMERAL query image — base64 or a data: URI. Embedded, never stored. */
  image?: string
  contentType?: string
  /** "More like this document" — reuses an indexed doc's stored image vector. */
  similarTo?: number
  minDistance?: number
  maxDistance?: number
}

export interface MaterializeResult {
  documents: Document[]
  ids: number[]
  count: number
  totalCount: number
}

/**
 * Rank + hydrate one page of the candidate set. Without `match` this is a plain
 * bitmap slice (no embedding, no FTS) — the cheap path.
 *
 * To NARROW by relevance instead of merely ordering by it, feed the returned
 * ids back as a cue: `setSessionCue(id, 'text', { ids })`. Same id-set seam the
 * lens uses, and the one canvas-inferd will drive server-side.
 */
export function materializeSession(
  sessionId: string,
  opts: { match?: SessionMatch | string; limit?: number; offset?: number; mode?: 'fts' | 'vector' | 'hybrid' } = {},
): Promise<MaterializeResult> {
  return socketService.request<MaterializeResult>(events.EMIT_SESSION_MATERIALIZE, { sessionId, ...opts })
}

export function closeSession(sessionId: string): Promise<{ sessionId: string; closed: boolean }> {
  return socketService.request(events.EMIT_SESSION_CLOSE, { sessionId })
}

export function onSessionDelta(handler: (delta: SessionDelta) => void): () => void {
  return socketService.on(events.SESSION_DELTA, handler as (...args: unknown[]) => void)
}

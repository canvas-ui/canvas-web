import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import socketService from '@/lib/socket'
import {
  closeSession,
  getSessionIds,
  materializeSession,
  onSessionDelta,
  openSession,
  setSessionCue,
  type SessionDelta,
  type SessionMatch,
  type SessionOpts,
  type SessionSpec,
} from '@/services/session'
import { getWorkspaceDocuments } from '@/services/workspace'
import type { Document } from '@/types/workspace'

/**
 * A server-side query session, rendered incrementally.
 *
 * The problem this solves: a live view (a camera feed narrowing the list, a
 * standing "everything about project-foo") used to re-run a stateless
 * `GET /documents` per tick and swap the whole array — every card remounted,
 * the list blinked, and the same documents were fetched over and over.
 *
 * Here the server holds the candidate set and pushes `{added, removed, count}`.
 * We keep `Map<id, Document>` plus an ordered id list, fetch ONLY the added
 * ids, and drop the removed ones. Stable ids mean React reconciles instead of
 * remounting, and order is insertion-stable on purpose: a live feed must not
 * reshuffle the grid under the user's cursor every frame.
 *
 * `specs` are the STRUCTURAL cues (path, features, filters) — changing them
 * reopens the session. A streaming cue (the lens id-set) goes through
 * `setCue()` instead, which replaces that one cue in place and costs a re-AND.
 */

/** Documents are hydrated in batches; the URL carries one ?ids= per document. */
const HYDRATE_CHUNK = 100

export interface UseQuerySessionOptions {
  /** Workspace name or id. Absent/enabled=false → the hook stays idle. */
  workspaceRef: string | null | undefined
  /** Structural cues. Changing their content reopens the session. */
  specs: Array<{ label: string; spec: SessionSpec }>
  opts?: SessionOpts
  enabled?: boolean
}

export interface UseQuerySessionResult {
  documents: Document[]
  /** Survivor count from the server bitmap — may exceed `documents.length` mid-hydration. */
  count: number
  /** True once the session is open; false while idle, connecting, or failed. */
  ready: boolean
  error: string | null
  /** Replace one cue's spec (the streaming verb — see services/session). */
  setCue: (label: string, spec: SessionSpec) => Promise<void>
  /** Re-read the survivor set and reconcile — the fallback for missed deltas. */
  resync: () => Promise<void>
  /**
   * Rank the candidate set by text and/or an image and REPLACE the rendered
   * list with that page. Ranking is a read, not a cue: it does not change what
   * the session matches, so clearing the match (`rank(null)`) returns to the
   * delta-driven view without reopening anything.
   *
   * THIS is the live-feed verb. The match sticks: every later delta re-ranks
   * against the NEW candidate set, so typing "broken door" while a camera
   * drives a cue keeps working as the camera moves. `mode: 'fts'` narrows
   * strictly (only lexical matches survive — a document whose comment says
   * "broken door" resurfaces); 'hybrid' also admits semantic neighbours.
   */
  rank: (match: SessionMatch | string | null, opts?: { limit?: number; offset?: number; mode?: 'fts' | 'vector' | 'hybrid' }) => Promise<void>
  /**
   * Freeze a relevance ranking into a membership cue: rank once, pin the
   * survivors as an id-set. Returns the pinned ids.
   *
   * ONLY for a candidate set that is standing still — conversational
   * drill-down ("car" → +"red" → +"near the market"), where each step should
   * stay put while you refine the next. Do NOT use it under a live feed: the
   * pin is a snapshot of one materialize, so when the camera moves, documents
   * that would match the text in the NEW candidate set stay excluded by the
   * stale pin. Use rank() there — it re-ranks per delta by design.
   */
  rankAndPin: (label: string, match: SessionMatch | string, opts?: { limit?: number; mode?: 'fts' | 'vector' | 'hybrid' }) => Promise<number[]>
}

export function useQuerySession({
  workspaceRef,
  specs,
  opts,
  enabled = true,
}: UseQuerySessionOptions): UseQuerySessionResult {
  const [documents, setDocuments] = useState<Document[]>([])
  const [count, setCount] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Ordered id list + the doc cache behind it. Refs, not state: a delta must
  // mutate them and paint ONE new array, not cascade through several renders.
  const orderRef = useRef<number[]>([])
  const docsRef = useRef<Map<number, Document>>(new Map())
  const sessionIdRef = useRef<string | null>(null)
  const workspaceRefRef = useRef<string | null>(null)
  // The match currently pinning the list to a ranked page (null = delta-driven),
  // and a late-bound handle to rank() so the delta listener can re-rank without
  // depending on a callback declared below it.
  const matchRef = useRef<SessionMatch | string | null>(null)
  const matchOptsRef = useRef<{ limit?: number; offset?: number; mode?: 'fts' | 'vector' | 'hybrid' }>({})
  const rankRef = useRef<((match: SessionMatch | string | null, opts?: { limit?: number; offset?: number; mode?: 'fts' | 'vector' | 'hybrid' }) => Promise<void>) | null>(null)

  const specsKey = useMemo(() => JSON.stringify(specs), [specs])
  const optsKey = useMemo(() => JSON.stringify(opts ?? {}), [opts])

  const paint = useCallback(() => {
    const cache = docsRef.current
    setDocuments(orderRef.current.map((id) => cache.get(id)).filter(Boolean) as Document[])
  }, [])

  // Fetch documents by id, whole-workspace scoped: the session already applied
  // every scope constraint, so re-applying the current path here would drop
  // survivors that live outside it.
  const hydrate = useCallback(async (ids: number[]): Promise<Document[]> => {
    const ref = workspaceRefRef.current
    if (!ref || ids.length === 0) { return [] }
    const out: Document[] = []
    for (let i = 0; i < ids.length; i += HYDRATE_CHUNK) {
      const chunk = ids.slice(i, i + HYDRATE_CHUNK)
      const response = await getWorkspaceDocuments(ref, '/', [], {
        ids: chunk,
        scope: 'workspace',
        limit: chunk.length,
      })
      out.push(...((response.payload as Document[]) || []))
    }
    return out
  }, [])

  // Apply a delta: append what is new (insertion-stable), drop what left, and
  // fetch ONLY ids we do not already hold.
  const applyDelta = useCallback(async (added: number[], removed: number[], nextCount: number | null) => {
    if (removed.length > 0) {
      const gone = new Set(removed)
      orderRef.current = orderRef.current.filter((id) => !gone.has(id))
      for (const id of gone) { docsRef.current.delete(id) }
    }

    const missing = added.filter((id) => !docsRef.current.has(id))
    const known = new Set(orderRef.current)
    for (const id of added) {
      if (!known.has(id)) { orderRef.current.push(id); known.add(id) }
    }
    if (nextCount !== null) { setCount(nextCount) }

    // Paint the removals immediately; the fetch only ever ADDS, so the list
    // never shows a stale document while new ones are in flight.
    paint()
    if (missing.length === 0) { return }

    const fetched = await hydrate(missing)
    for (const doc of fetched) { docsRef.current.set(doc.id, doc) }
    // Ids the server counted but the fetch did not return (deleted between the
    // delta and the hydrate) would otherwise sit in the order list forever.
    const returned = new Set(fetched.map((d) => d.id))
    const unresolved = missing.filter((id) => !returned.has(id))
    if (unresolved.length > 0) {
      const drop = new Set(unresolved)
      orderRef.current = orderRef.current.filter((id) => !drop.has(id))
    }
    paint()
  }, [hydrate, paint])

  // Reconcile against an authoritative id list (session open, resync).
  const applyIds = useCallback(async (ids: number[] | null, nextCount: number | null) => {
    const next = ids ?? []
    const wanted = new Set(next)
    orderRef.current = orderRef.current.filter((id) => wanted.has(id))
    for (const id of docsRef.current.keys()) {
      if (!wanted.has(id)) { docsRef.current.delete(id) }
    }
    const known = new Set(orderRef.current)
    const added = next.filter((id) => !known.has(id))
    await applyDelta(added, [], nextCount)
  }, [applyDelta])

  // ── Open / close ───────────────────────────────────────────────────────────
  useEffect(() => {
    workspaceRefRef.current = workspaceRef ?? null
    // Idle: nothing to open, and nothing to reset either — the previous run's
    // cleanup already cleared the session and its painted documents.
    if (!enabled || !workspaceRef) { return }

    let cancelled = false
    let opened: string | null = null

    const open = async () => {
      try {
        const result = await openSession(workspaceRef, JSON.parse(specsKey), JSON.parse(optsKey))
        if (cancelled) {
          // Unmounted (or re-keyed) mid-open — do not leak the server session.
          void closeSession(result.sessionId).catch(() => {})
          return
        }
        opened = result.sessionId
        sessionIdRef.current = result.sessionId
        setSessionId(result.sessionId)
        setError(null)
        // Starting from scratch: previous state belongs to the previous session.
        orderRef.current = []
        docsRef.current = new Map()
        await applyIds(result.ids, result.count)
      } catch (err) {
        if (cancelled) { return }
        // Sessions are an optimization, never a requirement — the caller keeps
        // its stateless fetch path and simply does not get incremental updates.
        setError(err instanceof Error ? err.message : 'Failed to open query session')
        setSessionId(null)
        sessionIdRef.current = null
      }
    }

    void open()
    // Sessions die with the connection: a reconnect needs a brand new one.
    const offConnect = socketService.on('connect', () => { void open() })

    return () => {
      cancelled = true
      offConnect?.()
      const id = opened ?? sessionIdRef.current
      if (id) { void closeSession(id).catch(() => {}) }
      sessionIdRef.current = null
      orderRef.current = []
      docsRef.current = new Map()
      setSessionId(null)
      setDocuments([])
      setCount(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRef, specsKey, optsKey, enabled])

  // ── Deltas ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) { return }
    const off = onSessionDelta((delta: SessionDelta) => {
      if (delta.sessionId !== sessionId) { return }
      // With a match active the user is looking at a RANKED page; appending
      // arrivals in insertion order would quietly break that order, so the page
      // is re-ranked instead. (Ranking is a read — it emits no delta of its own.)
      if (matchRef.current !== null) { void rankRef.current?.(matchRef.current, matchOptsRef.current); return }
      if (delta.ids !== undefined) {
        void applyIds(delta.ids, delta.count)
      } else {
        void applyDelta(delta.added ?? [], delta.removed ?? [], delta.count)
      }
    })
    return () => { off?.() }
  }, [sessionId, applyDelta, applyIds])

  const resync = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id) { return }
    try {
      const state = await getSessionIds(id)
      await applyIds(state.ids, state.count)
    } catch {
      // A resync failing is not fatal — the next delta still lands.
    }
  }, [applyIds])

  const setCue = useCallback(async (label: string, spec: SessionSpec) => {
    const id = sessionIdRef.current
    if (!id) { throw new Error('No open query session') }
    const state = await setSessionCue(id, label, spec)
    // With a match active the list is a RANKED page: painting the new candidate
    // set in insertion order first would flash unranked results for one frame
    // before the re-rank landed. Go straight to the re-rank.
    if (matchRef.current !== null) {
      await rankRef.current?.(matchRef.current, matchOptsRef.current)
      return
    }
    // The ack already carries the resulting set, so a cue change never waits on
    // the round trip of its own delta. Both paths converge — applying an id
    // list and applying the matching delta leave the same state.
    await applyIds(state.ids, state.count)
  }, [applyIds])

  const rank = useCallback(async (
    match: SessionMatch | string | null,
    opts: { limit?: number; offset?: number; mode?: 'fts' | 'vector' | 'hybrid' } = {},
  ) => {
    const id = sessionIdRef.current
    if (!id) { throw new Error('No open query session') }
    matchRef.current = match
    matchOptsRef.current = opts
    if (match === null) {
      // Back to the delta-driven view, in the session's own order.
      await resync()
      return
    }
    const page = await materializeSession(id, { match, ...opts })
    for (const doc of page.documents) { docsRef.current.set(doc.id, doc) }
    orderRef.current = page.ids
    setCount(page.totalCount)
    paint()
  }, [paint, resync])

  useEffect(() => { rankRef.current = rank }, [rank])

  const rankAndPin = useCallback(async (
    label: string,
    match: SessionMatch | string,
    opts: { limit?: number; mode?: 'fts' | 'vector' | 'hybrid' } = {},
  ) => {
    const id = sessionIdRef.current
    if (!id) { throw new Error('No open query session') }
    const page = await materializeSession(id, { match, limit: opts.limit ?? 100, ...(opts.mode ? { mode: opts.mode } : {}) })
    for (const doc of page.documents) { docsRef.current.set(doc.id, doc) }
    // Pinning the survivors turns a score into a membership constraint — the
    // ids cue has no keys, so it costs nothing to re-AND on every later change.
    // It is also a SNAPSHOT: see the trap documented on the interface.
    const state = await setSessionCue(id, label, { ids: page.ids })
    await applyIds(state.ids, state.count)
    return page.ids
  }, [applyIds])

  return { documents, count, ready: sessionId !== null, error, setCue, resync, rank, rankAndPin }
}

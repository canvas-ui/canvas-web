import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

/**
 * Source information for the running server, as reported by `GET /rest/v2/ping`.
 *
 * This is the human-readable half of the AGPL section 13 source offer. Anyone
 * interacting with this server over a network is entitled to its corresponding
 * source, so the UI has to give them a route to it. A fork must repoint
 * `sourceUrl` at the repository publishing its own changes (`CANVAS_SOURCE_URL`,
 * plus `CANVAS_SOURCE_COMMIT` where the build carries no git metadata) rather
 * than remove the link.
 */
export interface ServerSource {
  sourceUrl: string
  version: string | null
  commit: string | null
  license: string | null
}

interface PingPayload {
  version?: string
  license?: string
  sourceUrl?: string
  commit?: string
}

// Upstream default, used when a server predates the /ping source fields. Better
// to point at the canonical repository than to render nothing at all.
const FALLBACK_SOURCE_URL = 'https://github.com/canvas-ui/canvas-server'

// One request per page load, shared by every consumer. The source of a running
// build cannot change underneath us, so unlike useServerVersion (which polls to
// double as a liveness check on the auth screen) this never refetches.
let cached: Promise<ServerSource> | null = null

function fetchServerSource(): Promise<ServerSource> {
  if (!cached) {
    cached = api
      .get<{ status: string; statusCode: number; payload: PingPayload }>('/ping', { skipAuth: true })
      .then((response) => {
        const payload = response?.payload ?? {}
        return {
          sourceUrl: payload.sourceUrl || FALLBACK_SOURCE_URL,
          version: payload.version ?? null,
          commit: payload.commit ?? null,
          license: payload.license ?? null,
        }
      })
      .catch((err) => {
        // A failed lookup must never hide the notice: fall back to the upstream
        // repository rather than leaving the user with no route to the source.
        console.error('Failed to fetch server source info:', err)
        cached = null
        return { sourceUrl: FALLBACK_SOURCE_URL, version: null, commit: null, license: null }
      })
  }
  return cached
}

export function useServerSource(): ServerSource | null {
  const [source, setSource] = useState<ServerSource | null>(null)

  useEffect(() => {
    let isMounted = true
    fetchServerSource().then((value) => {
      if (isMounted) setSource(value)
    })
    return () => {
      isMounted = false
    }
  }, [])

  return source
}

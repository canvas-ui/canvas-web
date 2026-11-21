// HTTP errors prove the server answered, even when its message says that a
// downstream service (e.g. inferd) could not be reached.
export function isBrowserNetworkFailure(error: { statusCode?: number; code?: string; message: string }, hasConnectionCause: boolean): boolean {
  return !error.statusCode && error.code !== 'ABORTED' && error.code !== 'TIMEOUT'
    && (hasConnectionCause || /fetch failed|failed to fetch|networkerror|load failed/i.test(error.message))
}

// A reverse proxy answering for a server it cannot reach: 502/503/504 with its
// own error page. Canvas itself answers every status with a JSON envelope, so
// a non-JSON body on these statuses means the request never got to Canvas and
// counts as the server being unreachable.
export function isGatewayFailure(response: { status: number; headers: { get(name: string): string | null } }): boolean {
  return (response.status === 502 || response.status === 503 || response.status === 504)
    && !/json/i.test(response.headers.get('content-type') || '')
}

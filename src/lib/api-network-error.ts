// HTTP errors prove the server answered, even when its message says that a
// downstream service (e.g. inferd) could not be reached.
export function isBrowserNetworkFailure(error: { statusCode?: number; code?: string; message: string }, hasConnectionCause: boolean): boolean {
  return !error.statusCode && error.code !== 'ABORTED' && error.code !== 'TIMEOUT'
    && (hasConnectionCause || /fetch failed|failed to fetch|networkerror|load failed/i.test(error.message))
}

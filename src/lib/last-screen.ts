/** Only internal, non-transient screens may be used as a launch destination. */
export function safeLastScreen(value: unknown): string | null {
  // Reject control characters before URL parsing normalizes them away.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return null
  const url = new URL(value, 'https://canvas.invalid')
  if (url.origin !== 'https://canvas.invalid') return null
  if (/^\/(?:login|register|pub|share-target|apps|next)(?:\/|$)/.test(url.pathname) || url.pathname === '/') return null
  // Never persist credentials that may have been supplied in a URL.
  if ([...url.searchParams.keys()].some(key => /token|password|secret|code/i.test(key))) return null
  return url.pathname + url.search + url.hash
}

/** Session-scoped storage without storing the token itself in the key. */
export function lastScreenKey(token: string): string {
  let hash = 2166136261
  for (const char of token) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `canvas:last-screen:${hash >>> 0}`
}

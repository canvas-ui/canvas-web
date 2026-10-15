/** Back follows the address hierarchy, never the browser's visit history. */
export function parentCanvasPath(path: string): string | null {
  const segments = path.split('/').filter(Boolean)
  if (!segments.length) return null
  segments.pop()
  return segments.length ? `/${segments.join('/')}` : '/'
}

export function readSearchQueries(search: string): string[] {
  const params = new URLSearchParams(search)
  const queries = params.getAll('q').map(q => q.trim()).filter(Boolean)
  const legacy = (params.get('search') || '').trim()
  return params.has('q') ? queries : legacy ? [legacy] : []
}

/** An empty q explicitly clears a saved query; preserve scope and binding. */
export function withSearchQueries(search: string, queries: string[]): string {
  const params = new URLSearchParams(search)
  params.delete('q')
  params.delete('search')
  const next = [...new Set(queries.map(q => q.trim()).filter(Boolean))]
  for (const query of next) params.append('q', query)
  if (!next.length) params.set('q', '')
  return `?${params.toString()}`
}

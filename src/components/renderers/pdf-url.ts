// Does a link/tab URL point at a PDF? Extension match plus well-known
// extensionless PDF paths (arxiv.org/pdf/<id>).
export function isPdfUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    if (/\.pdf$/i.test(u.pathname)) return true
    if (u.hostname.endsWith('arxiv.org') && u.pathname.startsWith('/pdf/')) return true
    return false
  } catch {
    return false
  }
}

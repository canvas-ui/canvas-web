export function isPdfUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return /\.pdf$/i.test(parsed.pathname) || (parsed.hostname.endsWith('arxiv.org') && parsed.pathname.startsWith('/pdf/'))
  } catch {
    return false
  }
}

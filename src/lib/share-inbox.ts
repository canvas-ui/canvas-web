export const SHARE_CACHE = 'share-target-inbox'
export const MAX_SHARE_BYTES = 100 * 1024 * 1024

/** Local staging only. The page chooses a destination before any upload. */
export async function stageShare(request: Request, token: string, cache: Cache): Promise<void> {
  const base = `/share-target-inbox/${token}`
  const stored: string[] = []
  const fail = async (error: string) => {
    await Promise.all(stored.map(key => cache.delete(key)))
    await cache.put(`${base}/meta`, new Response(JSON.stringify({ status: 'error', error, stashedAt: Date.now() })))
  }
  try {
    // Some browsers provide the multipart size. Refuse clearly oversized
    // bodies before materializing them, with a small allowance for headers.
    if (Number(request.headers.get('content-length')) > MAX_SHARE_BYTES + 1024 * 1024) {
      await request.body?.cancel().catch(() => {})
      await fail('too-large')
      return
    }
    const form = await request.formData()
    const files = form.getAll('files').filter((file): file is File => file instanceof File && file.size > 0)
    if (files.reduce((size, file) => size + file.size, 0) > MAX_SHARE_BYTES) {
      await fail('too-large')
      return
    }
    for (const [i, file] of files.entries()) {
      const key = `${base}/file-${i}`
      await cache.put(key, new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }))
      stored.push(key)
    }
    await cache.put(`${base}/meta`, new Response(JSON.stringify({
      status: 'ready', title: String(form.get('title') || ''), text: String(form.get('text') || ''),
      url: String(form.get('url') || ''), fileNames: files.map(file => file.name), stashedAt: Date.now(),
    })))
  } catch {
    await fail('stash-failed')
  }
}

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
    const files = form.getAll('files').filter((file): file is File => file instanceof File)
    // Do not silently turn an unreadable attachment into a text-only share.
    if (files.some(file => file.size === 0)) {
      await fail('empty-file')
      return
    }
    if (files.reduce((size, file) => size + file.size, 0) > MAX_SHARE_BYTES) {
      await fail('too-large')
      return
    }
    const textField = (name: string) => {
      const value = form.get(name)
      return typeof value === 'string' ? value : ''
    }
    const title = textField('title')
    const text = textField('text')
    const url = textField('url')
    if (!files.length && ![title, text, url].some(value => value.trim())) {
      await fail('empty-share')
      return
    }
    for (const [i, file] of files.entries()) {
      const key = `${base}/file-${i}`
      await cache.put(key, new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }))
      stored.push(key)
    }
    await cache.put(`${base}/meta`, new Response(JSON.stringify({
      status: 'ready', title, text, url, fileNames: files.map(file => file.name), stashedAt: Date.now(),
    })))
  } catch {
    await fail('stash-failed')
  }
}

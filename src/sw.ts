/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const SHARE_CACHE = 'share-target-inbox'

// Web Share Target (POST, multipart/form-data — see vite.config.ts's manifest
// share_target). The OS launches this as a plain browser POST navigation with
// no Authorization header, so the server can't authenticate it. Instead we
// intercept it here, stash the payload in Cache Storage, and redirect into
// the already-authenticated SPA — ShareTargetPage reads it back and uploads
// through the normal client-side flow (uploadWorkspaceBlob), same as a
// manual FAB upload.
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(request))
  }
})

async function handleShareTarget(request: Request): Promise<Response> {
  const formData = await request.formData()
  const token = crypto.randomUUID()

  const title = String(formData.get('title') ?? '')
  const text = String(formData.get('text') ?? '')
  const url = String(formData.get('url') ?? '')
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)

  const cache = await caches.open(SHARE_CACHE)
  await cache.put(
    `/share-target-inbox/${token}/meta`,
    new Response(JSON.stringify({ title, text, url, fileNames: files.map((f) => f.name) })),
  )
  await Promise.all(
    files.map((file, i) =>
      cache.put(
        `/share-target-inbox/${token}/file-${i}`,
        new Response(file, { headers: { 'Content-Type': file.type, 'X-File-Name': file.name } }),
      ),
    ),
  )

  return Response.redirect(`/share-target?token=${token}`, 303)
}

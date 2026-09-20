import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { HomeFab } from '@/components/home/HomeFab'
import type { QuickAddInitialData, QuickAddKind } from '@/components/home/quick-add-types'

import { SHARE_CACHE } from '@/lib/share-inbox'

// Keyed by the ?error= codes src/sw.ts redirects with, plus the local 'expired'
// case for a token whose inbox entry is already gone.
const SHARE_ERRORS: Record<string, string> = {
  'too-large': 'Android shares are limited to 100 MiB in total for temporary device storage. Nothing was uploaded. Use Add File to upload larger files directly.',
  'stash-failed': "Canvas couldn't hold on to the shared file — device storage may be full. Try again, or upload it from the app.",
  expired: 'Nothing shared, or the share expired.',
}

interface ShareMeta {
  status?: 'receiving' | 'ready' | 'error'
  error?: string
  title: string
  text: string
  url: string
  fileNames: string[]
}

async function readShareInbox(token: string): Promise<{ kind: QuickAddKind; data: QuickAddInitialData } | null> {
  const cache = await caches.open(SHARE_CACHE)
  let meta: ShareMeta | null = null
  // Staging is local and may outlive the redirect. No fake upload percentage:
  // the browser does not expose progress for parsing an incoming share.
  const deadline = Date.now() + 5 * 60_000
  while (Date.now() < deadline) {
    const response = await cache.match(`/share-target-inbox/${token}/meta`)
    if (!response) return null
    meta = await response.json()
    if (meta?.status === 'error') throw new Error(meta.error || 'stash-failed')
    if (meta?.status !== 'receiving') break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  if (!meta || meta.status === 'receiving') throw new Error('stash-failed')

  const files: File[] = []
  for (let i = 0; i < meta.fileNames.length; i++) {
    const fileRes = await cache.match(`/share-target-inbox/${token}/file-${i}`)
    if (!fileRes) throw new Error('stash-failed')
    const blob = await fileRes.blob()
    files.push(new File([blob], meta.fileNames[i], { type: blob.type }))
  }
  await Promise.all(meta.fileNames.map((_, i) => cache.delete(`/share-target-inbox/${token}/file-${i}`)))
  await cache.delete(`/share-target-inbox/${token}/meta`)

  if (files.length) return { kind: 'file', data: { files } }

  // The `url` param is the well-behaved case, but a lot of apps (esp. the
  // Android share sheet for browsers/social apps) put the shared link in
  // `text` instead — treat a text body that's just a bare URL as a link too.
  const trimmedText = meta.text.trim()
  const sharedUrl = meta.url || (isBareUrl(trimmedText) ? trimmedText : '')
  if (sharedUrl) return { kind: 'link', data: { url: sharedUrl, title: meta.title } }

  return { kind: 'note', data: { title: meta.title, content: meta.text } }
}

// React StrictMode remounts effects. Share inbox consumption must run once.
const reads = new Map<string, ReturnType<typeof readShareInbox>>()
function consumeShare(token: string) {
  let promise = reads.get(token)
  if (!promise) {
    promise = readShareInbox(token)
    reads.set(token, promise)
    // Bound the in-memory handoff cache; files remain available across the
    // immediate StrictMode effect replay, then the mounted card owns them.
    void promise.finally(() => setTimeout(() => reads.delete(token), 60_000)).catch(() => {})
  }
  return promise
}

function isBareUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// Landing point for the OS share sheet (see src/sw.ts for the intercept +
// stash, and vite.config.ts's manifest.share_target for the registration).
// Opens the right quick-add B5Card pre-filled, then behaves exactly like the
// normal home FAB flow from there on.
export default function ShareTargetPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [resolved, setResolved] = useState<{ kind: QuickAddKind; data: QuickAddInitialData } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      // The SW redirects here with ?error= when it could not stash the share at
      // all (see src/sw.ts) — that is a different story from an expired token
      // and deserves its own message, not a silent "nothing shared".
      const error = searchParams.get('error')
      if (error) {
        setFailure(error)
        return
      }
      const token = searchParams.get('token')
      const r = token ? await consumeShare(token) : null
      if (cancelled) return
      if (r) setResolved(r)
      else setFailure('expired')
    }
    void resolve().catch(error => {
      if (!cancelled) setFailure(error instanceof Error ? error.message : 'stash-failed')
    })
    return () => { cancelled = true }
  }, [searchParams])

  const closeAndReturn = () => navigate('/home', { replace: true })

  if (failure) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{SHARE_ERRORS[failure] ?? SHARE_ERRORS.expired}</p>
        <button type="button" onClick={() => navigate('/apps/add/file', { replace: true })} className="text-sm font-medium text-primary underline underline-offset-4">Add File</button>
        <button
          type="button"
          onClick={closeAndReturn}
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Go to Canvas
        </button>
      </div>
    )
  }

  if (!resolved) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Receiving shared content on this device… No upload has started.</div>
  }

  return <HomeFab initialKind={resolved.kind} initialData={resolved.data} onInitialCardClose={closeAndReturn} />
}

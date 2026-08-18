import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { HomeFab } from '@/components/home/HomeFab'
import type { QuickAddInitialData, QuickAddKind } from '@/components/home/quick-add-types'

const SHARE_CACHE = 'share-target-inbox'

// Keyed by the ?error= codes src/sw.ts redirects with, plus the local 'expired'
// case for a token whose inbox entry is already gone.
const SHARE_ERRORS: Record<string, string> = {
  'too-large': 'That file is too large to share into Canvas. Upload it from the app instead.',
  'stash-failed': "Canvas couldn't hold on to the shared file — device storage may be full. Try again, or upload it from the app.",
  expired: 'Nothing shared, or the share expired.',
}

interface ShareMeta {
  title: string
  text: string
  url: string
  fileNames: string[]
}

async function readShareInbox(token: string): Promise<{ kind: QuickAddKind; data: QuickAddInitialData } | null> {
  const cache = await caches.open(SHARE_CACHE)
  const metaRes = await cache.match(`/share-target-inbox/${token}/meta`)
  if (!metaRes) return null
  const meta: ShareMeta = await metaRes.json()

  const files: File[] = []
  for (let i = 0; i < meta.fileNames.length; i++) {
    const fileRes = await cache.match(`/share-target-inbox/${token}/file-${i}`)
    if (!fileRes) continue
    const blob = await fileRes.blob()
    files.push(new File([blob], meta.fileNames[i], { type: blob.type }))
    await cache.delete(`/share-target-inbox/${token}/file-${i}`)
  }
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
      const r = token ? await readShareInbox(token) : null
      if (cancelled) return
      if (r) setResolved(r)
      else setFailure('expired')
    }
    resolve()
    return () => { cancelled = true }
  }, [searchParams])

  const closeAndReturn = () => navigate('/home', { replace: true })

  if (failure) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{SHARE_ERRORS[failure] ?? SHARE_ERRORS.expired}</p>
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
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading shared content…</div>
  }

  return <HomeFab initialKind={resolved.kind} initialData={resolved.data} onInitialCardClose={closeAndReturn} />
}

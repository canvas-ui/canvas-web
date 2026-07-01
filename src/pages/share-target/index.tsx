import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { HomeFab } from '@/components/home/HomeFab'
import type { QuickAddInitialData, QuickAddKind } from '@/components/home/quick-add-types'

const SHARE_CACHE = 'share-target-inbox'

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
  if (meta.url) return { kind: 'link', data: { url: meta.url, title: meta.title } }
  return { kind: 'note', data: { title: meta.title, content: meta.text } }
}

// Landing point for the OS share sheet (see src/sw.ts for the intercept +
// stash, and vite.config.ts's manifest.share_target for the registration).
// Opens the right quick-add B5Card pre-filled, then behaves exactly like the
// normal home FAB flow from there on.
export default function ShareTargetPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [resolved, setResolved] = useState<{ kind: QuickAddKind; data: QuickAddInitialData } | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      const token = searchParams.get('token')
      const r = token ? await readShareInbox(token) : null
      if (cancelled) return
      if (r) setResolved(r)
      else setNotFound(true)
    }
    resolve()
    return () => { cancelled = true }
  }, [searchParams])

  const closeAndReturn = () => navigate('/home', { replace: true })

  if (notFound) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Nothing shared, or the share expired.
      </div>
    )
  }

  if (!resolved) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading shared content…</div>
  }

  return <HomeFab initialKind={resolved.kind} initialData={resolved.data} onInitialCardClose={closeAndReturn} />
}

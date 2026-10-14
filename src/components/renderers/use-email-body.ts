import { useEffect, useState } from 'react'
import type { Document } from '@/types/workspace'
import { useDocumentContent, usePublicShareCode } from './public-share'

export function useEmailBody(workspaceId: string, document: Document) {
  const { fetchBlob } = useDocumentContent(workspaceId)
  const shareCode = usePublicShareCode()
  const version = document.checksumArray?.[0] || document.updatedAt || ''
  const key = JSON.stringify([workspaceId, shareCode, document.id, version])
  const inlineText = typeof document.data?.body === 'string' ? document.data.body : null
  const inlineHtml = typeof document.data?.bodyHtml === 'string' ? document.data.bodyHtml : null
  const inline = inlineText !== null || inlineHtml !== null
  const [loaded, setLoaded] = useState<{ key: string; body: string; bodyHtml: string | null; error: string | null } | null>(null)

  useEffect(() => {
    if (inline) return
    const controller = new AbortController()
    fetchBlob(document.id, { format: 'email', version, signal: controller.signal })
      .then(async ({ blob }) => {
        const content = JSON.parse(await blob.text())
        if (typeof content.body !== 'string' || (content.bodyHtml != null && typeof content.bodyHtml !== 'string')) {
          throw new Error('Invalid email content response')
        }
        if (!controller.signal.aborted) setLoaded({ key, body: content.body, bodyHtml: content.bodyHtml || null, error: null })
      })
      .catch(error => {
        if (!controller.signal.aborted) setLoaded({ key, body: '', bodyHtml: null, error: error instanceof Error ? error.message : String(error) })
      })
    return () => controller.abort()
  }, [key, inline, fetchBlob, document.id, version])

  if (inline) return { body: inlineText || '', bodyHtml: inlineHtml, loading: false, error: null }
  if (loaded?.key === key) return { ...loaded, loading: false }
  return { body: '', bodyHtml: null, loading: true, error: null }
}

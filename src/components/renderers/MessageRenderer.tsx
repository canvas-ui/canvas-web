import { useEffect, useRef, useState } from 'react'
import { useDocumentContent, usePublicShareCode } from './public-share'
import type { RendererProps } from './types'

interface Attachment { type?: string; name?: string; filename?: string; url?: string; mimeType?: string; contentType?: string }

function MessageAttachment({ attachment, workspaceId, document }: RendererProps & { attachment: Attachment }) {
  const { fetchBlob } = useDocumentContent(workspaceId)
  const shareCode = usePublicShareCode()
  const fetchRef = useRef(fetchBlob)
  useEffect(() => { fetchRef.current = fetchBlob })
  const [source, setSource] = useState<{ url?: string; error?: string } | null>(null)
  useEffect(() => {
    if (!attachment.url) return
    let active = true
    let created: string | undefined
    void fetchRef.current(document.id, { url: attachment.url }).then(({ blob }) => {
      if (!active) return
      created = URL.createObjectURL(blob)
      setSource({ url: created })
    }).catch(() => { if (active) setSource({ error: 'Attachment could not be loaded.' }) })
    return () => { active = false; if (created) URL.revokeObjectURL(created) }
  }, [workspaceId, shareCode, document.id, attachment.url])
  const mime = attachment.mimeType || attachment.contentType || ''
  const name = attachment.name || attachment.filename || 'Attachment'
  return <div className="space-y-2 rounded border p-2">
    {source?.error && <p className="text-xs text-destructive">{source.error}</p>}
    {!source && attachment.url && <p className="text-xs text-muted-foreground">Loading attachment…</p>}
    {source?.url && <>
      {mime.startsWith('image/') && <img src={source.url} alt={name} className="max-h-96 max-w-full rounded object-contain" />}
      {mime.startsWith('audio/') && <audio controls src={source.url} className="w-full" />}
      {mime.startsWith('video/') && <video controls src={source.url} className="max-h-96 max-w-full rounded" />}
      <a href={source.url} download={name} className="text-sm text-primary underline">Download {name}</a>
    </>}
  </div>
}

export function MessageRenderer(props: RendererProps) {
  const data = props.document.data
  const sender = data.sender as { name?: string; displayName?: string; username?: string; id?: string } | undefined
  const channel = data.channel as { name?: string; id?: string } | undefined
  const attachments = (Array.isArray(data.attachments) ? data.attachments : []) as Attachment[]
  const date = data.timestamp ? new Date(String(data.timestamp)) : null
  return <article className={`space-y-4 p-3 ${props.className || ''}`}>
    <header className="space-y-1 border-b pb-3">
      <p className="font-medium">{sender?.name || sender?.displayName || sender?.username || sender?.id || 'Unknown sender'}</p>
      <p className="text-xs text-muted-foreground">{[channel?.name || channel?.id, String(data.platform || ''), date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : ''].filter(Boolean).join(' · ')}</p>
    </header>
    <p className="whitespace-pre-wrap break-words text-sm">{String(data.text || '(No text)')}</p>
    {Boolean(data.mediaError) && <p className="text-xs text-destructive">{String(data.mediaError)}</p>}
    {attachments.map((attachment, index) => <MessageAttachment key={attachment.url || index} {...props} attachment={attachment} />)}
  </article>
}

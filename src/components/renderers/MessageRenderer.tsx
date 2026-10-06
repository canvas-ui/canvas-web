import { useDocumentBlobUrl, useDocumentStreamSrc } from './useDocumentBlobUrl'
import { useState } from 'react'
import { useDocumentContent } from './public-share'
import type { RendererProps } from './types'

interface Attachment { type?: string; name?: string; filename?: string; url?: string; mimeType?: string; contentType?: string }

function MessageAttachment({ attachment, workspaceId, document }: RendererProps & { attachment: Attachment }) {
  const { download } = useDocumentContent(workspaceId)
  const mime = attachment.mimeType || attachment.contentType || ''
  const name = attachment.name || attachment.filename || 'Attachment'
  const media = mime.startsWith('audio/') || mime.startsWith('video/')
  const { blobUrl, error: blobError, loading: blobLoading } = useDocumentBlobUrl(workspaceId, document.id, { url: attachment.url, typeHint: mime, enabled: !media && !!attachment.url })
  const { src, error: streamError, loading: streamLoading } = useDocumentStreamSrc(workspaceId, document.id, { url: attachment.url, enabled: media && !!attachment.url })
  const [playError, setPlayError] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const error = media ? streamError : blobError
  const loading = media ? streamLoading : blobLoading
  return <div className="space-y-2 rounded border p-2">
    {error && <p className="text-xs text-destructive">{error}</p>}
    {loading && <p className="text-xs text-muted-foreground">Loading attachment…</p>}
    {!media && blobUrl && mime.startsWith('image/') && <img src={blobUrl} alt={name} className="max-h-96 max-w-full rounded object-contain" />}
    {media && src && (mime.startsWith('video/')
      ? <video key={src} controls playsInline preload="metadata" src={src} onError={() => setPlayError(true)} className="max-h-96 w-full rounded" />
      : <audio key={src} controls preload="metadata" src={src} onError={() => setPlayError(true)} className="w-full" />)}
    {playError && <p role="alert" className="text-xs text-destructive">This media could not be played in your browser. Download it to play in another app.</p>}
    {downloadError && <p role="alert" className="text-xs text-destructive">{downloadError}</p>}
    {attachment.url && <button className="text-sm text-primary underline" onClick={() => { void download(document.id, name, { url: attachment.url }).catch(() => setDownloadError('Attachment could not be downloaded.')) }}>Download {name}</button>}
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

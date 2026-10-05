import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DocumentRenderer } from '@/components/renderers/registry'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { RELATIONS_CHANGED } from '@/lib/relation-events'
import { getMessageThread, type MessageThreadResult, type ComposeMode } from '@/services/messages'
import type { Document } from '@/types/workspace'
import { MessageComposerDialog } from './MessageComposerDialog'

/** Shared reply-chain viewer. Conversation/channel membership is not a thread. */
export function MessageThread({ workspaceId, documentId }: { workspaceId: string; documentId: number }) {
  const [result, setResult] = useState<MessageThreadResult | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [reply, setReply] = useState<{ document: Document; mode: ComposeMode } | null>(null)
  const load = useCallback(async () => {
    try { const next = await getMessageThread(workspaceId, documentId); setResult(next); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load thread') }
  }, [workspaceId, documentId])
  useEffect(() => {
    let active = true
    void getMessageThread(workspaceId, documentId).then((next) => { if (active) { setResult(next); setError('') } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load thread') })
    const refresh = () => { void load() }
    window.addEventListener('workspace:documents:refresh', refresh)
    window.addEventListener(RELATIONS_CHANGED, refresh)
    return () => { active = false; window.removeEventListener('workspace:documents:refresh', refresh); window.removeEventListener(RELATIONS_CHANGED, refresh) }
  }, [workspaceId, documentId, load])
  if (error) return <div className="p-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div>
  if (!result || result.documentId !== documentId) return <p className="p-3 text-sm text-muted-foreground">Loading thread…</p>
  return <section aria-label="Message thread" className="space-y-3 p-2">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">Thread · {result.documents.length} message{result.documents.length === 1 ? '' : 's'}</h3><Button size="sm" variant="outline" onClick={() => void load()}>Refresh</Button></div>
    {result.documents.length === 1 && <p className="text-xs text-muted-foreground">No linked replies have been indexed. Other messages in this conversation are separate from this reply thread.</p>}
    {result.truncated && <p className="text-xs text-muted-foreground">Showing up to 200 linked messages.</p>}
    {result.documents.map((document) => {
      const info = getDocumentDisplayInfo(document)
      const email = document.schema === 'data/schema/message/email'
      const canReply = email || ['slack', 'whatsapp'].includes(String(document.data.platform))
      const timestamp = document.data.timestamp || document.data.date
      const date = timestamp ? new Date(String(timestamp)) : null
      const parents = (result.parents[document.id] || []).flatMap((id) => {
        const parent = result.documents.find((doc) => Number(doc.id) === id)
        return parent ? [getDocumentDisplayInfo(parent).title] : []
      })
      const isExpanded = expanded[Number(document.id)] ?? Number(document.id) === documentId
      return <details key={document.id} open={isExpanded} onToggle={(event) => { const open = event.currentTarget.open; setExpanded((previous) => previous[Number(document.id)] === open ? previous : { ...previous, [Number(document.id)]: open }) }} className="rounded-lg border bg-card">
        <summary className="cursor-pointer space-y-1 p-3 text-sm">
          <span className="font-medium">{info.title}</span>
          <span className="block text-xs text-muted-foreground">{info.subtitle}{date && !Number.isNaN(date.getTime()) ? ` · ${date.toLocaleString()}` : ''}</span>
          {parents.length > 0 && <span className="block text-xs text-muted-foreground">Reply to {parents.join(', ')}</span>}
        </summary>
        {isExpanded && canReply && <div className="flex flex-wrap gap-2 px-3 pb-2">{(email ? ['reply', 'replyAll', 'forward'] : ['reply'] as const).map((mode) => <Button key={mode} variant="outline" size="sm" onClick={() => setReply({ document, mode: mode as ComposeMode })}>{mode === 'replyAll' ? 'Reply all' : mode === 'forward' ? 'Forward' : 'Reply'}</Button>)}</div>}
        {isExpanded && <DocumentRenderer workspaceId={workspaceId} document={document} />}
      </details>
    })}
    {reply && <MessageComposerDialog key={`${reply.document.id}:${reply.mode}`} workspaceId={workspaceId} replyToDocumentId={Number(reply.document.id)} mode={reply.mode} originalSubject={typeof reply.document.data.subject === 'string' ? reply.document.data.subject : undefined} onClose={() => setReply(null)} />}
  </section>
}

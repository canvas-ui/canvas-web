import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LazyMarkdownEditor } from '@/components/common/lazy-editor'
import { messageAccounts, messageReplyTarget, sendMessage, messageSendStatus, type ComposeMode, type MessageAccount, type MessageSend, type MessageReceipt, type ReplyTarget } from '@/services/messages'

// Reply and Reply all share one draft (the checkbox flips between them); a
// forward is a different message to different people, so it drafts apart.
function draftKey(workspace: string, replyId?: number, forward = false) {
  let hash = 2166136261
  try { for (const c of localStorage.getItem('authToken') || '') hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) } catch { /* unavailable storage */ }
  return `canvas:message-draft:${hash >>> 0}:${workspace}:${replyId || 'new'}${forward ? ':fwd' : ''}`
}

const TITLES: Record<ComposeMode, string> = { reply: 'Reply', replyAll: 'Reply all', forward: 'Forward' }

export function MessageComposer({ workspaceId, replyToDocumentId, mode = 'reply', originalSubject, onClose }: {
  workspaceId: string
  replyToDocumentId?: number
  /** Only meaningful with replyToDocumentId. Reply/Reply all/Forward apply to email; chats only reply. */
  mode?: ComposeMode
  /** The original's subject, for the Re:/Fwd: placeholder. */
  originalSubject?: string
  onClose: () => void
}) {
  const forward = !!replyToDocumentId && mode === 'forward'
  const key = draftKey(workspaceId, replyToDocumentId, forward)
  const fresh = (): MessageSend => ({ requestId: crypto.randomUUID(), text: '', replyToDocumentId,
    ...(forward ? { forward: true } : replyToDocumentId ? { replyAll: mode === 'replyAll', quote: true } : {}) })
  const [draft, setDraft] = useState<MessageSend>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved)
        const restored: MessageSend = parsed.draft || parsed
        // The button that opened the composer decides Reply vs Reply all.
        return forward || !replyToDocumentId ? restored : { ...restored, replyAll: mode === 'replyAll' }
      }
    } catch { /* storage may be unavailable */ }
    return fresh()
  })
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [accounts, setAccounts] = useState<MessageAccount[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || '{}').attempted === true } catch { return false } })
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<MessageReceipt | null>(null)
  useEffect(() => {
    let active = true
    Promise.all([messageAccounts(workspaceId), replyToDocumentId ? messageReplyTarget(workspaceId, replyToDocumentId) : Promise.resolve(null)])
      .then(([list, target]) => {
        if (!active) return
        setReplyTarget(target)
        setAccounts(list.filter((a) => a.canSend && (!target || (a.driver === target.driver && a.address === target.address))))
        if (replyToDocumentId && !target) setError('This message has no supported reply account.')
        if (target) setDraft((d) => ({ ...d, driver: target.driver, address: target.address }))
      }).catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [workspaceId, replyToDocumentId])
  useEffect(() => { try { if (receipt?.status === 'accepted') localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify({ draft, attempted })) } catch { /* keep the in-memory draft */ } }, [key, draft, attempted, receipt])
  const account = accounts.find((a) => a.driver === draft.driver && a.address === draft.address)
  const isEmail = account?.driver === 'imap'
  const hasText = !!draft.text.trim()
  const patch = (next: Partial<MessageSend>) => setDraft((d) => ({ ...d, ...next }))
  const send = async () => {
    setBusy(true); setError(''); setAttempted(true)
    // An empty editor's '<p></p>' is not a body; chats take plain text and no
    // email-only options (undefined drops out of the JSON).
    const body: MessageSend = isEmail
      ? (hasText ? draft : { ...draft, html: undefined })
      : { ...draft, html: undefined, quote: undefined, forward: undefined }
    try {
      const result = attempted
        ? await messageSendStatus(workspaceId, draft.requestId).catch((e) => {
          if (e.statusCode === 404) return sendMessage(workspaceId, body)
          throw e
        })
        : await sendMessage(workspaceId, body)
      setReceipt(result)
      if (result.status === 'accepted') {
        try { localStorage.removeItem(key) } catch { /* unavailable storage */ }
        window.dispatchEvent(new CustomEvent('workspace:documents:refresh', { detail: { workspaceName: workspaceId } }))
      }
    } catch (e) {
      const failure = e as Error & { statusCode?: number }
      setError(failure.message)
      if (!attempted && failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500 && failure.statusCode !== 409) setAttempted(false)
    } finally { setBusy(false) }
  }
  const replyRecipients = draft.replyAll ? replyTarget?.allRecipients : replyTarget?.recipients
  const locked = busy || attempted
  const title = replyToDocumentId ? (forward ? TITLES.forward : TITLES[draft.replyAll ? 'replyAll' : 'reply']) : 'New message'
  const subjectPlaceholder = replyToDocumentId && originalSubject
    ? `${forward ? 'Fwd' : 'Re'}: ${originalSubject.replace(forward ? /^(fwd?|fw):\s*/i : /^re:\s*/i, '')}`
    : ''
  return <section className="max-h-[70dvh] overflow-y-auto rounded-md border bg-card p-3 space-y-3" aria-label={replyToDocumentId ? `${title} to message` : 'New message'}>
    <div className="flex justify-between items-center"><strong className="text-sm">{title}</strong><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
    <label className="block text-xs">Send from
      <select aria-label="Sending account" className="w-full rounded border bg-background p-2" value={account ? `${account.driver}:${account.address}` : ''} disabled={locked || !!replyToDocumentId} onChange={(e) => {
        const a = accounts.find((a) => `${a.driver}:${a.address}` === e.target.value)
        if (a) patch({ driver: a.driver, address: a.address, to: [], cc: [], bcc: [], subject: undefined, target: undefined, replyAll: false })
      }}><option value="">Select an enabled sending account</option>{accounts.map((a) => <option key={`${a.driver}:${a.address}`} value={`${a.driver}:${a.address}`}>{a.driver} · {a.from || a.address}</option>)}</select>
    </label>
    {!accounts.length && <p className="text-xs text-muted-foreground">Enable sending in the account’s workspace settings. Your draft stays on this device.</p>}
    {isEmail ? <>
      <label className="block text-xs">To {replyToDocumentId && !forward ? '(leave blank to reply to the sender)' : ''}<Input aria-label="To" disabled={locked} value={draft.to?.join(', ') || ''} onChange={(e) => patch({ to: [e.target.value] })} /></label>
      {replyToDocumentId && !forward && !draft.to?.some((s) => s.trim()) && replyRecipients && <p className="text-xs text-muted-foreground">Reply to: {replyRecipients.to.join(', ')}{replyRecipients.cc.length ? ` · Cc: ${replyRecipients.cc.join(', ')}` : ''}</p>}
      {(['cc', 'bcc'] as const).map((field) => <label key={field} className="block text-xs">{field === 'cc' ? 'Cc' : 'Bcc'}<Input aria-label={field === 'cc' ? 'Cc' : 'Bcc'} disabled={locked} value={draft[field]?.join(', ') || ''} onChange={(e) => patch({ [field]: [e.target.value] })} /></label>)}
      {/* Blank keeps the server's Re:/Fwd: subject. */}
      <label className="block text-xs">Subject<Input aria-label="Subject" disabled={locked} value={draft.subject || ''} placeholder={subjectPlaceholder} onChange={(e) => patch({ subject: e.target.value || undefined })} /></label>
      {replyToDocumentId && !forward && <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex gap-2"><input type="checkbox" disabled={locked} checked={draft.replyAll || false} onChange={(e) => patch({ replyAll: e.target.checked })} />Reply all</label>
        <label className="flex gap-2"><input type="checkbox" disabled={locked} checked={draft.quote || false} onChange={(e) => patch({ quote: e.target.checked })} />Quote original message</label>
      </div>}
      {forward && <p className="text-xs text-muted-foreground">The original message and its attachments are included below your note.</p>}
      <LazyMarkdownEditor format="html" editable={!locked} value={draft.html || ''} placeholder={forward ? 'Add a note (optional)…' : 'Write a message…'}
        onChange={(html, text) => patch({ html, text: text.slice(0, 32000) })} />
    </> : <>
      {!replyToDocumentId && <label className="block text-xs">Conversation (configured channel name or ID)<Input aria-label="Conversation" disabled={locked} value={draft.target || ''} onChange={(e) => patch({ target: e.target.value })} /></label>}
      <textarea aria-label="Message text" className="w-full rounded border bg-background p-2 text-sm" rows={5} maxLength={32000} disabled={locked} value={draft.text} onChange={(e) => patch({ text: e.target.value })} placeholder="Write a message…" />
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {receipt && <p role="status" className="text-sm">{receipt.status === 'accepted' ? 'Accepted by the provider.' : receipt.message} {receipt.warnings?.join(' ')} {receipt.rejected?.length ? `Not accepted for: ${receipt.rejected.join(', ')}` : ''}</p>}
    {receipt?.status !== 'accepted' && <Button size="sm" disabled={busy || (!attempted && (!account || (!hasText && !(isEmail && forward)) || (forward && !draft.to?.some((s) => s.trim())))) || !online} onClick={() => void send()}>{busy ? 'Sending…' : attempted ? 'Check send status' : 'Send'}</Button>}
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
      if (!window.confirm(attempted ? 'This message may already have been sent. Discard this draft only after checking the conversation.' : 'Discard this draft?')) return
      setDraft({ ...fresh(), driver: draft.driver, address: draft.address }); setAttempted(false); setReceipt(null); setError('')
    }}>Discard draft</Button>
    {attempted && receipt?.status !== 'accepted' && <p className="text-xs text-muted-foreground">Do not start another send until you have checked the conversation. The same request will not be delivered twice by Canvas.</p>}
  </section>
}

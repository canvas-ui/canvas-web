import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { updateBackend } from '@/services/workspace'
import { messageConnection, resetMessageConnection } from '@/services/messages'

export function WhatsAppConnection({ workspaceId, address, selectedChats = [], onSaved }: { workspaceId: string; address: string; selectedChats?: string[]; onSaved?: () => Promise<void> }) {
  const [chats, setChats] = useState<string[]>(selectedChats)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Awaited<ReturnType<typeof messageConnection>> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { const next = await messageConnection(workspaceId, address); if (!cancelled) { setStatus(next); setError('') } }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Connection unavailable') }
      if (!cancelled) timer = setTimeout(() => void poll(), 3000)
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [workspaceId, address, open])
  return <div className="mb-2">
    <Button size="sm" variant="outline" onClick={() => { if (!open) setChats(selectedChats); setOpen(!open) }}>{open ? 'Close connection panel' : 'Pair / connection status'}</Button>
    {open && <div className="space-y-2 p-2 text-xs">
      <p>{error || status?.state || 'Connecting…'}</p>
      <Button size="sm" variant="outline" onClick={() => {
        if (!window.confirm('Forget the current session and pair this account again?')) return
        void resetMessageConnection(workspaceId, address).catch((e) => setError(e.message))
      }}>Pair again</Button>
      {status?.qr && <><p>WhatsApp → Settings → Linked devices → Link a device.</p><img className="max-w-full" src={status.qr} width={256} height={256} alt="WhatsApp device pairing QR code" /></>}
      {status?.chats.length ? <><p>Select conversations to synchronize into this workspace.</p><div className="max-h-48 overflow-auto">{status.chats.map((c) => <label key={c.id} className="flex items-center gap-2"><input type="checkbox" disabled={saving} checked={chats.includes(c.id)} onChange={(e) => setChats((prev) => e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id))} />{c.name} · <code>{c.id}</code></label>)}</div><Button size="sm" disabled={saving} onClick={async () => {
        setSaving(true); setError('')
        try { await updateBackend(workspaceId, 'whatsapp', address, { chats }); await onSaved?.() }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not save conversations') }
        finally { setSaving(false) }
      }}>{saving ? 'Saving…' : 'Save conversations and sync'}</Button>{!chats.length && <p>No conversations selected; messages will not be synchronized.</p>}</> : null}
    </div>}
  </div>
}

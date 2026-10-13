import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { defaultRemovalPolicy, type RemovalPolicy } from '@/services/trash-operations'
import type { Backend } from '@/services/workspace'

export function BackendRemovalSettings({ value, backends, source, onSave, destination = true }: {
  value?: Partial<RemovalPolicy>; backends: Backend[]; source: string; onSave: (value: RemovalPolicy) => Promise<unknown>; destination?: boolean
}) {
  const [draft, setDraft] = useState<RemovalPolicy>({ ...defaultRemovalPolicy, ...value })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const selectStyle = 'rounded border bg-background px-2 py-1.5 text-xs w-full'
  const save = async () => {
    setBusy(true); setMessage('')
    try { await onSave(draft); setMessage('Removal policy saved.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save policy') }
    finally { setBusy(false) }
  }
  return <details className="border-t pt-3 text-xs">
    <summary className="cursor-pointer font-medium">Source removals and Trash</summary>
    <div className="mt-3 space-y-3">
      <p className="text-muted-foreground">A completed scan removes missing locations from the backend tree. Items with no remaining locations go to Trash until you purge them.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 block">When an item disappears from this source
          <select className={selectStyle} value={draft.membership} disabled={busy} onChange={e => setDraft({ ...draft, membership: e.target.value as RemovalPolicy['membership'] })}>
            <option value="keep">Keep in managed trees</option><option value="review">Review removal in Trash</option><option value="trash">Move to Trash automatically</option>
          </select>
        </label>
        <label className="space-y-1 block">Remove tracked copies from other backends
          <select className={selectStyle} value={draft.propagation} disabled={busy} onChange={e => setDraft({ ...draft, propagation: e.target.value as RemovalPolicy['propagation'] })}>
            <option value="never">Never</option><option value="review">Review in Trash</option><option value="automatic">Automatically, retaining recovery copies</option>
          </select>
        </label>
      </div>
      {draft.propagation !== 'never' && <fieldset className="space-y-2"><legend className="mb-1 font-medium">Destinations</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.targets === 'all'} disabled={busy} onChange={e => setDraft({ ...draft, targets: e.target.checked ? 'all' : [] })} />All eligible backends</label>
        {draft.targets !== 'all' && backends.filter(b => b.address !== source && b.kind === 'storage').map(b => <label key={b.address} className="flex items-center gap-2">
          <input type="checkbox" disabled={busy || b.config?.propagatedRemovalSupported !== true} checked={draft.targets.includes(b.address)} onChange={e => setDraft({ ...draft, targets: e.target.checked ? [...draft.targets as string[], b.address] : (draft.targets as string[]).filter(n => n !== b.address) })} />
          {String(b.config?.label || b.address)}{b.config?.propagatedRemovalSupported !== true ? ' · recovery removal unavailable' : !(b.config?.removalPolicy as RemovalPolicy)?.acceptPropagatedDeletions && ' · protected'}
        </label>)}
        <p className="text-muted-foreground">Only tracked, Canvas-owned copies are eligible. Protected destinations refuse propagated deletion. Recovery removal currently supports filesystem and workspace blob storage; remote destinations remain protected.</p>
      </fieldset>}
      {destination && <label className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={draft.acceptPropagatedDeletions} onChange={e => setDraft({ ...draft, acceptPropagatedDeletions: e.target.checked })} />Accept propagated deletions on this backend</label>}
      <div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save removal policy'}</Button><span role="status">{message}</span></div>
    </div>
  </details>
}

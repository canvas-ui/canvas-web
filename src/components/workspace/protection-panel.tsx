import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

export function WorkspaceProtectionPanel({ workspaceId, isActive, currentMode, onChanged }: {
  workspaceId: string; isActive: boolean; currentMode?: string; onChanged: () => void
}) {
  const [mode, setMode] = useState(currentMode === 'workspace' ? 'workspace' : 'secrets')
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [currentPassphrase, setCurrentPassphrase] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <section className="space-y-3 rounded-lg border p-4">
    <h2 className="font-semibold text-sm">Workspace protection</h2>
    <p className="text-sm text-muted-foreground">Protect service credentials with a PIN or password. Optionally require it to start the whole workspace. Files and document contents are not encrypted.</p>
    {isActive && <p className="text-sm">Stop the workspace before changing protection.</p>}
    <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault()
      setError('')
      if (passphrase !== confirmation) { setError('PIN/password confirmation does not match'); return }
      setBusy(true)
      try {
        const result = await api.put<{ recoveryKey: string }>(`${API_ROUTES.workspaces}/${workspaceId}/protection`, { mode, passphrase, currentPassphrase: currentPassphrase || undefined })
        setRecoveryKey(result.recoveryKey)
        setPassphrase(''); setConfirmation(''); setCurrentPassphrase('')
      } catch (err) { setError(err instanceof Error ? err.message : 'Could not save protection') }
      finally { setBusy(false) }
    }}>
      <label className="block text-sm space-y-1">Protection mode
        <select className="block rounded border bg-background p-2 w-full" value={mode} onChange={(event) => setMode(event.target.value)} disabled={isActive || busy}>
          <option value="secrets">Secrets only — allow start without integrations</option>
          <option value="workspace">Whole workspace — require PIN/password to start</option>
        </select>
      </label>
      <label className="block text-sm space-y-1">Current PIN/password or recovery key (if already protected)
        <Input type="password" autoComplete="current-password" value={currentPassphrase} onChange={(event) => setCurrentPassphrase(event.target.value)} disabled={isActive || busy} />
      </label>
      <label className="block text-sm space-y-1">New PIN/password
        <Input type="password" autoComplete="new-password" minLength={4} maxLength={1024} required value={passphrase} onChange={(event) => setPassphrase(event.target.value)} disabled={isActive || busy} />
      </label>
      <label className="block text-sm space-y-1">Confirm new PIN/password
        <Input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isActive || busy} />
      </label>
      <Button disabled={isActive || busy || !!recoveryKey}>{busy ? 'Saving…' : 'Save protection'}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {recoveryKey && <div className="space-y-2 rounded border p-3">
      <p className="text-sm">Save this recovery key now. It is shown only once and replaces any previous recovery key.</p>
      <code className="block break-all select-all">{recoveryKey}</code>
      <Button variant="outline" onClick={() => { setRecoveryKey(''); onChanged() }}>I saved the recovery key</Button>
    </div>}
  </section>
}

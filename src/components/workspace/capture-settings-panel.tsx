import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getCaptureConfig, saveCaptureConfig, checkCaptureService, type CaptureConfig } from '@/services/captured'

export function CaptureSettingsPanel({ workspaceId }: { workspaceId: string }) {
  const [config, setConfig] = useState<CaptureConfig | null>(null)
  const [token, setToken] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getCaptureConfig(workspaceId).then(value => { if (active) setConfig(value) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Cannot load website capture settings') })
    return () => { active = false }
  }, [workspaceId])

  const update = (patch: Partial<CaptureConfig>) => {
    setConfig(current => current && { ...current, ...patch })
    setDirty(true)
    setMessage('')
  }
  const run = async (test: boolean) => {
    if (!config) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (test) setMessage((await checkCaptureService(workspaceId)).message)
      else {
        const { enabled, url, timeoutMs, maxBytes } = config
        setConfig(await saveCaptureConfig(workspaceId, { enabled, url, timeoutMs, maxBytes, ...(token ? { token } : {}) }))
        setToken('')
        setDirty(false)
        setMessage('Website capture settings saved for this workspace.')
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Website capture request failed') }
    finally { setBusy(false) }
  }

  return <section className="rounded-lg border p-4 space-y-4">
    <div>
      <h2 className="text-sm font-semibold">Website capture</h2>
      <p className="mt-1 text-xs text-muted-foreground">Save linked pages as a single offline HTML file. These settings apply only to this workspace.</p>
    </div>
    {config ? <>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">Enable website capture</span>
        <Switch label="Enable website capture" checked={config.enabled} disabled={busy} onClick={() => update({ enabled: !config.enabled })} />
      </div>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs">Service URL
          <Input type="url" value={config.url} placeholder="http://capture.internal:8085" onChange={event => update({ url: event.target.value })} />
          <span className="block text-muted-foreground">Must be reachable from the workspace runtime.</span>
        </label>
        <label className="space-y-1 text-xs">Service token
          <Input type="password" autoComplete="new-password" value={token} placeholder={config.tokenSet ? 'Token saved; leave blank to keep it' : 'Paste the capture-token value'} onChange={event => { setToken(event.target.value); setDirty(true); setMessage('') }} />
          <span className="block text-muted-foreground">Copy from the capture host’s secrets/capture-token file. Re-enter when changing the URL.</span>
        </label>
        <label className="space-y-1 text-xs">Capture timeout (seconds)
          <Input type="number" min={1} max={300} value={config.timeoutMs / 1000} onChange={event => update({ timeoutMs: Number(event.target.value) * 1000 })} />
        </label>
        <label className="space-y-1 text-xs">Maximum HTML size (MiB)
          <Input type="number" min={1} max={128} value={config.maxBytes / 1024 ** 2} onChange={event => update({ maxBytes: Number(event.target.value) * 1024 ** 2 })} />
        </label>
      </fieldset>
      <p className="text-xs text-muted-foreground">Limits must not exceed the capture service’s limits. In Automation, add a Download action and choose “the page as one HTML file”. Leave the filing destination empty to save beside the source link.</p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !dirty} onClick={() => void run(false)}>{busy ? 'Working…' : 'Save'}</Button>
        <Button size="sm" variant="outline" disabled={busy || dirty || !config.enabled || !config.tokenSet} onClick={() => void run(true)}>Test connection</Button>
      </div>
    </> : !error && <p className="text-xs text-muted-foreground">Loading website capture settings…</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </section>
}

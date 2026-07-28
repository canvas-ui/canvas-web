import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ShieldAlert, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { EmbeddConfigEditor } from '@/components/workspace/embedd-config-editor'
import { getCurrentUserFromToken } from '@/services/auth'
import {
  getServerEmbeddDefaults,
  saveServerEmbeddDefaults,
  type EmbeddConfig,
  type ServerEmbeddDefaults,
} from '@/services/embedd'

/**
 * Server-wide embedding defaults — the bottom configurable layer, which every
 * user sits on top of. Readable by anyone (the UI shows what you inherit),
 * writable by admins only.
 *
 * Also the home of the host allowlist. A provider `baseUrl` is fetched BY THE
 * SERVER, which makes it an SSRF primitive; the guard always refuses link-local
 * and metadata targets, and this list is how an admin permits specific hosts
 * beyond that.
 */
export default function AdminEmbeddingPage() {
  const { showToast } = useToast()
  const [defaults, setDefaults] = useState<ServerEmbeddDefaults | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allowHosts, setAllowHosts] = useState('')

  const isAdmin = getCurrentUserFromToken()?.userType === 'admin'

  // State is only touched from the async callbacks, never synchronously — the
  // mount effect below would otherwise trigger a cascading render.
  const load = useCallback(() => (
    getServerEmbeddDefaults()
      .then(result => {
        setDefaults(result)
        setAllowHosts((result.allowHosts || []).join(', '))
        setError(null)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load server defaults'))
      .finally(() => setLoading(false))
  ), [])

  useEffect(() => { void load() }, [load])

  const refresh = () => { setLoading(true); void load() }

  const save = async (next: EmbeddConfig) => {
    setSaving(true)
    try {
      const hosts = allowHosts.split(',').map(h => h.trim()).filter(Boolean)
      const result = await saveServerEmbeddDefaults({ ...next, ...(hosts.length ? { allowHosts: hosts } : {}) })
      showToast({
        title: 'Server defaults saved',
        description: `Written to ${result.configPath}. Every user inherits these, so running workspaces keep their current tables until restarted.`,
      })
      await load()
    } catch (err) {
      showToast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Server className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Server embedding defaults</h1>
            <p className="text-xs text-muted-foreground">
              The base every user inherits, before their own defaults and before a workspace's own config.
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {!isAdmin && (
        <div className="mb-4 flex items-start gap-2 rounded-md border p-3 text-xs">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Read-only — changing server defaults requires an admin account. This is what your workspaces inherit.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : error || !defaults ? (
        <div className="space-y-3">
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Server defaults unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">{error || 'No config returned.'}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={refresh}>Retry</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            Config file: <span className="font-mono">{defaults.configPath}</span>
          </p>

          <section className="rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Endpoint allowlist</h3>
            <p className="mb-2 mt-1 text-[11px] text-muted-foreground">
              Provider URLs are fetched by the server, so they are an SSRF surface. Link-local and cloud-metadata
              targets are always refused; list additional hosts here to permit them. Comma-separated, empty = only the
              always-blocked ranges apply.
            </p>
            <Input
              value={allowHosts}
              disabled={!isAdmin}
              onChange={e => setAllowHosts(e.target.value)}
              placeholder="gpu.internal, embeddings.example.com"
              className="h-8 text-sm"
            />
          </section>

          <EmbeddConfigEditor
            key={JSON.stringify(defaults.serverDefaults)}
            value={defaults.serverDefaults || {}}
            // Nothing resolves below this layer over the API, so what is stored
            // is also what runs — built-ins fill any space left undeclared.
            effective={defaults.serverDefaults || {}}
            inherited={{}}
            saving={saving}
            disabled={!isAdmin}
            saveLabel="Save server defaults"
            onSave={save}
          />
        </div>
      )}
    </div>
  )
}

import { PageHeader } from '@/components/common/page-header'
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-context'
import { InferdConfigEditor } from '@/components/workspace/inferd-config-editor'
import {
  getUserInferdConfig,
  saveUserInferdConfig,
  type InferdConfig,
  type UserInferdConfig,
} from '@/services/inferd'

/**
 * Per-user embedding defaults — the layer NEW workspaces inherit.
 *
 * Deliberately secondary to the workspace page: a workspace's own config wins
 * over this, travels with the workspace, and applies live. This layer only
 * decides where a workspace starts, and existing workspaces latch their space
 * configs at start, so changing it does not re-point anything already running.
 */
export default function EmbeddingDefaultsPage() {
  const { showToast } = useToast()
  const [config, setConfig] = useState<UserInferdConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // State is only touched from the async callbacks, never synchronously — the
  // mount effect below would otherwise trigger a cascading render.
  const load = useCallback(() => (
    getUserInferdConfig()
      .then(next => { setConfig(next); setError(null) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load embedding defaults'))
      .finally(() => setLoading(false))
  ), [])

  useEffect(() => { void load() }, [load])

  const refresh = () => { setLoading(true); void load() }

  const save = async (next: InferdConfig) => {
    setSaving(true)
    try {
      const result = await saveUserInferdConfig(next)
      showToast({
        title: 'Defaults saved',
        description: result.restartRequired
          ? `${result.workspaces.length} running workspace(s) keep their current tables until restarted — set the config on a workspace directly to change it live.`
          : 'New workspaces will inherit this.',
      })
      await load()
    } catch (err) {
      // A rejected endpoint comes back as a 400 naming the provider — verbatim.
      showToast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        compact
        className="mb-6"
        title="Embedding defaults"
        description="What new workspaces inherit. A workspace can override any of it, and its own setting always wins."
        actions={
          <Button type="button" size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : error || !config ? (
        <div className="space-y-3">
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Embedding defaults unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">{error || 'No config returned.'}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={refresh}>Retry</Button>
        </div>
      ) : (
        <InferdConfigEditor
          key={JSON.stringify(config.user)}
          value={config.user || {}}
          effective={config.effective || {}}
          inherited={config.serverDefaults || {}}
          invalid={config.invalid}
          saving={saving}
          saveLabel="Save defaults"
          onSave={save}
        />
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Archive, FolderSearch, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { LinkToCard } from '@/components/menu/shared/LinkToCard'
import { EmbeddConfigEditor } from './embedd-config-editor'
import {
  dropWorkspaceVectorTable,
  getWorkspaceEmbeddConfig,
  getWorkspaceEmbeddStatus,
  listWorkspaceVectorTables,
  reindexWorkspaceEmbeddings,
  saveWorkspaceEmbeddConfig,
  type EmbeddConfig,
  type VectorTable,
  type WorkspaceEmbeddConfig,
  type WorkspaceEmbeddQueue,
} from '@/services/embedd'
import { setEmbeddPaused } from '@/services/workspace'

/**
 * Workspace → Settings → Embedding.
 *
 * The primary surface for choosing embedding backends, because the config lives
 * in this workspace's own workspace.json and therefore travels with it.
 *
 * The whole flow is designed to be reversible, and the UI's job is to make that
 * legible: switch (live, no restart) → fill → revert if it disappointed →
 * reclaim only once you are sure. Only the last step destroys anything, which is
 * why it is the only one behind a confirm.
 */

const selectClass = 'h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring'

/**
 * Live queue readout + pause/resume, refreshed on an interval while jobs are
 * pending (a reindex's progress is the whole point of watching it). Moved here
 * from the Database tab: the queue is embedding runtime, not storage.
 */
function EmbeddQueueStatus({
  workspaceId,
  workspaceName,
  refreshKey,
}: {
  workspaceId: string
  workspaceName: string
  /** Bump to force an immediate re-poll (e.g. right after a reindex enqueue). */
  refreshKey: number
}) {
  const { showToast } = useToast()
  const [queue, setQueue] = useState<WorkspaceEmbeddQueue | null>(null)
  const [busy, setBusy] = useState(false)

  const poll = useCallback(() => (
    getWorkspaceEmbeddStatus(workspaceId).then(setQueue).catch(() => { /* transient — keep the last readout */ })
  ), [workspaceId])

  useEffect(() => {
    void poll()
    // Poll only while there is something to watch; an idle queue re-checks on
    // the next refreshKey bump instead of burning requests forever.
    const timer = window.setInterval(() => {
      setQueue(prev => {
        if (prev && (prev.pending > 0 || prev.draining)) { void poll() }
        return prev
      })
    }, 3000)
    return () => window.clearInterval(timer)
  }, [poll, refreshKey])

  const toggle = async () => {
    if (!queue) { return }
    setBusy(true)
    try {
      const res = await setEmbeddPaused(!queue.paused, workspaceName)
      showToast({
        title: res.paused ? 'Embedding paused' : 'Embedding resumed',
        description: res.paused
          ? `${res.pending.toLocaleString()} job(s) held for this workspace — resume any time (a restart also resumes)`
          : `${res.pending.toLocaleString()} job(s) draining`,
      })
      await poll()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to toggle embedding queue (admin only)', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (!queue) { return null }

  return (
    <section className="flex items-center justify-between gap-4 rounded-lg border px-4 py-2.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">Queue</span>
        <span className="text-muted-foreground">
          {queue.pending > 0
            ? <>{queue.pending.toLocaleString()} pending{queue.draining ? ' · running' : ''}{queue.paused ? ' · paused' : ''}</>
            : (queue.paused ? 'paused' : 'idle')}
        </span>
        {queue.ingestDisabled && (
          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning" title="CANVAS_EMBEDD_INGEST_DISABLED=true — nothing new is enqueued; existing vectors still serve search">
            ingest disabled
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        title={queue.paused
          ? 'Resume embedding — the held backlog drains'
          : 'Pause embedding after the current batch — stops the CPU-heavy model inference; documents keep indexing and stay searchable via full-text'}
      >
        {busy ? '…' : queue.paused ? 'Resume' : 'Pause'}
      </button>
    </section>
  )
}

/** Superseded models: still on disk, still instantly revertible until reclaimed. */
function VectorTableList({
  workspaceId,
  tables,
  error,
  onChanged,
}: {
  workspaceId: string
  tables: VectorTable[]
  error?: string
  onChanged: () => void
}) {
  const { showToast } = useToast()
  const [dropping, setDropping] = useState<string | null>(null)

  const superseded = tables.filter(t => !t.active)
  const live = tables.filter(t => t.active)

  const reclaim = async (table: VectorTable) => {
    if (!window.confirm(
      `Reclaim "${table.name}"?\n\n`
      + `This permanently deletes the vectors for ${table.model || 'that model'} and its "already embedded" ledger. `
      + `Switching back to it afterwards would cost a full re-embed rather than being instant.\n\n`
      + `This is the only irreversible step in the whole flow.`,
    )) { return }
    setDropping(table.name)
    try {
      const result = await dropWorkspaceVectorTable(workspaceId, table.name)
      if (!result.dropped) { throw new Error(result.error || 'Failed to drop vector table') }
      showToast({ title: 'Reclaimed', description: `Dropped '${result.name || table.name}'.` })
      onChanged()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to reclaim', variant: 'destructive' })
    } finally {
      setDropping(null)
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Archive className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Vector tables</h3>
      </div>

      {error && (
        <p className="mb-3 text-xs text-destructive">{error}</p>
      )}

      {live.length > 0 && (
        <div className="mb-3 space-y-1">
          {live.map(t => (
            <div key={t.name} className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
              <span className="font-mono text-[11px]">{t.name}</span>
              <span className="text-[11px] text-muted-foreground">
                live · {t.space} · {t.model || 'unknown model'}{t.dim ? ` · ${t.dim}-d` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {superseded.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No superseded models. After a model switch the previous table stays here — that is what makes reverting free.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Previous models. Each still holds its vectors and its ledger, so switching back to one is instant and costs
            no re-embedding — until you reclaim it.
          </p>
          {superseded.map(t => (
            <div key={t.name} className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px]">{t.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t.model || 'unknown model'}{t.dim ? ` · ${t.dim}-d` : ''}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={dropping === t.name}
                onClick={() => reclaim(t)}
                title="Permanently delete this model's vectors and ledger — the only irreversible step here"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {dropping === t.name ? 'Reclaiming…' : 'Reclaim'}
              </Button>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

/**
 * Fill a space. Scope narrows the run to one subtree so a candidate model can be
 * evaluated on a single project before the whole workspace is committed to it.
 */
function ReindexControl({
  workspaceId,
  workspaceName,
  spaces,
  highlight,
  onDone,
}: {
  workspaceId: string
  workspaceName: string
  spaces: string[]
  /** Spaces whose table just went empty — the reason this control is prompting. */
  highlight: string[]
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [space, setSpace] = useState('')
  const [scope, setScope] = useState('')
  const [reindex, setReindex] = useState(false)
  const [running, setRunning] = useState(false)
  const [picking, setPicking] = useState(false)

  const run = async () => {
    setRunning(true)
    try {
      const result = await reindexWorkspaceEmbeddings(workspaceId, {
        space: space || undefined,
        reindex,
        scope: scope.trim() || undefined,
      })
      if (result.ingestDisabled) {
        showToast({
          title: 'Ingest disabled',
          description: 'CANVAS_EMBEDD_INGEST_DISABLED=true — nothing was enqueued. Existing vectors still serve search.',
          variant: 'destructive',
        })
      } else {
        showToast({
          title: 'Reindex enqueued',
          description: `${result.enqueued.toLocaleString()} document(s) enqueued${result.scope ? ` under ${result.scope}` : ''}. The queue readout above reports progress.`,
        })
      }
      onDone()
    } catch (err) {
      showToast({ title: 'Reindex failed', description: err instanceof Error ? err.message : 'Failed to reindex', variant: 'destructive' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Reindex</h3>
      </div>

      {highlight.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-warning">
              {highlight.join(', ')} now {highlight.length === 1 ? 'points' : 'point'} at a new, empty table
            </p>
            <p className="mt-0.5 text-muted-foreground">
              The switch is already live, but nothing is embedded there yet — dense search stays thin for that space
              until you fill it. Reverting the model is still instant; the previous vectors were never touched.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Space</label>
          <select className={`${selectClass} w-full`} value={space} onChange={e => setSpace(e.target.value)}>
            <option value="">all spaces</option>
            {spaces.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Scope (optional)</label>
          <div className="flex gap-2">
            <Input
              value={scope}
              onChange={e => setScope(e.target.value)}
              placeholder="ctx://work/project or dir://photos"
              className="h-8 text-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => setPicking(true)} title="Pick a context or directory path from the tree">
              <FolderSearch className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <label className="mt-3 flex items-start gap-2 text-xs">
        <input type="checkbox" className="mt-0.5" checked={reindex} onChange={e => setReindex(e.target.checked)} />
        <span>
          Re-embed documents already embedded
          {reindex && scope.trim() && (
            <span className="mt-1 block text-[11px] text-warning">
              Heads up: combined with a scope this clears the WHOLE space, not just the scoped subtree — a partial
              clear is not expressible in the bitmap ledger. Scoped runs are for incrementally <em>filling</em> a new
              model; leave this off unless you mean to redo everything.
            </span>
          )}
        </span>
      </label>

      <div className="mt-3">
        <Button type="button" size="sm" variant="outline" onClick={run} disabled={running}>
          {running ? 'Enqueuing…' : 'Run reindex'}
        </Button>
      </div>

      {picking && createPortal(
        <div className="fixed inset-0 z-picker flex items-center justify-center bg-scrim p-4 max-md:p-2">
          <LinkToCard
            fixedWorkspaceName={workspaceName}
            multiple={false}
            onClose={() => setPicking(false)}
            onConfirm={(paths, ctx) => {
              const picked = paths[0]
              if (picked) {
                // The tree tab decides the scheme the server resolves against.
                const scheme = ctx.treeType === 'directory' ? 'dir' : 'ctx'
                setScope(`${scheme}://${picked.replace(/^\/+/, '')}`)
              }
              setPicking(false)
            }}
          />
        </div>,
        window.document.body,
      )}
    </section>
  )
}

export function EmbeddSettingsPanel({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string
  workspaceName: string
}) {
  const { showToast } = useToast()
  const [config, setConfig] = useState<WorkspaceEmbeddConfig | null>(null)
  const [tables, setTables] = useState<VectorTable[]>([])
  const [tablesError, setTablesError] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Spaces whose table went empty on the last save — drives the reindex prompt.
  const [movedSpaces, setMovedSpaces] = useState<string[]>([])
  // Bumped whenever an action changed the queue, to re-poll the status strip.
  const [queueRefresh, setQueueRefresh] = useState(0)

  // Both loaders touch state only from their async callbacks, never
  // synchronously — the mount effect below would otherwise cascade renders.
  const load = useCallback(() => (
    getWorkspaceEmbeddConfig(workspaceId)
      .then(cfg => { setConfig(cfg); setLoadError(null) })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load embedding config'))
      .finally(() => setLoading(false))
  ), [workspaceId])

  const loadTables = useCallback(() => (
    listWorkspaceVectorTables(workspaceId)
      .then(result => { setTables(result.tables || []); setTablesError(result.error) })
      .catch(err => setTablesError(err instanceof Error ? err.message : 'Failed to list vector tables'))
  ), [workspaceId])

  useEffect(() => { void load(); void loadTables() }, [load, loadTables])

  const refresh = () => { setLoading(true); void load(); void loadTables() }

  const save = async (next: EmbeddConfig) => {
    setSaving(true)
    try {
      const result = await saveWorkspaceEmbeddConfig(workspaceId, next)
      setMovedSpaces(result.movedSpaces || [])
      if (result.movedSpaces?.length) {
        showToast({
          title: 'Saved — reindex to fill',
          description: `${result.movedSpaces.join(', ')} now targets a new model. The switch is live, but the new table is empty until you reindex.`,
        })
      } else if (result.applied === false) {
        showToast({
          title: 'Saved — not yet live',
          description: 'The workspace is not running, so the new spaces apply when it next starts.',
        })
      } else {
        showToast({ title: 'Saved', description: 'Embedding config updated.' })
      }
      await load()
      await loadTables()
    } catch (err) {
      // 400s carry the reason verbatim (a rejected endpoint names the provider);
      // pass it straight through rather than flattening it.
      showToast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading embedding config…
      </div>
    )
  }

  if (loadError || !config) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Embedding config unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">{loadError || 'No config returned.'}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={refresh}>Retry</Button>
      </div>
    )
  }

  const spaceNames = Object.keys(config.effective.spaces || {}).sort()

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Stored in this workspace's own <span className="font-mono">workspace.json</span>, so it travels with the
          workspace. Resolution is layered: built-in → server → your defaults → <strong>this workspace</strong>.
          Changes apply live — no restart.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => { refresh(); setQueueRefresh(n => n + 1) }}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <EmbeddQueueStatus workspaceId={workspaceId} workspaceName={workspaceName} refreshKey={queueRefresh} />

      <EmbeddConfigEditor
        // Remount on reload so the draft restarts from freshly-saved server state
        // instead of holding stale overrides.
        key={JSON.stringify(config.workspace)}
        value={config.workspace || {}}
        effective={config.effective || {}}
        inherited={config.inherited || {}}
        resolvedSpaces={config.spaces}
        invalid={config.invalid}
        saving={saving}
        saveLabel="Save embedding config"
        onSave={save}
      />

      <ReindexControl
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        spaces={spaceNames}
        highlight={movedSpaces}
        onDone={() => { void loadTables(); setQueueRefresh(n => n + 1) }}
      />

      <VectorTableList
        workspaceId={workspaceId}
        tables={tables}
        error={tablesError}
        onChanged={() => { void loadTables() }}
      />
    </div>
  )
}

export default EmbeddSettingsPanel

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, FolderSearch, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast-container'
import { LinkToCard } from '@/components/menu/shared/LinkToCard'
import { InferdConfigEditor } from './inferd-config-editor'
import {
  dropWorkspaceVectorTable,
  getWorkspaceInferdConfig,
  getWorkspaceInferdStatus,
  listWorkspaceVectorTables,
  reindexWorkspaceEmbeddings,
  saveWorkspaceInferdConfig,
  startWorkspaceImageSummaries,
  type ImageSummaryStatus,
  type InferdConfig,
  type VectorTable,
  type WorkspaceInferdConfig,
  type WorkspaceInferdQueue,
} from '@/services/inferd'
import { setInferdPaused } from '@/services/workspace'

/**
 * Workspace → Settings → Database → Embeddings.
 *
 * The primary surface for choosing embedding backends, because the config lives
 * in this workspace's own workspace.json and therefore travels with it.
 *
 * The whole flow is designed to be reversible, and the UI's job is to make that
 * legible: switch (live, no restart) → fill → revert if it disappointed →
 * reclaim only once you are sure. Only the last step destroys anything, which is
 * why it is the only one behind a confirm.
 *
 * Layout follows from that: one status line for what the pipeline is doing right
 * now, the spaces themselves as the body, and the two destructive-or-expensive
 * operations (a broad refill, reclaiming disk) folded away until asked for.
 */

const selectClass = 'h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring'

/** Small disclosure used for the two folded-away operations. */
function Fold({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t p-4">{children}</div>}
    </section>
  )
}

/**
 * What the pipeline is doing right now, in one line: queue state on the left,
 * where this config comes from on the right. Polls only while there is
 * something to watch — an idle queue re-checks on the next refresh instead of
 * burning requests forever.
 */
function PipelineStatus({
  workspaceId,
  workspaceName,
  refreshKey,
  onRefresh,
}: {
  workspaceId: string
  workspaceName: string
  refreshKey: number
  onRefresh: () => void
}) {
  const { showToast } = useToast()
  const [queue, setQueue] = useState<WorkspaceInferdQueue | null>(null)
  const [busy, setBusy] = useState(false)

  const poll = useCallback(() => (
    getWorkspaceInferdStatus(workspaceId)
      .then(status => setQueue(status.queue ?? null))
      .catch(() => { /* transient — keep the last readout */ })
  ), [workspaceId])

  useEffect(() => {
    void poll()
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
      const res = await setInferdPaused(!queue.paused, workspaceName)
      showToast({
        title: res.paused ? 'Embedding paused' : 'Embedding resumed',
        description: res.paused
          ? `${res.pending.toLocaleString()} job(s) held for this workspace — resume any time, and a restart also resumes.`
          : `${res.pending.toLocaleString()} job(s) draining.`,
      })
      await poll()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to toggle the embedding queue (admin only)', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const running = Boolean(queue?.draining)
  const dot = !queue
    ? 'bg-muted-foreground/40'
    : queue.paused
      ? 'bg-warning'
      : running
        ? 'bg-success'
        : 'bg-muted-foreground/40'

  return (
    <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-muted/30 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          {/* The ping is the one piece of motion here, and it only runs while
              work is actually draining — an idle dot stays still. */}
          {running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', dot)} />
        </span>
        <span className="font-medium">
          {!queue
            ? 'Queue unavailable'
            : queue.pending > 0
              ? <>{queue.pending.toLocaleString()} <span className="font-normal text-muted-foreground">pending</span></>
              : queue.paused ? 'Paused' : 'Idle'}
        </span>
        {queue?.paused && queue.pending > 0 && <span className="text-xs text-muted-foreground">held</span>}
        {queue?.ingestDisabled && (
          <span
            className="rounded bg-warning-subtle px-1.5 py-0.5 text-[10px] font-medium text-warning"
            title="CANVAS_INFERD_INGEST_DISABLED=true — nothing new is enqueued; existing vectors still serve search"
          >
            ingest disabled
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {queue && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={toggle}
            title={queue.paused
              ? 'Resume embedding — the held backlog drains'
              : 'Pause after the current batch. Stops the CPU-heavy model inference; documents keep indexing and stay searchable by text.'}
          >
            {busy ? '…' : queue.paused ? 'Resume' : 'Pause'}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onRefresh} title="Reload config, queue and tables">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  )
}

/** Superseded models: still on disk, still instantly revertible until reclaimed. */
function SupersededTables({
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

  // The live table for each space is already named on its row above, so only
  // the superseded ones are worth a list of their own.
  const superseded = tables.filter(t => !t.active)

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
      if (!result.dropped) { throw new Error(result.error || 'Failed to drop the vector table') }
      showToast({ title: 'Reclaimed', description: `Dropped '${result.name || table.name}'.` })
      onChanged()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to reclaim', variant: 'destructive' })
    } finally {
      setDropping(null)
    }
  }

  if (error) {
    return (
      <section className="rounded-lg border border-destructive/40 bg-destructive-subtle p-4">
        <p className="text-sm font-medium text-destructive">Vector tables unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </section>
    )
  }

  if (superseded.length === 0) { return null }

  return (
    <Fold
      title={`Previous models (${superseded.length})`}
      hint="Kept on disk so switching back is instant. Reclaiming deletes their vectors for good — the only irreversible step here."
    >
      <div className="divide-y">
        {superseded.map(t => (
          <div key={t.name} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs">{t.model || 'unknown model'}{t.dim ? ` · ${t.dim}-d` : ''}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">└─ {t.name}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={dropping === t.name}
              onClick={() => reclaim(t)}
              title="Permanently delete this model's vectors and ledger"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {dropping === t.name ? 'Reclaiming…' : 'Reclaim'}
            </Button>
          </div>
        ))}
      </div>
    </Fold>
  )
}

/**
 * A broader fill than the per-space button on a row: pick the space, narrow it
 * to a subtree, or redo work already done. Folded away because the common case
 * is now one click on the row that needs it.
 */
function AdvancedFill({
  workspaceId,
  workspaceName,
  spaces,
  onDone,
}: {
  workspaceId: string
  workspaceName: string
  spaces: string[]
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
          description: 'CANVAS_INFERD_INGEST_DISABLED=true — nothing was enqueued. Existing vectors still serve search.',
          variant: 'destructive',
        })
      } else {
        showToast({
          title: 'Fill enqueued',
          description: `${result.enqueued.toLocaleString()} document(s) queued${result.scope ? ` under ${result.scope}` : ''}. The status line reports progress.`,
        })
      }
      onDone()
    } catch (err) {
      showToast({ title: 'Fill failed', description: err instanceof Error ? err.message : 'Failed to enqueue', variant: 'destructive' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Fold
      title="Fill a space"
      hint="Embed documents that are missing from a space. Narrow it to one subtree to try a model on a single project first."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Space</label>
          <select className={`${selectClass} w-full`} value={space} onChange={e => setSpace(e.target.value)}>
            <option value="">all spaces</option>
            {spaces.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Limit to a path <span className="font-normal text-muted-foreground">(optional)</span></label>
          <div className="flex gap-2">
            <Input
              value={scope}
              onChange={e => setScope(e.target.value)}
              placeholder="ctx://work/project or dir://photos"
              className="h-8 font-mono text-sm"
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
          Re-embed documents that are already embedded
          {reindex && scope.trim() && (
            <span className="mt-1 block text-[11px] text-warning">
              Combined with a path limit this clears the WHOLE space, not just that subtree — a partial clear is not
              expressible in the ledger. Leave this off unless you mean to redo everything.
            </span>
          )}
        </span>
      </label>

      <Button type="button" size="sm" className="mt-3" onClick={run} disabled={running}>
        {running ? 'Queueing…' : 'Start fill'}
      </Button>

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
    </Fold>
  )
}

/** Caption backends the summarize.image path actually supports today. */
const IMAGE_CAPTION_BACKENDS = [
  {
    provider: 'blip',
    model: 'Xenova/vit-gpt2-image-captioning',
    label: 'Local captioner (vit-gpt2 / ONNX)',
  },
] as const

/**
 * Image captions via the local Transformers.js worker (`blip` provider).
 * Results land in `metadata.summary` (FTS + reserved text-space chunk).
 */
function SummarizeControls({
  workspaceId,
  config,
  saving,
  onSave,
}: {
  workspaceId: string
  config: WorkspaceInferdConfig
  saving: boolean
  onSave: (next: InferdConfig) => Promise<void>
}) {
  const { showToast } = useToast()
  const workspace = config.workspace || {}
  const effective = config.effective || {}
  const defaultBackend = IMAGE_CAPTION_BACKENDS[0]
  const [enabled, setEnabled] = useState(() => effective.summarize?.image?.enabled === true || workspace.summarize?.image?.enabled === true)
  const [backendKey, setBackendKey] = useState(() => {
    const provider = workspace.summarize?.image?.provider || effective.summarize?.image?.provider || defaultBackend.provider
    const model = workspace.summarize?.image?.model || effective.summarize?.image?.model || defaultBackend.model
    const match = IMAGE_CAPTION_BACKENDS.find(b => b.provider === provider && b.model === model)
    return match ? `${match.provider}::${match.model}` : `${defaultBackend.provider}::${defaultBackend.model}`
  })
  const [dirty, setDirty] = useState(false)
  const [summaryStatus, setSummaryStatus] = useState<ImageSummaryStatus | null>(null)
  const [starting, setStarting] = useState(false)

  const backend = IMAGE_CAPTION_BACKENDS.find(b => `${b.provider}::${b.model}` === backendKey) || defaultBackend

  const pollSummarize = useCallback(() => (
    getWorkspaceInferdStatus(workspaceId)
      .then(status => setSummaryStatus(status.summarize || null))
      .catch(() => { /* keep last */ })
  ), [workspaceId])

  useEffect(() => {
    void pollSummarize()
    const timer = window.setInterval(() => {
      setSummaryStatus(prev => {
        if (prev?.running) { void pollSummarize() }
        return prev
      })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [pollSummarize])

  const save = async () => {
    await onSave({
      ...workspace,
      summarize: {
        ...(workspace.summarize || {}),
        image: { enabled, provider: backend.provider, model: backend.model },
      },
    })
    setDirty(false)
  }

  const generate = async (force = false) => {
    setStarting(true)
    try {
      const status = await startWorkspaceImageSummaries(workspaceId, { force })
      setSummaryStatus(status)
      showToast({
        title: force ? 'Regenerating image summaries' : 'Generating image summaries',
        description: `${status.total.toLocaleString()} image(s) queued. First run may download model weights.`,
      })
    } catch (err) {
      showToast({
        title: 'Summaries failed to start',
        description: err instanceof Error ? err.message : 'Failed to start',
        variant: 'destructive',
      })
    } finally {
      setStarting(false)
    }
  }

  const imageEnabled = effective.summarize?.image?.enabled === true
  const running = summaryStatus?.running === true
  const firstError = summaryStatus?.errors?.[0]?.error

  return (
    <Fold
      title="Summaries"
      hint="Generate descriptions for indexed images (metadata.summary) — searchable via full-text and dense search"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={saving}
              onChange={e => { setEnabled(e.target.checked); setDirty(true) }}
            />
            Images
          </label>
          <select
            className={selectClass}
            value={`${backend.provider}::${backend.model}`}
            disabled={saving || !enabled}
            onChange={e => { setBackendKey(e.target.value); setDirty(true) }}
          >
            {IMAGE_CAPTION_BACKENDS.map(b => (
              <option key={`${b.provider}::${b.model}`} value={`${b.provider}::${b.model}`}>
                {b.label}
              </option>
            ))}
          </select>
          <span className="font-mono text-xs text-muted-foreground">{backend.model}</span>
        </div>
        {summaryStatus && (summaryStatus.running || summaryStatus.total > 0 || summaryStatus.finishedAt) && (
          <p className="text-xs text-muted-foreground">
            {running ? 'Running' : 'Last run'}: {summaryStatus.described}/{summaryStatus.total} described
            {summaryStatus.skipped ? `, ${summaryStatus.skipped} skipped` : ''}
            {summaryStatus.failed ? `, ${summaryStatus.failed} failed` : ''}
            {firstError ? ` — ${firstError}` : ''}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Enable + save, then generate. Only the local caption provider is wired today.
            Candidates come from <span className="font-mono">data/mime/image</span>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving || !dirty}>
              Save summaries
            </Button>
            <Button
              size="sm"
              onClick={() => void generate(false)}
              disabled={saving || dirty || starting || running || !imageEnabled}
              title={!imageEnabled ? 'Enable image summaries and save first' : dirty ? 'Save config first' : undefined}
            >
              {running || starting ? 'Generating…' : 'Generate summaries'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void generate(true)}
              disabled={saving || dirty || starting || running || !imageEnabled}
              title="Overwrite existing metadata.summary values"
            >
              Force
            </Button>
          </div>
        </div>
      </div>
    </Fold>
  )
}

export function InferdSettingsPanel({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string
  workspaceName: string
}) {
  const { showToast } = useToast()
  const [config, setConfig] = useState<WorkspaceInferdConfig | null>(null)
  const [tables, setTables] = useState<VectorTable[]>([])
  const [tablesError, setTablesError] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Spaces whose table went empty on the last save — each row offers to fill.
  const [movedSpaces, setMovedSpaces] = useState<string[]>([])
  // Bumped whenever an action changed the queue, to re-poll the status line.
  const [queueRefresh, setQueueRefresh] = useState(0)

  // Both loaders touch state only from their async callbacks, never
  // synchronously — the mount effect below would otherwise cascade renders.
  const load = useCallback(() => (
    getWorkspaceInferdConfig(workspaceId)
      .then(cfg => { setConfig(cfg); setLoadError(null) })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load the embedding config'))
      .finally(() => setLoading(false))
  ), [workspaceId])

  const loadTables = useCallback(() => (
    listWorkspaceVectorTables(workspaceId)
      .then(result => { setTables(result.tables || []); setTablesError(result.error) })
      .catch(err => setTablesError(err instanceof Error ? err.message : 'Failed to list vector tables'))
  ), [workspaceId])

  useEffect(() => { void load(); void loadTables() }, [load, loadTables])

  const refresh = () => { setLoading(true); void load(); void loadTables(); setQueueRefresh(n => n + 1) }

  const save = async (next: InferdConfig) => {
    setSaving(true)
    try {
      const result = await saveWorkspaceInferdConfig(workspaceId, next)
      setMovedSpaces(result.movedSpaces || [])
      if (result.movedSpaces?.length) {
        showToast({
          title: 'Saved — fill to finish',
          description: `${result.movedSpaces.join(', ')} now targets a new model. The switch is live, but the new table is empty until you fill it.`,
        })
      } else if (result.applied === false) {
        showToast({
          title: 'Saved — applies on next start',
          description: 'The workspace is not running, so the new spaces take effect when it starts.',
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

  /** One-click fill for the space a row is prompting about. */
  const fillSpace = async (space: string) => {
    try {
      const result = await reindexWorkspaceEmbeddings(workspaceId, { space })
      if (result.ingestDisabled) {
        showToast({
          title: 'Ingest disabled',
          description: 'CANVAS_INFERD_INGEST_DISABLED=true — nothing was enqueued. Existing vectors still serve search.',
          variant: 'destructive',
        })
        return
      }
      showToast({
        title: `Filling ${space}`,
        description: `${result.enqueued.toLocaleString()} document(s) queued. The status line reports progress.`,
      })
      setMovedSpaces(prev => prev.filter(s => s !== space))
      setQueueRefresh(n => n + 1)
      void loadTables()
    } catch (err) {
      showToast({ title: 'Fill failed', description: err instanceof Error ? err.message : 'Failed to enqueue', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading the embedding config…
      </div>
    )
  }

  if (loadError || !config) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-destructive/40 bg-destructive-subtle p-4 text-sm">
          <p className="font-medium text-destructive">Embedding config unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">{loadError || 'No config returned.'}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={refresh}>Try again</Button>
      </div>
    )
  }

  const spaceNames = Object.keys(config.effective.spaces || {}).sort()

  return (
    <div className="space-y-5">
      <PipelineStatus
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        refreshKey={queueRefresh}
        onRefresh={refresh}
      />

      <InferdConfigEditor
        // Remount on reload so the draft restarts from freshly-saved server state
        // instead of holding stale overrides.
        key={JSON.stringify(config.workspace)}
        value={config.workspace || {}}
        effective={config.effective || {}}
        inherited={config.inherited || {}}
        resolvedSpaces={config.spaces}
        invalid={config.invalid}
        attention={movedSpaces}
        onFill={fillSpace}
        saving={saving}
        saveLabel="Save embedding config"
        onSave={save}
      />

      <div className="space-y-3">
        <SummarizeControls
          // Remount on config reload so the draft resets from saved state.
          key={`summarize:${JSON.stringify(config.workspace?.summarize || {})}`}
          workspaceId={workspaceId}
          config={config}
          saving={saving}
          onSave={save}
        />

        <AdvancedFill
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          spaces={spaceNames}
          onDone={() => { void loadTables(); setQueueRefresh(n => n + 1) }}
        />

        <SupersededTables
          workspaceId={workspaceId}
          tables={tables}
          error={tablesError}
          onChanged={() => { void loadTables() }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Stored in this workspace's own <span className="font-mono">workspace.json</span>, so it travels with the
        workspace. Settings resolve in layers — built-in, then server, then your defaults, then this workspace, which
        wins. Changes apply live, with no restart.
      </p>
    </div>
  )
}

export default InferdSettingsPanel

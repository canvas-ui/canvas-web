import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, FolderSearch, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from '@/components/menu/shared/LinkToSidePanel'
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
  stopWorkspaceImageSummaries,
  type ImageSummaryStatus,
  type InferdConfig,
  type VectorTable,
  type WorkspaceInferdConfig,
  type WorkspaceInferdQueue,
} from '@/services/inferd'
import { setInferdPaused } from '@/services/workspace'
import { spaceLabel } from '@/lib/search-labels'

/**
 * Workspace → Settings → Search & indexing → meaning search and image descriptions.
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
 * Optional path limit for a bulk run. The tree the user picks from decides the
 * scheme the server resolves against: `ctx://` for contexts, `dir://` for
 * directories.
 */
function PathScopeInput({
  workspaceName,
  value,
  onChange,
  disabled,
}: {
  workspaceName: string
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">Only this folder <span className="font-normal text-muted-foreground">(optional)</span></label>
      <div className="flex gap-2">
        <Input
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          placeholder="Whole workspace"
          className="h-8 font-mono text-sm"
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setPicking(true)} title="Pick a folder or context from the tree">
          <FolderSearch className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Includes everything below it. Pick from the tree, or type <span className="font-mono">ctx://work/project</span> or{' '}
        <span className="font-mono">dir://photos</span>.
      </p>
      {picking && (
        <LinkToSidePanel onClose={() => setPicking(false)}>
          <LinkToCard
            sizeClassName={LINK_TO_SIDE_SIZE}
            fixedWorkspaceName={workspaceName}
            multiple={false}
            onClose={() => setPicking(false)}
            onConfirm={(paths, ctx) => {
              const picked = paths[0]
              if (picked) {
                const scheme = ctx.treeType === 'directory' ? 'dir' : 'ctx'
                onChange(`${scheme}://${picked.replace(/^\/+/, '')}`)
              }
              setPicking(false)
            }}
          />
        </LinkToSidePanel>
      )}
    </div>
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
        title: res.paused ? 'Indexing paused' : 'Indexing resumed',
        description: res.paused
          ? `${res.pending.toLocaleString()} document(s) on hold. Resume any time; a server restart also resumes.`
          : `${res.pending.toLocaleString()} document(s) being indexed.`,
      })
      await poll()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to pause or resume indexing (admin only)', variant: 'destructive' })
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
            ? 'Inference service not reachable'
            : queue.pending > 0
              ? <>{queue.pending.toLocaleString()} <span className="font-normal text-muted-foreground">document(s) waiting to be indexed</span></>
              : queue.paused ? 'Paused' : 'Up to date'}
        </span>
        {queue?.paused && queue.pending > 0 && <span className="text-xs text-muted-foreground">(paused)</span>}
        {queue?.ingestDisabled && (
          <span
            className="rounded bg-warning-subtle px-1.5 py-0.5 text-[10px] font-medium text-warning"
            title="CANVAS_INFERD_INGEST_DISABLED=true: new documents are not indexed for meaning search; what is already indexed still works"
          >
            indexing turned off on the server
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
              ? 'Resume; the waiting documents get indexed'
              : 'Pause after the current batch. Stops the CPU-heavy model work; new documents are still found by word search.'}
          >
            {busy ? '…' : queue.paused ? 'Resume' : 'Pause'}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onRefresh} title="Reload">
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
      + `This permanently deletes the index built with ${table.model || 'that model'}. `
      + `Switching back to it afterwards means indexing every document again instead of being instant.\n\n`
      + `This is the only step here that cannot be undone.`,
    )) { return }
    setDropping(table.name)
    try {
      const result = await dropWorkspaceVectorTable(workspaceId, table.name)
      if (!result.dropped) { throw new Error(result.error || 'Failed to drop the vector table') }
      showToast({ title: 'Deleted', description: `Removed '${result.name || table.name}'.` })
      onChanged()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete', variant: 'destructive' })
    } finally {
      setDropping(null)
    }
  }

  if (error) {
    return (
      <section className="rounded-lg border border-destructive/40 bg-destructive-subtle p-4">
        <p className="text-sm font-medium text-destructive">Stored indexes unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </section>
    )
  }

  if (superseded.length === 0) { return null }

  return (
    <Fold
      title={`Previous models (${superseded.length})`}
      hint="Indexes built with models you switched away from. They stay on disk so switching back is instant. Deleting one frees the space for good."
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
              title="Permanently delete the index built with this model"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {dropping === t.name ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        ))}
      </div>
    </Fold>
  )
}

/**
 * A broader fill than the per-space button on a row: pick the content type,
 * narrow it to a subtree, or redo work already done. Folded away because the
 * common case is one click on the row that needs it.
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
          title: 'Indexing is turned off on the server',
          description: 'CANVAS_INFERD_INGEST_DISABLED=true: nothing was queued. What is already indexed still works.',
          variant: 'destructive',
        })
      } else {
        showToast({
          title: 'Indexing queued',
          description: `${result.enqueued.toLocaleString()} document(s) queued${result.scope ? ` under ${result.scope}` : ''}. The status line above shows progress.`,
        })
      }
      onDone()
    } catch (err) {
      showToast({ title: 'Indexing failed to start', description: err instanceof Error ? err.message : 'Failed to queue', variant: 'destructive' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Fold
      title="Index existing documents"
      hint="Add documents that are not in meaning search yet, for example after switching models. Limit it to one folder to try a model on a small set first."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Content type</label>
          <select className={`${selectClass} w-full`} value={space} onChange={e => setSpace(e.target.value)}>
            <option value="">All content types</option>
            {spaces.map(s => <option key={s} value={s}>{spaceLabel(s)}</option>)}
          </select>
        </div>

        <PathScopeInput workspaceName={workspaceName} value={scope} onChange={setScope} disabled={running} />
      </div>

      <label className="mt-3 flex items-start gap-2 text-xs">
        <input type="checkbox" className="mt-0.5" checked={reindex} onChange={e => setReindex(e.target.checked)} />
        <span>
          Also redo documents that are already indexed
          {reindex && scope.trim() && (
            <span className="mt-1 block text-[11px] text-warning">
              Even with a folder limit, this clears the whole index for the chosen content type, not just that folder.
              Leave it off unless you want to redo everything.
            </span>
          )}
        </span>
      </label>

      <Button type="button" size="sm" className="mt-3" onClick={run} disabled={running}>
        {running ? 'Queueing…' : 'Start indexing'}
      </Button>
    </Fold>
  )
}

/**
 * Caption backends the summarize.image path actually supports today, best
 * first. All run locally in the forked Transformers.js worker.
 *
 * `task` is the model FAMILY — it decides how the model is driven, so it
 * cannot be inferred safely for a hand-typed model id (hence the field on the
 * custom option too). The BLIP ONNX repos are all gated on the Hub now, which
 * is why there is no BLIP entry here.
 */
const IMAGE_CAPTION_BACKENDS = [
  {
    provider: 'blip',
    model: 'HuggingFaceTB/SmolVLM-500M-Instruct',
    task: 'instruct' as const,
    label: 'SmolVLM 500M: follows your instructions (recommended)',
    note: 'About 500 MB. Follows the instructions below, so you can ask for what matters to you, such as style, materials or setting.',
  },
  {
    provider: 'blip',
    model: 'HuggingFaceTB/SmolVLM-256M-Instruct',
    task: 'instruct' as const,
    label: 'SmolVLM 256M: smaller, follows your instructions',
    note: 'About 250 MB. Same instructions, less detail; for servers short on memory.',
  },
  {
    provider: 'blip',
    model: 'onnx-community/Florence-2-base-ft',
    task: 'florence2' as const,
    label: 'Florence-2 base: detailed, fixed style',
    note: 'Writes several detailed sentences, but ignores instructions.',
  },
  {
    provider: 'blip',
    model: 'Xenova/vit-gpt2-image-captioning',
    task: 'caption' as const,
    label: 'vit-gpt2: one short sentence (smallest)',
    note: 'One terse sentence per image, sometimes repetitive. Uses the least memory.',
  },
] as const

const CUSTOM_BACKEND_KEY = 'custom'

const CAPTION_TASKS = [
  { value: 'instruct', label: 'Follows instructions (instruct VLM)' },
  { value: 'florence2', label: 'Florence-2 family' },
  { value: 'caption', label: 'Plain captioner, image only' },
] as const

const DEFAULT_CAPTION_PROMPT = 'Describe this photograph in two or three sentences. '
  + 'If it shows a building or interior, name the architectural style, the main materials and the setting. '
  + 'Describe only what is visible.'

/**
 * Image descriptions via the local Transformers.js worker (`blip` provider).
 * Results land in `metadata.summary`, which word search and text meaning search
 * both index.
 */
function SummarizeControls({
  workspaceId,
  workspaceName,
  config,
  saving,
  onSave,
}: {
  workspaceId: string
  workspaceName: string
  config: WorkspaceInferdConfig
  saving: boolean
  onSave: (next: InferdConfig) => Promise<void>
}) {
  const { showToast } = useToast()
  const workspace = config.workspace || {}
  const effective = config.effective || {}
  const defaultBackend = IMAGE_CAPTION_BACKENDS[0]
  const saved = workspace.summarize?.image || effective.summarize?.image || {}
  const [enabled, setEnabled] = useState(() => effective.summarize?.image?.enabled === true || workspace.summarize?.image?.enabled === true)
  // A model the picker doesn't know is kept as-is under `custom` rather than
  // being silently snapped back to a listed one — the config layer accepts any
  // model id and a hand-set one must survive a visit to this panel.
  const [backendKey, setBackendKey] = useState(() => {
    const match = IMAGE_CAPTION_BACKENDS.find(b => b.provider === (saved.provider || defaultBackend.provider) && b.model === saved.model)
    if (match) { return `${match.provider}::${match.model}` }
    return saved.model ? CUSTOM_BACKEND_KEY : `${defaultBackend.provider}::${defaultBackend.model}`
  })
  const [customModel, setCustomModel] = useState(() => (
    IMAGE_CAPTION_BACKENDS.some(b => b.model === saved.model) ? '' : (saved.model || '')
  ))
  const [customTask, setCustomTask] = useState<'caption' | 'instruct' | 'florence2'>(() => saved.task || 'instruct')
  const [prompt, setPrompt] = useState(() => saved.prompt || '')
  const [dirty, setDirty] = useState(false)
  const [summaryStatus, setSummaryStatus] = useState<ImageSummaryStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [rebuild, setRebuild] = useState(false)
  const [scope, setScope] = useState('')

  const listed = IMAGE_CAPTION_BACKENDS.find(b => `${b.provider}::${b.model}` === backendKey)
  const isCustom = backendKey === CUSTOM_BACKEND_KEY
  const backend = isCustom
    ? { provider: defaultBackend.provider, model: customModel.trim(), task: customTask, label: 'Custom', note: '' }
    : (listed || defaultBackend)
  // Only an instruct model reads the prompt; showing the field for the others
  // would promise steering that silently does nothing.
  const promptApplies = backend.task === 'instruct'

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
        image: {
          enabled,
          provider: backend.provider,
          model: backend.model,
          task: backend.task,
          // Omit rather than send '' — an empty prompt would override the
          // worker's default with nothing.
          ...(promptApplies && prompt.trim() ? { prompt: prompt.trim() } : {}),
        },
      },
    })
    setDirty(false)
  }

  const stop = async () => {
    setStopping(true)
    try {
      setSummaryStatus(await stopWorkspaceImageSummaries(workspaceId))
      showToast({
        title: 'Stopping image descriptions',
        description: 'The current image finishes first; the rest are left for a later run.',
      })
    } catch (err) {
      showToast({
        title: 'Could not stop',
        description: err instanceof Error ? err.message : 'Failed to stop',
        variant: 'destructive',
      })
    } finally {
      setStopping(false)
    }
  }

  const generate = async (force = false) => {
    setStarting(true)
    try {
      const status = await startWorkspaceImageSummaries(workspaceId, { force, scope: scope.trim() || undefined })
      setSummaryStatus(status)
      showToast({
        title: force ? 'Describing all images again' : 'Describing images',
        description: `${status.total.toLocaleString()} image(s)${status.scope ? ` under ${status.scope}` : ''}. The first run downloads the model, which can take a few minutes.`,
      })
    } catch (err) {
      showToast({
        title: 'Image descriptions failed to start',
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
      title="Image descriptions"
      hint="A vision model writes a few sentences about each image, so you can find photos by what is in them."
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
            Describe images
          </label>
          <select
            className={selectClass}
            value={backendKey}
            disabled={saving || !enabled}
            onChange={e => { setBackendKey(e.target.value); setDirty(true) }}
          >
            {IMAGE_CAPTION_BACKENDS.map(b => (
              <option key={`${b.provider}::${b.model}`} value={`${b.provider}::${b.model}`}>
                {b.label}
              </option>
            ))}
            <option value={CUSTOM_BACKEND_KEY}>Custom model…</option>
          </select>
          {!isCustom && <span className="font-mono text-xs text-muted-foreground">{backend.model}</span>}
        </div>

        {isCustom && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 w-72 font-mono text-xs"
              placeholder="org/model-id (Hugging Face, ONNX)"
              value={customModel}
              disabled={saving || !enabled}
              onChange={e => { setCustomModel(e.target.value); setDirty(true) }}
            />
            <select
              className={selectClass}
              value={customTask}
              disabled={saving || !enabled}
              onChange={e => { setCustomTask(e.target.value as typeof customTask); setDirty(true) }}
            >
              {CAPTION_TASKS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}

        {enabled && backend.note && (
          <p className="text-xs text-muted-foreground">{backend.note}</p>
        )}

        {enabled && promptApplies && (
          <div className="space-y-1">
            <textarea
              className="w-full rounded-md border border-input bg-transparent p-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              rows={3}
              placeholder={DEFAULT_CAPTION_PROMPT}
              value={prompt}
              disabled={saving}
              onChange={e => { setPrompt(e.target.value); setDirty(true) }}
            />
            <p className="text-xs text-muted-foreground">
              What to ask about every image. Leave empty to use the default shown above. Descriptions become
              searchable, so ask for the details you would search by.
            </p>
          </div>
        )}
        {summaryStatus && (summaryStatus.running || summaryStatus.total > 0 || summaryStatus.finishedAt) && (
          <p className={cn('text-xs', summaryStatus.aborted ? 'text-destructive' : 'text-muted-foreground')}>
            {running ? 'Running' : summaryStatus.aborted ? 'Stopped' : summaryStatus.cancelled ? 'Cancelled' : 'Last run'}
            {summaryStatus.scope ? <> under <span className="font-mono">{summaryStatus.scope}</span></> : null}
            : {summaryStatus.described}/{summaryStatus.total} described
            {summaryStatus.skipped ? `, ${summaryStatus.skipped} skipped` : ''}
            {summaryStatus.failed ? `, ${summaryStatus.failed} failed` : ''}
            {/* An abort says why it stopped and that the rest were never tried —
                more useful than the first per-image error underneath it. */}
            {summaryStatus.aborted
              ? `. ${summaryStatus.abortedReason || 'The model stopped working'}. The remaining images were not tried; run again to retry.`
              : summaryStatus.cancelled
                ? '. Stopped by you. The remaining images were left untouched; run again to continue.'
                : firstError ? `. ${firstError}` : ''}
          </p>
        )}
        <PathScopeInput workspaceName={workspaceName} value={scope} onChange={setScope} disabled={saving || running} />

        {/* Same two-verb split as the indexing run: add what is missing, or
            redo everything. */}
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={rebuild}
            disabled={saving || running}
            onChange={e => setRebuild(e.target.checked)}
          />
          <span>
            Also redo images that already have a description
            {rebuild && (
              <span className="mt-1 block text-[11px] text-warning">
                Replaces existing descriptions{scope.trim() ? ' in that folder' : ''}, including ones written by another
                model. Leave this off to describe only images that have none yet.
              </span>
            )}
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Turn on and save, then run. Descriptions are generated on this server; the first run downloads the model.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving || !dirty}>
              Save
            </Button>
            <Button
              size="sm"
              onClick={() => void generate(rebuild)}
              disabled={saving || dirty || starting || running || !imageEnabled}
              title={
                !imageEnabled ? 'Turn on image descriptions and save first'
                  : dirty ? 'Save your changes first'
                    : rebuild ? 'Describe every image again, replacing existing descriptions'
                      : 'Describe images that have no description yet'
              }
            >
              {running || starting ? 'Running…' : rebuild ? 'Describe all again' : 'Describe missing'}
            </Button>
            {/* Only while there is something to stop — a disabled Stop sitting
                there permanently reads as broken. */}
            {running && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void stop()}
                disabled={stopping}
                title="Finish the current image, then stop. The rest are left for later."
              >
                {stopping ? 'Stopping…' : 'Stop'}
              </Button>
            )}
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
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load the search settings'))
      .finally(() => setLoading(false))
  ), [workspaceId])

  const loadTables = useCallback(() => (
    listWorkspaceVectorTables(workspaceId)
      .then(result => { setTables(result.tables || []); setTablesError(result.error) })
      .catch(err => setTablesError(err instanceof Error ? err.message : 'Failed to list stored indexes'))
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
          title: 'Saved: now index your existing documents',
          description: `${result.movedSpaces.map(spaceLabel).join(', ')}: new model in use. New documents use it right away; existing ones need indexing (button on the row).`,
        })
      } else if (result.applied === false) {
        showToast({
          title: 'Saved: applies on next start',
          description: 'The workspace is not running, so the changes take effect when it starts.',
        })
      } else {
        showToast({ title: 'Saved', description: 'Search settings updated.' })
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
          title: 'Indexing is turned off on the server',
          description: 'CANVAS_INFERD_INGEST_DISABLED=true: nothing was queued. What is already indexed still works.',
          variant: 'destructive',
        })
        return
      }
      showToast({
        title: `Indexing ${spaceLabel(space).toLowerCase()}`,
        description: `${result.enqueued.toLocaleString()} document(s) queued. The status line above shows progress.`,
      })
      setMovedSpaces(prev => prev.filter(s => s !== space))
      setQueueRefresh(n => n + 1)
      void loadTables()
    } catch (err) {
      showToast({ title: 'Indexing failed to start', description: err instanceof Error ? err.message : 'Failed to queue', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading search settings…
      </div>
    )
  }

  if (loadError || !config) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-destructive/40 bg-destructive-subtle p-4 text-sm">
          <p className="font-medium text-destructive">Search settings unavailable</p>
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
        saveLabel="Save models"
        onSave={save}
      />

      <div className="space-y-3">
        <SummarizeControls
          // Remount on config reload so the draft resets from saved state.
          key={`summarize:${JSON.stringify(config.workspace?.summarize || {})}`}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
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
        These settings are saved with the workspace (in its <span className="font-mono">workspace.json</span>), so
        they move with it. Anything not set here comes from your personal defaults, then the server's. Changes apply
        immediately, with no restart.
      </p>
    </div>
  )
}

export default InferdSettingsPanel

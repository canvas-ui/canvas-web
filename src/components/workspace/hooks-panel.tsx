import { Fragment, useEffect, useState } from 'react'
import { Plus, Save, Trash2, RefreshCw, Power, PowerOff, GitBranch, BookOpen, History, RotateCcw, Maximize2, Minimize2, Inbox, Play, Sparkles, Terminal, SlidersHorizontal, ScrollText, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CodeEditor } from '@/components/ui/code-editor'
import { TabBar } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { API_URL } from '@/config/api'
import {
  listHooks,
  getHook,
  saveHook,
  deleteHook,
  groupHooksByEvent,
  isHookEnabled,
  isExampleHook,
  setHookEnabled,
  getHooksMeta,
  generateHook,
  listRuns,
  getRun,
  replayRun,
  listPendingActions,
  runHook,
  backfillHook,
  hookEventOf,
  getBackfillLimit,
  setBackfillLimit,
  clampBackfillLimit,
  BACKFILL_MAX_LIMIT,
  type HookFile,
  type HooksMeta,
  type HookRun,
  type RulePrefill,
} from '@/services/hooks'
import { listScripts, getScript, saveScript, deleteScript } from '@/services/scripts'
import { RuleBuilder } from '@/components/workspace/rule-builder'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { PendingActionsPanel } from '@/components/workspace/pending-actions-panel'

type Section = 'pending' | 'rules' | 'hooks' | 'scripts' | 'runs'

interface HooksPanelProps {
  workspaceId: string
  /** Section to open with (deep link: settings/hooks?section=runs). */
  initialSection?: Section
  /** Runs section: filter to one handler (rule id / hook path) — `?handler=`. */
  initialRunsHandler?: string
  /** Runs section: open this run's details on load — `?run=<runId>`. */
  initialRunId?: string
  /** Open the rule builder with a folder rule prefilled (backends-tree context menu → Add rule). */
  prefillRule?: RulePrefill | null
  onPrefillConsumed?: () => void
}


const NEW_SCRIPT_TEMPLATE = `#!/usr/bin/env bash
# Called from a hook via: spawn('bash', [script, ...args])
set -euo pipefail
`

export function HooksPanel({ workspaceId, prefillRule, onPrefillConsumed, initialSection, initialRunsHandler, initialRunId }: HooksPanelProps) {
  const { showToast } = useToast()
  const [section, setSection] = useState<Section>(initialSection ?? 'rules')
  // A prefill always lands in the Rules section, whatever was open before
  // (prev-value-in-state: the caller memoizes the prefill object).
  const [prevPrefill, setPrevPrefill] = useState(prefillRule)
  if (prefillRule !== prevPrefill) {
    setPrevPrefill(prefillRule)
    if (prefillRule) setSection('rules')
  }
  const [showReference, setShowReference] = useState(false)
  const [files, setFiles] = useState<HookFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [meta, setMeta] = useState<HooksMeta | null>(null)
  const [newEvent, setNewEvent] = useState('document.inserted')
  const [newName, setNewName] = useState('')
  const [newActions, setNewActions] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [runs, setRuns] = useState<HookRun[]>([])
  const [runsFailedOnly, setRunsFailedOnly] = useState(false)
  // Runs filtered to one rule / hook (from a rule card's "ran N×" or ?handler=).
  const [runsHandler, setRunsHandler] = useState<string | null>(initialRunsHandler || null)
  // Expanded run (execution trace), fetched on demand from GET /runs/:runId.
  const [openRun, setOpenRun] = useState<{ runId: string; run: HookRun | null; error?: string } | null>(
    initialRunId ? { runId: initialRunId, run: null } : null,
  )
  const toggleRun = (runId: string) => {
    setOpenRun((cur) => (cur?.runId === runId ? null : { runId, run: null }))
  }
  useEffect(() => {
    if (!openRun || openRun.run || openRun.error) return
    let cancelled = false
    getRun(workspaceId, openRun.runId)
      .then((run) => { if (!cancelled) setOpenRun((cur) => (cur?.runId === run.runId ? { runId: run.runId, run } : cur)) })
      .catch((err) => { if (!cancelled) setOpenRun((cur) => (cur?.runId === openRun.runId ? { ...cur, error: err instanceof Error ? err.message : 'Failed to load run' } : cur)) })
    return () => { cancelled = true }
  }, [workspaceId, openRun])
  const [replayingId, setReplayingId] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [runningPath, setRunningPath] = useState<string | null>(null)
  // Backfill batch size (documents per pass), shared by rule backfills and
  // hook runs; persisted per browser.
  const [batchLimit, setBatchLimit] = useState<number>(() => getBackfillLimit())
  const [batchLimitDraft, setBatchLimitDraft] = useState<string>(() => String(getBackfillLimit()))
  const commitBatchLimit = () => {
    const next = setBackfillLimit(clampBackfillLimit(batchLimitDraft))
    setBatchLimit(next)
    setBatchLimitDraft(String(next))
  }

  // Badge count on the Pending tab; the panel keeps it fresh while open.
  useEffect(() => {
    let cancelled = false
    listPendingActions(workspaceId, { status: 'pending', limit: 500 })
      .then((list) => { if (!cancelled) setPendingCount(list.length) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [workspaceId])

  // Esc leaves the maximized editor — via the shared overlay stack, so an
  // overlay opened above it closes first.
  useEscapeClose(() => setIsMaximized(false), isMaximized)

  const replay = async (run: HookRun) => {
    if (!confirm(`Replay ${run.handlerType} "${run.handler}" for ${run.event} (docs ${(run.docIds || []).join(', ')})?`)) return
    setReplayingId(run.runId)
    try {
      const result = await replayRun(workspaceId, run.runId)
      showToast({ title: 'Replayed', description: `${run.handler} → ${result.status}` })
      await loadFiles()
    } catch (error) {
      showToast({ title: 'Replay failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setReplayingId(null)
    }
  }

  const svc = section === 'scripts'
    ? { list: listScripts, get: getScript, save: saveScript, del: deleteScript }
    : { list: listHooks, get: getHook, save: saveHook, del: deleteHook }

  // Sections owning their own data (RuleBuilder / PendingActionsPanel) skip
  // the shared file loader; `isFileSection` gates the file-list + editor UI.
  const isFileSection = section === 'hooks' || section === 'scripts'

  const loadFiles = async () => {
    if (section === 'rules' || section === 'pending') return
    if (section === 'runs') {
      try {
        setIsLoading(true)
        setRuns(await listRuns(workspaceId, { limit: 100, failed: runsFailedOnly || undefined, handler: runsHandler || undefined }))
      } catch {
        showToast({ title: 'Error', description: 'Failed to load hook runs', variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
      return
    }
    try {
      setIsLoading(true)
      setFiles(await svc.list(workspaceId))
    } catch {
      showToast({ title: 'Error', description: `Failed to load ${section}`, variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFiles() }, [workspaceId, section, runsFailedOnly, runsHandler])

  const switchSection = (next: Section) => {
    if (next === section) return
    if (isDirty && !confirm('Discard unsaved changes?')) return
    setSection(next)
    setSelected(null)
    setContent('')
    setIsDirty(false)
    setShowNew(false)
  }

  const openFile = async (path: string) => {
    if (isDirty && !confirm('Discard unsaved changes?')) return
    try {
      setSelected(path)
      setContent(await svc.get(workspaceId, path))
      setIsDirty(false)
    } catch {
      showToast({ title: 'Error', description: `Failed to open ${path}`, variant: 'destructive' })
    }
  }

  const save = async () => {
    if (!selected) return
    try {
      setIsSaving(true)
      await svc.save(workspaceId, selected, content)
      setIsDirty(false)
      showToast({ title: 'Saved', description: `${selected} saved` })
      await loadFiles()
    } catch {
      showToast({ title: 'Error', description: `Failed to save ${selected}`, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const toggle = async (path: string) => {
    const enabled = isHookEnabled(path)
    try {
      const next = await setHookEnabled(workspaceId, path, !enabled)
      if (selected === path) setSelected(next)
      await loadFiles()
      showToast({ title: enabled ? 'Disabled' : 'Enabled', description: next })
    } catch {
      showToast({ title: 'Error', description: `Failed to toggle ${path}`, variant: 'destructive' })
    }
  }

  // Run a hook by hand. Document-shaped hooks (document.*) get a backfill —
  // real documents, one run each, `batchLimit` of them; anything else
  // (started, tree.*, …) gets one synthesized run via /hooks/run.
  const run = async (path: string) => {
    const event = hookEventOf(path)
    if (!event) return
    if (!isHookEnabled(path) && !confirm(`${path} is disabled. Run it anyway?`)) return
    const documentShaped = event.startsWith('document.')
    if (documentShaped && !confirm(`Run ${path} against up to ${batchLimit} existing documents (event ${event})?`)) return
    setRunningPath(path)
    try {
      if (documentShaped) {
        const res = await backfillHook(workspaceId, { hookFile: path, event, limit: batchLimit })
        showToast({
          title: 'Run finished',
          description: `${res.processed} documents processed, ${res.failed} failed. Details in the Runs tab`,
          ...(res.failed ? { variant: 'destructive' as const } : {}),
        })
      } else {
        const res = await runHook(workspaceId, { hookFile: path, event })
        showToast({
          title: res.status === 'error' ? 'Run failed' : 'Run finished',
          description: res.status === 'error' ? `${path}: ${res.error || 'see the Runs tab'}` : `${path} → ${res.status}${res.durationMs != null ? ` in ${res.durationMs}ms` : ''}`,
          ...(res.status === 'error' ? { variant: 'destructive' as const } : {}),
        })
      }
    } catch (error) {
      showToast({ title: 'Run failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setRunningPath(null)
    }
  }

  const remove = async (path: string) => {
    if (!confirm(`Delete ${section === 'hooks' ? 'hook' : 'script'} ${path}?`)) return
    try {
      await svc.del(workspaceId, path)
      if (selected === path) { setSelected(null); setContent(''); setIsDirty(false) }
      await loadFiles()
      showToast({ title: 'Deleted', description: `${path} deleted` })
    } catch {
      showToast({ title: 'Error', description: `Failed to delete ${path}`, variant: 'destructive' })
    }
  }

  const loadMeta = async () => {
    if (meta) return
    try {
      setMeta(await getHooksMeta(workspaceId))
    } catch {
      showToast({ title: 'Error', description: 'Failed to load hook metadata', variant: 'destructive' })
    }
  }

  const openWizard = async () => {
    setShowNew(!showNew)
    if (section === 'hooks') await loadMeta()
  }

  const toggleReference = async () => {
    setShowReference(!showReference)
    await loadMeta()
  }

  const createScript = async () => {
    const name = newName.trim().replace(/^\/+/, '')
    if (!name) {
      showToast({ title: 'Error', description: 'Give the script a name (e.g. on-image.sh)', variant: 'destructive' })
      return
    }
    try {
      setIsCreating(true)
      await saveScript(workspaceId, name, NEW_SCRIPT_TEMPLATE)
      setShowNew(false)
      setNewName('')
      await loadFiles()
      await openFile(name)
    } catch {
      showToast({ title: 'Error', description: 'Failed to create script', variant: 'destructive' })
    } finally {
      setIsCreating(false)
    }
  }

  const toggleAction = (id: string) => {
    setNewActions((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id])
  }

  const createHook = async () => {
    if (!newName.trim()) {
      showToast({ title: 'Error', description: 'Give the hook a name', variant: 'destructive' })
      return
    }
    try {
      setIsCreating(true)
      const { path } = await generateHook(workspaceId, {
        event: newEvent,
        name: newName.trim(),
        actions: newActions,
      })
      setShowNew(false)
      setNewName('')
      setNewActions([])
      await loadFiles()
      await openFile(path)
      showToast({ title: 'Created', description: `${path}. Edit the TODOs, then enable it` })
    } catch {
      showToast({ title: 'Error', description: 'Failed to create hook', variant: 'destructive' })
    } finally {
      setIsCreating(false)
    }
  }

  const groups = section === 'hooks' ? groupHooksByEvent(files) : { scripts: files }
  const gitUrl = `${API_URL}/workspaces/${workspaceId}/git`

  return (
    // @container: this panel lives inside the settings column, which the docked
    // menu/toolbox panels can halve — a viewport breakpoint says "desktop" while
    // the actual column is 600px. The header lays out against ITS OWN width.
    <div className="@container space-y-4">
      {/* The tabs only move up beside the blurb
          when the column is genuinely wide. They also stay SHRINKABLE: as a
          `shrink-0` sibling of a `min-w-0` text column, flexbox squeezed the
          blurb to one word per line and let the tab row overlap it. The TabBar
          scrolls horizontally instead. */}
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-start @3xl:justify-between">
        <div className="min-w-0 @3xl:min-w-[18rem] @3xl:flex-1">
          <h3 className="text-lg font-medium">Automation</h3>
          <p className="text-sm text-muted-foreground">
            Rules are simple click-to-build automations (Outlook-style). Hooks are their
            programmable big brother; scripts are the shell helpers hooks spawn. Everything
            commits to the workspace git repo.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 @3xl:max-w-[60%] @3xl:flex-row @3xl:items-center">
          <div className="w-full min-w-0 @3xl:w-auto">
            <TabBar<Section>
              className="border-b-0"
              active={section}
              onChange={switchSection}
              tabs={[
                { id: 'pending', label: pendingCount > 0 ? `Pending (${pendingCount})` : 'Pending', icon: Inbox },
                { id: 'rules', label: 'Rules', icon: Sparkles },
                { id: 'hooks', label: 'Hooks', icon: GitBranch },
                { id: 'scripts', label: 'Scripts', icon: Terminal },
                { id: 'runs', label: 'Runs', icon: History },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Per-section controls live UNDER the header — in the tab row they
          fought the blurb for width and got clipped with the tabs. */}
      {(section === 'runs' || isFileSection) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {section === 'runs' && (
            <>
              {runsHandler && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 font-mono text-xs hover:bg-muted"
                  title="Showing runs of this rule / hook only — click to clear"
                  onClick={() => setRunsHandler(null)}
                >
                  {runsHandler} <X className="h-3 w-3" />
                </button>
              )}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={runsFailedOnly} onChange={(e) => setRunsFailedOnly(e.target.checked)} />
                failed only
              </label>
              <Button size="sm" variant="ghost" onClick={loadFiles} title="Reload">
                <RefreshCw className="mr-1.5 h-4 w-4" /> Reload
              </Button>
            </>
          )}
          {isFileSection && (
            <>
              <Button size="sm" variant="ghost" onClick={loadFiles} title="Reload">
                <RefreshCw className="mr-1.5 h-4 w-4" /> Reload
              </Button>
              <Button size="sm" variant="ghost" onClick={toggleReference} title="Hook context API & classifier reference">
                <BookOpen className="mr-1.5 h-4 w-4" /> Reference
              </Button>
              <Button size="sm" variant="outline" onClick={openWizard}>
                <Plus className="mr-2 h-4 w-4" /> {section === 'hooks' ? 'New Hook' : 'New Script'}
              </Button>
            </>
          )}
        </div>
      )}

      {section === 'pending' && (
        <PendingActionsPanel workspaceId={workspaceId} onPendingCount={setPendingCount} />
      )}

      {section === 'rules' && (
        <RuleBuilder
          workspaceId={workspaceId}
          backfillLimit={batchLimit}
          onShowRuns={(handler) => { setRunsHandler(handler); switchSection('runs') }}
          prefill={prefillRule}
          onPrefillConsumed={onPrefillConsumed}
          onOpenJson={async () => {
            // Pre-create the file so a fresh workspace can jump straight into
            // JSON editing without a 404.
            try {
              await getHook(workspaceId, 'rules.json')
            } catch {
              await saveHook(workspaceId, 'rules.json', JSON.stringify({ $schema: 'canvas.hook-rules/v1', rules: [] }, null, 2) + '\n')
                .catch(() => {})
            }
            setSection('hooks')
            void openFile('rules.json')
          }}
        />
      )}

      {section === 'runs' && (
        <div className="border rounded-lg overflow-auto max-h-[560px]">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-3">Loading...</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">
              No runs recorded yet{runsFailedOnly ? ' (failed only)' : ''}. Runs appear here every time a rule or hook executes.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-background">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Time</th>
                  <th className="text-left font-medium px-3 py-2">Handler</th>
                  <th className="text-left font-medium px-3 py-2">Event</th>
                  <th className="text-left font-medium px-3 py-2">Docs</th>
                  <th className="text-right font-medium px-3 py-2">ms</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <Fragment key={run.runId}>
                  <tr className="border-b last:border-0 align-top hover:bg-muted/40">
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-muted-foreground" title={run.ts}>
                      {new Date(run.ts).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">
                      <span className="text-muted-foreground">{run.handlerType}:</span>{run.handler}
                      {run.origin !== 'user' && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide rounded bg-muted-foreground/15 px-1 py-0.5 text-muted-foreground">
                          {run.origin}{run.depth ? ` d${run.depth}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">{run.event}{run.batch ? ' (batch)' : ''}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{(run.docIds || []).join(', ')}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{run.durationMs}</td>
                    <td className="px-3 py-1.5 text-xs">
                      <span className={
                        run.status === 'error' ? 'text-destructive font-medium'
                          : run.status === 'skipped' ? 'text-muted-foreground'
                            : 'text-success dark:text-success'
                      }>
                        {run.status}
                      </span>
                      {run.error && <span className="block text-destructive/80 font-mono break-all">{run.error}</span>}
                      {run.skipReason && <span className="block text-muted-foreground">{run.skipReason}</span>}
                      {run.actions && run.actions.length > 0 && (
                        <span className="block text-muted-foreground font-mono">
                          {run.actions.map((a) => `${a.action}:${a.status}`).join(' ')}
                        </span>
                      )}
                      {/* Why an action failed or did nothing — an agent that is
                          not running, no messaging channel, a doc-less event. */}
                      {run.actions?.filter((a) => a.error).map((a, i) => (
                        <span key={i} className={`block break-all font-mono ${a.status === 'error' ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                          {a.action}: {a.error}
                        </span>
                      ))}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <Button
                        size="sm" variant="ghost" className="h-6 px-1.5 touch-target"
                        title={run.traceLines ? `Execution log (${run.traceLines} lines)` : 'Execution log'}
                        onClick={() => toggleRun(run.runId)}
                      >
                        <ScrollText className="h-3.5 w-3.5" />
                        <ChevronDown className={`ml-0.5 h-3 w-3 transition-transform ${openRun?.runId === run.runId ? 'rotate-180' : ''}`} />
                      </Button>
                      {run.handlerType !== 'dispatch' && (
                        <Button
                          size="sm" variant="ghost" className="h-6 w-6 p-0 touch-target"
                          title="Replay this run (reloads the document, re-runs the handler)"
                          disabled={replayingId !== null}
                          onClick={() => replay(run)}
                        >
                          <RotateCcw className={`h-3 w-3 ${replayingId === run.runId ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                    </td>
                  </tr>
                  {openRun?.runId === run.runId && (
                    <tr className="border-b last:border-0 bg-muted/30">
                      <td colSpan={7} className="px-3 py-2">
                        <RunDetails state={openRun} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {isFileSection && showReference && meta && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30 text-sm">
          <div>
            <h4 className="font-medium mb-2">Hook context (<span className="font-mono">ctx</span>)</h4>
            <div className="space-y-2">
              {meta.contextApi?.map((entry) => (
                <div key={entry.name}>
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{entry.signature}</code>
                  <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-2">Classifier (<span className="font-mono">const c = ctx.classify()</span>)</h4>
            <div className="flex flex-wrap gap-1">
              {meta.classifier.predicates.map((p) => (
                <code key={p} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{p}</code>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Fields: {meta.classifier.fields.map((f) => <code key={f} className="font-mono">{f} </code>)}
              (never throws; all predicates are false for a null/unknown document).
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Full reference: <span className="font-mono">docs/hooks.md</span> in the server repo.
          </p>
        </div>
      )}

      {showNew && section === 'scripts' && (
        <div className="border rounded-lg p-3 flex gap-2 items-center bg-muted/50">
          <Input
            placeholder="on-image.sh"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="font-mono text-sm"
          />
          <Button size="sm" onClick={createScript} disabled={isCreating}>Create</Button>
          <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
        </div>
      )}

      {showNew && section === 'hooks' && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                1. When (event)
              </label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
              >
                {(meta?.events ?? []).map((event) => (
                  <option key={event.name} value={event.name}>
                    {event.name}: {event.description}
                  </option>
                ))}
              </select>
              {meta && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  payload: {meta.events.find((e) => e.name === newEvent)?.payload}
                </p>
              )}
              <label className="text-xs font-semibold text-muted-foreground block mt-3 mb-1">
                2. Name
              </label>
              <Input
                placeholder="my-hook"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                3. Then (actions; pick any)
              </label>
              <div className="space-y-1 max-h-52 overflow-auto pr-1">
                {(meta?.actions ?? []).map((action) => (
                  <label
                    key={action.id}
                    className="flex items-start gap-2 text-sm rounded px-2 py-1 hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={newActions.includes(action.id)}
                      onChange={() => toggleAction(action.id)}
                    />
                    <span>
                      <span className="font-medium">{action.label}</span>
                      <span className="block text-xs text-muted-foreground">{action.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={createHook} disabled={isCreating || !meta}>
              {isCreating ? 'Creating…' : 'Create skeleton'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <p className="text-xs text-muted-foreground">
              Creates a disabled skeleton. Edit the TODOs, then enable it. Simple match→action
              automations can also go into <span className="font-mono">rules.json</span> (no code).
            </p>
          </div>
        </div>
      )}

      {isFileSection && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 border rounded-lg p-2 max-h-[480px] overflow-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-2">Loading...</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">No hooks yet.</p>
          ) : (
            Object.entries(groups).map(([event, eventFiles]) => (
              <div key={event} className="mb-2">
                <div className="text-xs font-semibold text-muted-foreground px-2 py-1">{event}</div>
                {eventFiles.map((file) => {
                  const enabled = isHookEnabled(file.path)
                  return (
                  <div
                    key={file.path}
                    className={`flex items-center justify-between rounded px-2 py-1 cursor-pointer text-sm ${selected === file.path ? 'bg-muted' : 'hover:bg-muted/50'} ${enabled ? '' : 'opacity-50'}`}
                    onClick={() => openFile(file.path)}
                  >
                    <span className="font-mono truncate flex items-center gap-1.5">
                      {file.path}
                      {section === 'hooks' && isExampleHook(file.path) && (
                        <span className="text-[10px] uppercase tracking-wide rounded bg-muted-foreground/15 px-1 py-0.5 text-muted-foreground shrink-0">
                          example
                        </span>
                      )}
                    </span>
                    <div className="flex items-center">
                      {section === 'hooks' && hookEventOf(file.path) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 touch-target"
                        title={hookEventOf(file.path)?.startsWith('document.') ? `Run against up to ${batchLimit} existing documents` : 'Run now'}
                        disabled={runningPath !== null}
                        onClick={(e) => { e.stopPropagation(); run(file.path) }}
                      >
                        <Play className={`h-3 w-3 ${runningPath === file.path ? 'animate-pulse' : ''}`} />
                      </Button>
                      )}
                      {section === 'hooks' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 touch-target"
                        title={enabled ? 'Disable' : 'Enable'}
                        onClick={(e) => { e.stopPropagation(); toggle(file.path) }}
                      >
                        {enabled ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3 text-muted-foreground" />}
                      </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive touch-target"
                        onClick={(e) => { e.stopPropagation(); remove(file.path) }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className={isMaximized
          ? 'fixed inset-0 z-50 bg-background p-4 flex flex-col'
          : 'md:col-span-2 border rounded-lg p-2 flex flex-col'}
        >
          {selected ? (
            <>
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-mono text-sm truncate">{selected}{isDirty ? ' •' : ''}</span>
                <div className="flex items-center gap-1">
                  {section === 'hooks' && hookEventOf(selected) && (
                    <>
                      <Button
                        size="sm" variant="outline" className="h-8"
                        title={isHookEnabled(selected) ? 'Disable this hook (renames it with a disabled- prefix)' : 'Enable this hook (strips the prefix)'}
                        onClick={() => toggle(selected)}
                      >
                        {isHookEnabled(selected)
                          ? <><Power className="mr-1.5 h-3.5 w-3.5" /> Enabled</>
                          : <><PowerOff className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Disabled</>}
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-8"
                        title="Run this hook now"
                        disabled={runningPath !== null || isDirty}
                        onClick={() => run(selected)}
                      >
                        <Play className={`mr-1.5 h-3.5 w-3.5 ${runningPath === selected ? 'animate-pulse' : ''}`} /> Run
                      </Button>
                    </>
                  )}
                  <Button size="sm" onClick={save} disabled={isSaving || !isDirty}>
                    <Save className="mr-2 h-4 w-4" /> Save
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-8 w-8 p-0"
                    title={isMaximized ? 'Exit full screen (Esc)' : 'Edit full screen'}
                    onClick={() => setIsMaximized(!isMaximized)}
                  >
                    {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className={`flex-1 overflow-auto rounded border text-sm ${isMaximized ? '' : 'min-h-[400px] max-h-viewport-pane'}`}>
                <CodeEditor
                  value={content}
                  path={selected}
                  onChange={(next) => { setContent(next); setIsDirty(true) }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground min-h-[400px]">
              Select a {section === 'hooks' ? 'hook' : 'script'} to edit, or create a new one.
            </div>
          )}
        </div>
      </div>
      )}

      {/* Backfill batch size sits with the sections that use it (rule "Apply",
          manual hook runs) rather than in the header, where it read as a
          global control and crowded the tab row. */}
      {(section === 'rules' || section === 'hooks') && (
        <label
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
          title={`1–${BACKFILL_MAX_LIMIT}. Raise it when "Apply to existing items" reports fewer matches than you expect.`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          <span>Apply / run in batches of</span>
          <Input
            type="number"
            min={1}
            max={BACKFILL_MAX_LIMIT}
            step={100}
            value={batchLimitDraft}
            onChange={(e) => setBatchLimitDraft(e.target.value)}
            onBlur={commitBatchLimit}
            onKeyDown={(e) => { if (e.key === 'Enter') { commitBatchLimit(); (e.target as HTMLInputElement).blur() } }}
            className="h-7 w-20 px-2 text-xs"
          />
          <span>documents per pass — the rule "Apply" button and manual hook runs stop after that many.</span>
        </label>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5 shrink-0" />
        <span>
          Everything here lives in the workspace git repo. Clone it with{' '}
          {/* A clone URL has no spaces to wrap on, so on a phone it pushed the
              panel wider than the screen. break-all keeps it inside the card. */}
          <code className="break-all rounded bg-muted px-1 py-0.5 font-mono select-all">
            git clone {gitUrl.replace('://', '://canvas@')}
          </code>{' '}
          (password: a canvas API token; the <span className="font-mono">canvas@</span> username
          is arbitrary but git needs one). Pushes hot-reload hooks.
        </span>
      </p>
    </div>
  )
}


// Execution log of one run: the trace lines the handler wrote (agent prompt
// and reply, notify delivery, where a store/download landed), plus the
// per-action outcomes and the triggering envelope.
function RunDetails({ state }: { state: { runId: string; run: HookRun | null; error?: string } }) {
  if (state.error) return <p className="text-xs text-destructive">{state.error}</p>
  if (!state.run) return <p className="text-xs text-muted-foreground">Loading…</p>
  const run = state.run
  const levelClass: Record<string, string> = {
    error: 'text-destructive',
    warn: 'text-warning',
    info: 'text-foreground',
    debug: 'text-muted-foreground',
  }
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <span>run <span className="font-mono">{run.runId}</span></span>
        <span>trigger <span className="font-mono">{run.trigger}</span></span>
        {run.eventId && <span>event <span className="font-mono">{run.eventId}</span></span>}
        <span>{run.durationMs} ms</span>
      </div>
      {run.actions && run.actions.length > 0 && (
        <ol className="space-y-0.5 font-mono">
          {run.actions.map((a, i) => (
            <li key={i} className={a.status === 'error' ? 'text-destructive' : a.status === 'skipped' ? 'text-muted-foreground' : ''}>
              {i + 1}. {a.action} → {a.status}{a.error ? ` — ${a.error}` : ''}
            </li>
          ))}
        </ol>
      )}
      {run.trace && run.trace.length > 0 ? (
        <pre className="max-h-96 overflow-auto rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {run.trace.map((line, i) => (
            <span key={i} className={`block ${levelClass[line.level] || ''}`}>
              <span className="text-muted-foreground">+{String(line.t).padStart(5, ' ')}ms </span>
              <span className="uppercase text-muted-foreground">{line.level.padEnd(5, ' ')} </span>
              {line.msg}
            </span>
          ))}
        </pre>
      ) : (
        <p className="text-muted-foreground">No execution log recorded for this run{run.error ? '' : ' (older runs predate tracing)'}.</p>
      )}
    </div>
  )
}

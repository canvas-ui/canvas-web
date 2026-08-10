import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-context'
import { useSocket } from '@/hooks/useSocket'
import { useSocketSubscription } from '@/hooks/useSocketSubscription'
import {
  listPendingActions,
  decidePendingActions,
  type PendingAction,
  type PendingActionStatus,
} from '@/services/hooks'

interface PendingActionsPanelProps {
  workspaceId: string
  /** Called after every load/decision with the current pending count (badge). */
  onPendingCount?: (count: number) => void
}

type StatusFilter = PendingActionStatus | 'all'

const STATUS_FILTERS: StatusFilter[] = ['pending', 'approved', 'declined', 'failed', 'expired', 'all']

const STATUS_STYLES: Record<PendingActionStatus, string> = {
  pending: 'text-warning dark:text-warning',
  approved: 'text-success dark:text-success',
  declined: 'text-muted-foreground',
  failed: 'text-destructive',
  expired: 'text-muted-foreground line-through',
}

function ageOf(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function getAtPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc != null && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    root,
  )
}

/** Human label for an editable path: 'actions.0.draft.body' → 'body'. */
function fieldLabel(path: string): string {
  const parts = path.split('.')
  return parts.slice(Math.max(parts.length - 2, 2)).join('.')
}

const LONG_FIELD = /(body|content|message|text|prompt)$/i

interface AmendEditorProps {
  action: PendingAction
  amend: Record<string, unknown>
  onAmend: (path: string, value: unknown) => void
}

// Inline editors for the record's `editable` allowlist. Strings edit as
// text/textarea; everything else round-trips as JSON (invalid JSON keeps the
// raw string in local state and is rejected server-side with a clear error).
function AmendEditor({ action, amend, onAmend }: AmendEditorProps) {
  if (!action.editable?.length) return null
  return (
    <div className="space-y-2">
      {action.editable.map((path) => {
        const original = getAtPath(action, path)
        const isString = typeof original === 'string'
        const current = path in amend ? amend[path] : original
        const display = isString ? String(current ?? '') : JSON.stringify(current, null, 2)
        const long = isString && (LONG_FIELD.test(path) || display.length > 80)
        return (
          <label key={path} className="block text-xs">
            <span className="font-medium text-muted-foreground">
              {fieldLabel(path)}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">{path}</span>
              {path in amend && <span className="ml-1.5 text-warning dark:text-warning">edited</span>}
            </span>
            {long ? (
              <textarea
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-ring min-h-[100px]"
                value={display}
                onChange={(e) => onAmend(path, e.target.value)}
              />
            ) : (
              <input
                className="mt-1 w-full h-8 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                value={display}
                onChange={(e) => {
                  if (isString) { onAmend(path, e.target.value); return }
                  try { onAmend(path, JSON.parse(e.target.value)) }
                  catch { onAmend(path, e.target.value) } // let the server reject it explicitly
                }}
              />
            )}
          </label>
        )
      })}
    </div>
  )
}

export function PendingActionsPanel({ workspaceId, onPendingCount }: PendingActionsPanelProps) {
  const { showToast } = useToast()
  const socket = useSocket()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [items, setItems] = useState<PendingAction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [amends, setAmends] = useState<Record<string, Record<string, unknown>>>({})
  const [isDeciding, setIsDeciding] = useState(false)

  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      const list = await listPendingActions(workspaceId, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 200,
      })
      setItems(list)
      setSelected((prev) => new Set(list.filter((i) => i.status === 'pending' && prev.has(i.actionId)).map((i) => i.actionId)))
      onPendingCount?.(
        statusFilter === 'pending'
          ? list.length
          : list.filter((i) => i.status === 'pending').length,
      )
    } catch {
      showToast({ title: 'Error', description: 'Failed to load pending actions', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, statusFilter, onPendingCount, showToast])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  // Live refresh: proposal/decision events for this workspace push through the
  // websocket workspace channel.
  useSocketSubscription(socket, `workspace:${workspaceId}`, useMemo(() => {
    const refresh = () => { void load() }
    return {
      'action.proposed': refresh,
      'action.approved': refresh,
      'action.declined': refresh,
      'action.failed': refresh,
    }
  }, [load]))

  const pendingItems = items.filter((i) => i.status === 'pending')
  const allSelected = pendingItems.length > 0 && pendingItems.every((i) => selected.has(i.actionId))

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(pendingItems.map((i) => i.actionId)))
  }

  const toggleOne = (actionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(actionId)) next.delete(actionId)
      else next.add(actionId)
      return next
    })
  }

  const setAmend = (actionId: string, path: string, value: unknown) => {
    setAmends((prev) => ({ ...prev, [actionId]: { ...prev[actionId], [path]: value } }))
  }

  const decide = async (approve: string[], decline: string[]) => {
    if (!approve.length && !decline.length) return
    setIsDeciding(true)
    try {
      const outcome = await decidePendingActions(workspaceId, {
        approve: approve.map((actionId) => {
          const amend = amends[actionId]
          return amend && Object.keys(amend).length ? { actionId, amend } : actionId
        }),
        decline,
      })
      const errors = outcome.results.filter((r) => r.status === 'error' || r.status === 'failed')
      if (errors.length) {
        showToast({
          title: `${errors.length} of ${outcome.decided} failed`,
          description: errors.map((e) => `${e.actionId}: ${e.error ?? 'execution failed'}`).join('; '),
          variant: 'destructive',
        })
      } else {
        showToast({
          title: approve.length && decline.length
            ? 'Decisions applied'
            : approve.length ? `Approved ${approve.length}` : `Declined ${decline.length}`,
          description: approve.length ? 'Approved actions executed with their original provenance.' : undefined,
        })
      }
      setAmends((prev) => {
        const next = { ...prev }
        for (const id of [...approve, ...decline]) delete next[id]
        return next
      })
      setSelected(new Set())
      if (expanded && [...approve, ...decline].includes(expanded)) setExpanded(null)
      await load()
    } catch (error) {
      showToast({ title: 'Decision failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setIsDeciding(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => void load()} title="Reload">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button size="sm" disabled={isDeciding} onClick={() => void decide([...selected], [])}>
              <Check className="mr-1 h-3.5 w-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={isDeciding} onClick={() => void decide([], [...selected])}>
              <X className="mr-1 h-3.5 w-3.5" /> Decline
            </Button>
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-auto max-h-[560px]">
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-3">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3">
            {statusFilter === 'pending'
              ? 'Nothing waiting for review. Rules or hooks with approval enabled queue their actions here.'
              : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}actions recorded.`}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-background">
              <tr>
                <th className="px-3 py-2 w-8">
                  {pendingItems.length > 0 && (
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Select all pending" />
                  )}
                </th>
                <th className="text-left font-medium px-3 py-2">Proposed action</th>
                <th className="text-left font-medium px-3 py-2">Handler</th>
                <th className="text-left font-medium px-3 py-2">Age</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="px-2 py-2 w-40" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isPending = item.status === 'pending' || item.status === 'failed'
                const isExpanded = expanded === item.actionId
                const docStub = item.envelope?.payload?.document as { id?: number; schema?: string } | undefined
                return (
                  <Fragment key={item.actionId}>
                    <tr
                      className="border-b last:border-0 align-top hover:bg-muted/40 cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : item.actionId)}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {item.status === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selected.has(item.actionId)}
                            onChange={() => toggleOne(item.actionId)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1 font-medium">
                          {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                          {item.title}
                          {item.editable?.length > 0 && (
                            <span className="text-[10px] uppercase tracking-wide rounded bg-muted-foreground/15 px-1 py-0.5 text-muted-foreground shrink-0">
                              editable
                            </span>
                          )}
                        </span>
                        {item.summary && <span className="block text-xs text-muted-foreground pl-4">{item.summary}</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        <span className="text-muted-foreground">{item.handlerType}:</span>{item.handler}
                        {item.event && <span className="block text-muted-foreground">{item.event}{docStub?.id ? ` · doc ${docStub.id}` : ''}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap" title={item.ts}>{ageOf(item.ts)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={STATUS_STYLES[item.status]}>{item.status}</span>
                        {item.amended && <span className="block text-muted-foreground">amended</span>}
                        {item.decidedBy && <span className="block text-muted-foreground truncate max-w-[120px]" title={item.decidedBy}>{item.decidedBy}</span>}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        {isPending && (
                          <>
                            <Button
                              size="sm" className="h-7 px-2"
                              disabled={isDeciding}
                              title={item.status === 'failed' ? 'Retry (re-approve)' : 'Approve and execute'}
                              onClick={() => void decide([item.actionId], [])}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            {item.status === 'pending' && (
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground"
                                disabled={isDeciding}
                                title="Decline"
                                onClick={() => void decide([], [item.actionId])}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b last:border-0 bg-muted/20">
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3 space-y-3" colSpan={5}>
                          {isPending && item.editable?.length > 0 && (
                            <AmendEditor
                              action={item}
                              amend={amends[item.actionId] ?? {}}
                              onAmend={(path, value) => setAmend(item.actionId, path, value)}
                            />
                          )}
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">Actions on approve</span>
                            <pre className="mt-1 rounded border bg-background p-2 font-mono text-xs overflow-auto max-h-56">
                              {JSON.stringify(item.actions, null, 2)}
                            </pre>
                          </div>
                          {item.result && item.result.length > 0 && (
                            <div className="text-xs font-mono">
                              {item.result.map((r, idx) => (
                                <span key={idx} className={`mr-2 ${r.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {r.action}:{r.status}{r.error ? ` (${r.error})` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {item.actionId} · origin {item.provenance?.origin}
                            {item.provenance?.causedBy ? ` · causedBy ${item.provenance.causedBy}` : ''}
                            {item.expiresAt ? ` · expires ${new Date(item.expiresAt).toLocaleString()}` : ''}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

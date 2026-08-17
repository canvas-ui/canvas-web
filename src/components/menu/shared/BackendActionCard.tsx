import { useEffect, useMemo, useState } from 'react'
import { X, HardDrive, Database, Copy, ArrowRight, Trash2, Cloud, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { cn } from '@/lib/utils'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { listBackends, type Backend, type BackendTransferMode } from '@/services/workspace'

const MODES: Array<{ mode: BackendTransferMode; label: string; icon: JSX.Element }> = [
  { mode: 'copy', label: 'Copy to', icon: <Copy className="h-3.5 w-3.5" /> },
  { mode: 'move', label: 'Move to', icon: <ArrowRight className="h-3.5 w-3.5" /> },
  { mode: 'delete', label: 'Delete from', icon: <Trash2 className="h-3.5 w-3.5" /> },
]

export interface BackendActionCardProps {
  workspaceId: string
  documentCount: number
  initialMode?: BackendTransferMode
  onConfirm: (backends: string[], mode: BackendTransferMode, options: { keepDocument: boolean }) => void | Promise<void>
  onClose: () => void
  saving?: boolean
  sizeClassName?: string
}

function backendIcon(backend: Backend) {
  if (backend.driver === 'cacache') return Database
  if (backend.config?.remote === true) return Cloud
  return HardDrive
}

/**
 * Backend counterpart of LinkToCard: pick storage backends and copy documents
 * onto them, move them there, or delete their bytes from them.
 *
 * The mode lives inside the card rather than in three separate entry points —
 * "copy or move?" is the same decision made against the same list, and having
 * to close and reopen to change your mind is worse than one segmented control.
 */
export function BackendActionCard({
  workspaceId,
  documentCount,
  initialMode = 'copy',
  onConfirm,
  onClose,
  saving = false,
  sizeClassName,
}: BackendActionCardProps) {
  useEscapeClose(onClose, !saving)
  const [mode, setMode] = useState<BackendTransferMode>(initialMode)
  const [backends, setBackends] = useState<Backend[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [keepDocument, setKeepDocument] = useState(false)

  useEffect(() => {
    let cancelled = false
    listBackends(workspaceId)
      .then(list => { if (!cancelled) setBackends(list.filter(b => b.kind === 'storage')) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [workspaceId])

  // A move has exactly one destination (the server refuses more — with two
  // targets there is no answer to "which one may the source be dropped for?").
  const single = mode === 'move'

  const isDisabled = (backend: Backend): string | null => {
    if (mode === 'delete') return null
    if (backend.enabled === false) return 'disabled'
    if (backend.config?.readOnly === true) return 'read-only'
    if (backend.config?.supported === false) return 'unsupported'
    return null
  }

  const selectable = useMemo(
    () => (backends || []).filter(b => !isDisabled(b)).map(b => b.address),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backends, mode],
  )

  const switchMode = (next: BackendTransferMode) => {
    setMode(next)
    setSelected(prev => {
      // Drop anything the new mode can't target (and trim to one for a move) —
      // silently sending an invalid target would fail per document later.
      const allowed = (backends || [])
        .filter(b => (next === 'delete' ? true : !(b.enabled === false || b.config?.readOnly === true || b.config?.supported === false)))
        .map(b => b.address)
      const kept = [...prev].filter(a => allowed.includes(a))
      return new Set(next === 'move' ? kept.slice(0, 1) : kept)
    })
  }

  const toggle = (address: string) => {
    setSelected(prev => {
      if (single) return prev.has(address) ? new Set() : new Set([address])
      const next = new Set(prev)
      if (next.has(address)) next.delete(address)
      else next.add(address)
      return next
    })
  }

  const confirm = async () => {
    if (selected.size === 0 || saving) return
    await onConfirm([...selected], mode, { keepDocument })
  }

  const count = documentCount
  const plural = count !== 1 ? 's' : ''
  const title = mode === 'delete'
    ? `Delete ${count} document${plural} from…`
    : `${mode === 'move' ? 'Move' : 'Copy'} ${count} document${plural} to…`

  const verb = mode === 'delete' ? 'Delete from' : mode === 'move' ? 'Move to' : 'Copy to'
  // Nothing picked yet: the bare verb reads better than "Copy to 0 backends".
  const confirmLabel = selected.size === 0
    ? verb.split(' ')[0]
    : `${verb} ${selected.size} backend${selected.size !== 1 ? 's' : ''}`

  return (
    <div className={cn(
      'flex flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-4',
      // Sized to its content (a workspace has a handful of backends, not a
      // tree), capped so a long list scrolls instead of overflowing the screen.
      sizeClassName || 'max-h-viewport-card w-[min(420px,90vw)] max-md:h-full max-md:w-full max-md:shadow-elevation-5',
    )}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <HardDrive className="h-4 w-4" />
          {title}
        </span>
        <button type="button" onClick={onClose} disabled={saving} className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b px-2 pt-2">
        {MODES.map(({ mode: m, label, icon }) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            disabled={saving}
            className={cn(
              'flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
              mode === m
                ? (m === 'delete' ? 'border-destructive text-destructive' : 'border-primary text-foreground')
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {error && <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>}
        {!backends && !error && <div className="px-2 py-3 text-xs text-muted-foreground">Loading backends…</div>}
        {backends?.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No storage backends configured.</p>}

        {backends?.map(backend => {
          const Icon = backendIcon(backend)
          const disabledReason = isDisabled(backend)
          const isSelected = selected.has(backend.address)
          const remote = backend.config?.remote === true
          return (
            <div
              key={`${backend.driver}/${backend.address}`}
              onClick={() => !disabledReason && !saving && toggle(backend.address)}
              className={cn(
                'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm shadow-elevation-1 transition-all select-none',
                'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:transition-colors',
                disabledReason
                  ? 'cursor-not-allowed bg-muted/40 opacity-60 before:bg-transparent'
                  : 'cursor-pointer hover:shadow',
                !disabledReason && isSelected
                  ? (mode === 'delete'
                    ? 'bg-destructive/[0.08] hover:bg-destructive/[0.12] before:bg-destructive'
                    : 'bg-primary/[0.08] hover:bg-primary/[0.12] before:bg-primary')
                  : !disabledReason ? 'bg-card hover:bg-primary/[0.04] before:bg-transparent' : '',
              )}
              title={backend.address}
            >
              <input
                type={single ? 'radio' : 'checkbox'}
                checked={isSelected}
                disabled={!!disabledReason || saving}
                onChange={() => toggle(backend.address)}
                onClick={e => e.stopPropagation()}
                className="h-4 w-4 shrink-0 accent-primary"
                aria-label={backend.address}
              />
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{(backend.config?.label as string) || backend.address}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {backend.driver} · {backend.address}
                </span>
              </span>
              {remote && (
                <span className="shrink-0 rounded bg-info-subtle px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground" title={`Network mount${backend.config?.transport ? ` (${backend.config.transport as string})` : ''} — transfers cross the network`}>
                  {(backend.config?.transport as string) || 'remote'}
                </span>
              )}
              {disabledReason && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{disabledReason}</span>
              )}
            </div>
          )
        })}

        {mode === 'delete' && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
            <input
              type="checkbox"
              checked={keepDocument}
              onChange={e => setKeepDocument(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-destructive"
            />
            <span>
              Keep the index entry when its <strong>last</strong> copy is deleted.
              <span className="block text-muted-foreground">Otherwise the document is removed from the index once no locations remain.</span>
            </span>
          </label>
        )}

        {mode === 'move' && selectable.length > 0 && (
          <p className="px-1 pt-2 text-[11px] text-muted-foreground">
            The source copy is released only once the destination write is durable.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3">
        <span className="text-xs text-muted-foreground">
          {selected.size} backend{selected.size !== 1 ? 's' : ''} selected
        </span>
        <Button
          size="sm"
          variant={mode === 'delete' ? 'destructive' : 'default'}
          onClick={confirm}
          disabled={selected.size === 0 || saving}
        >
          {saving ? (
            <><Loader className="mr-1.5 h-3.5 w-3.5" />Working…</>
          ) : (
            <>
              {mode === 'delete' ? <Trash2 className="mr-1 h-3.5 w-3.5" /> : mode === 'move' ? <ArrowRight className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
              {confirmLabel}
            </>
          )}
        </Button>
      </div>

      {mode === 'delete' && (
        <div className="flex items-start gap-2 border-t bg-destructive/5 px-4 py-2 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <span>Deletes the file data from the selected backends. Copies on other backends are untouched.</span>
        </div>
      )}
    </div>
  )
}

export default BackendActionCard

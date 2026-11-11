import { useCallback, useEffect, useMemo, useState } from 'react'
import { File, FileText, Folder, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'

import { discardDeleted, listDeleted, restoreDeleted, type DeletedItem, type DeletedItemResult } from '@/services/trash-operations'
import { invalidateWorkspaceTreeCache } from '@/services/workspace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const PAGE = 200
const DAY_MS = 86_400_000

function daysLeft(item: DeletedItem, now: number) {
  if (!item.expiresAt) return null
  return Math.max(0, Math.ceil((Date.parse(item.expiresAt) - now) / DAY_MS))
}

function groupOf(item: DeletedItem, now: number) {
  if (!item.deletedAt) return 'Earlier'
  const midnight = new Date(now).setHours(0, 0, 0, 0)
  const at = Date.parse(item.deletedAt)
  if (at >= midnight) return 'Today'
  if (at >= midnight - DAY_MS) return 'Yesterday'
  if (at >= midnight - 6 * DAY_MS) return 'Last 7 days'
  return 'Earlier'
}

function sizeLabel(bytes: number | null) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

const ICONS = { document: FileText, file: File, folder: Folder }

/**
 * Everything that was deleted in the workspace and can still be brought
 * back, newest first: documents removed from their last folder and files or
 * folders deleted from a storage backend. One list, one expiry.
 */
export function RecentlyDeleted({ workspaceName, canWrite }: { workspaceName: string; canWrite: boolean }) {
  const [items, setItems] = useState<DeletedItem[]>([])
  const [total, setTotal] = useState(0)
  const [retentionDays, setRetentionDays] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ ids: string[]; label: string } | null>(null)
  const [now] = useState(() => Date.now())

  const load = useCallback(async (offset = 0) => {
    setLoading(true)
    try {
      const page = await listDeleted(workspaceName, { search: search.trim(), limit: PAGE, offset })
      setItems(prev => offset ? [...prev, ...page.items] : page.items)
      setTotal(page.total)
      setRetentionDays(page.retentionDays)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load deleted items')
    } finally {
      setLoading(false)
    }
  }, [workspaceName, search])

  useEffect(() => {
    const timer = setTimeout(() => { setSelected(new Set()); void load() }, search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  const groups = useMemo(() => {
    const out: { label: string; items: DeletedItem[] }[] = []
    for (const item of items) {
      const label = groupOf(item, now)
      const last = out[out.length - 1]
      if (last?.label === label) last.items.push(item)
      else out.push({ label, items: [item] })
    }
    return out
  }, [items, now])

  const settle = async (action: 'restore' | 'discard', ids: string[]) => {
    if (!ids.length || busy) return
    setBusy(true); setError(''); setConfirm(null)
    try {
      const results: DeletedItemResult[] = action === 'restore' ? await restoreDeleted(workspaceName, ids) : await discardDeleted(workspaceName, ids)
      const failed = results.filter(r => !r.ok)
      if (failed.length) {
        const names = new Map(items.map(item => [item.id, item.name]))
        setError(`${failed.length} of ${ids.length} could not be ${action === 'restore' ? 'restored' : 'deleted'}: ${failed.slice(0, 3).map(r => `${names.get(r.id) || r.id} (${r.message || 'failed'})`).join(', ')}`)
      }
      invalidateWorkspaceTreeCache(workspaceName)
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName } }))
      setSelected(new Set())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string, on: boolean) => setSelected(prev => {
    const next = new Set(prev)
    if (on) next.add(id); else next.delete(id)
    return next
  })
  const picked = [...selected]
  const allIds = items.map(item => item.id)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search deleted items" placeholder="Search by name or folder" className="max-w-xs" value={search} onChange={e => setSearch(e.target.value)} />
        <span className="text-xs text-muted-foreground">
          {total} item{total === 1 ? '' : 's'}
          {retentionDays ? `, kept for ${retentionDays} days` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading || busy} aria-label="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {picked.length > 0 ? <>
            <Button size="sm" variant="outline" disabled={!canWrite || busy} onClick={() => void settle('restore', picked)}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />Restore {picked.length}
            </Button>
            <Button size="sm" variant="destructive" disabled={!canWrite || busy} onClick={() => setConfirm({ ids: picked, label: `${picked.length} selected item${picked.length === 1 ? '' : 's'}` })}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />Delete forever
            </Button>
          </> : (
            <Button size="sm" variant="outline" disabled={!canWrite || busy || !items.length} onClick={() => setConfirm({ ids: allIds, label: search.trim() ? `all ${allIds.length} listed items` : `all ${allIds.length} items` })}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />Empty trash
            </Button>
          )}
        </div>
      </div>

      {confirm && (
        <div role="alertdialog" className="flex flex-wrap items-center gap-3 rounded border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
          <span>Delete {confirm.label} forever? This cannot be undone.</span>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void settle('discard', confirm.ids)}>Delete forever</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {!items.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {loading ? 'Loading…' : search.trim() ? 'Nothing deleted matches that search.' : 'Nothing was deleted recently.'}
        </p>
      )}

      {groups.map(group => (
        <section key={group.label}>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</h3>
          <ul className="divide-y rounded-md border">
            {group.items.map(item => {
              const Icon = ICONS[item.kind]
              const left = daysLeft(item, now)
              return (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                  <input type="checkbox" aria-label={`Select ${item.name}`} disabled={!canWrite || busy} checked={selected.has(item.id)} onChange={e => toggle(item.id, e.target.checked)} />
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{item.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.from.length ? item.from.join(', ') : 'No folder recorded'}
                      {item.reason === 'source-missing' ? ' · disappeared from its source' : ''}
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                    <div>{item.deletedAt ? new Date(item.deletedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</div>
                    <div>{[sizeLabel(item.size), left == null ? '' : left === 0 ? 'expires today' : `${left} day${left === 1 ? '' : 's'} left`].filter(Boolean).join(' · ')}</div>
                  </div>
                  <Button size="sm" variant="outline" disabled={!canWrite || busy} onClick={() => void settle('restore', [item.id])} title="Put it back where it was">
                    <RotateCcw className="h-3.5 w-3.5 sm:mr-2" /><span className="hidden sm:inline">Restore</span>
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!canWrite || busy} onClick={() => setConfirm({ ids: [item.id], label: `"${item.name}"` })} aria-label={`Delete ${item.name} forever`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {items.length < total && (
        <div className="text-center">
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void load(items.length)}>Show more</Button>
        </div>
      )}
    </div>
  )
}

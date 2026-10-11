import { useState } from 'react'
import { Activity, FolderSync, Pencil, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { StoragePolicyPanel } from '@/components/menu/shared/StoragePolicyPanel'
import { invalidateStoragePolicies, useStoragePolicies } from '@/hooks/useStoragePolicies'
import {
  applyStoragePolicyAll, describePolicyTarget, saveStoragePolicies, retryStorageOperation,
  type StoragePolicy,
} from '@/services/storage-policies'

function Switch({ checked, disabled, onClick, label }: { checked: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

function Badge({ children, title }: { children: React.ReactNode; title?: string }) {
  return <span title={title} className="rounded border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">{children}</span>
}

function describeFilter(policy: StoragePolicy): string {
  const f = policy.filter
  if (!f || (!f.mime && !f.filename && (!f.schema || f.schema === 'file'))) return 'Files'
  if (f.mime === 'image/*' && !f.filename) return 'Images'
  return [f.schema && f.schema !== 'file' ? f.schema : null, f.mime, f.filename].filter(Boolean).join(' · ')
}

export function StoragePoliciesPanel({ workspaceId }: { workspaceId: string }) {
  const { policies, revision, status, loading, error, refresh } = useStoragePolicies(workspaceId)
  const { showToast } = useToast()
  const [editing, setEditing] = useState<StoragePolicy | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>('')

  const fail = (err: unknown, fallback: string) =>
    showToast({ title: 'Error', description: err instanceof Error ? err.message : fallback, variant: 'destructive' })

  const toggle = async (policy: StoragePolicy) => {
    setBusy(policy.id)
    try {
      await saveStoragePolicies(workspaceId, policies.map(p => (p.id === policy.id ? { ...p, enabled: !p.enabled } : p)), revision)
      invalidateStoragePolicies(workspaceId)
    } catch (err) { fail(err, 'Could not update the policy') } finally { setBusy(null) }
  }

  const remove = async (policy: StoragePolicy) => {
    if (!window.confirm(`Delete the storage policy for "${policy.path}"? Files already placed on the targets stay where they are.`)) return
    setBusy(policy.id)
    try {
      await saveStoragePolicies(workspaceId, policies.filter(p => p.id !== policy.id), revision)
      invalidateStoragePolicies(workspaceId)
    } catch (err) { fail(err, 'Could not delete the policy') } finally { setBusy(null) }
  }

  const apply = async (policy: StoragePolicy) => {
    setBusy(policy.id)
    setProgress('Applying…')
    try {
      const totals = await applyStoragePolicyAll(workspaceId, policy.id, (_page, t) => setProgress(`Applying… ${t.matched} planned, ${t.folders} folders`))
      showToast({
        title: totals.failed ? 'Planning errors' : 'Replication queued',
        description: `${totals.matched} documents and ${totals.folders} folders planned${totals.failed ? `, ${totals.failed} failed — see operation status` : ''}.`,
        variant: totals.failed ? 'destructive' : undefined,
      })
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh'))
    } catch (err) { fail(err, 'Could not apply the policy') } finally { setBusy(null); setProgress('') }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <FolderSync className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Storage policies</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          A mirror keeps filed documents on its targets and moves removed copies to Trash. A filing policy makes copies that stay on the targets. Uploads are kept locally until every required destination has been verified.
        </p>
        {status?.error && <p role="alert" className="mt-2 text-xs text-destructive">{status.error.message}</p>}
        {status?.operations?.operations.filter(op => op.state !== 'complete').map(op => <div key={op.id} className="mt-2 rounded border p-2 text-xs"><p>{op.owner}: {op.state}</p><p>{op.error?.message}</p>{op.outcomes.map(target => <p key={`${target.backend}:${target.key}`}>{target.backend}:{target.key} — {target.state}</p>)}{op.state === 'blocked' && <Button size="sm" variant="outline" onClick={() => { void retryStorageOperation(workspaceId, op.id).then(refresh).catch(err => fail(err, 'Retry failed')) }}>Retry</Button>}</div>)}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </section>

      {loading && !policies.length && <p className="text-xs text-muted-foreground">Loading…</p>}

      {!loading && !policies.length && (
        <section className="rounded-lg border border-dashed p-6 text-center">
          <FolderSync className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm">No storage policies yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Right-click a folder in the context or directory tree and choose <span className="font-medium text-foreground">Storage policy…</span> to mirror it to a backend.</p>
        </section>
      )}

      {policies.map(policy => {
        const isBusy = busy === policy.id
        return (
          <section key={policy.id} className={`rounded-lg border p-4 ${policy.enabled ? '' : 'opacity-70'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-all font-mono text-sm font-semibold">{policy.path}</h3>
                  {policy.recursive && <Badge>subfolders</Badge>}
                  <Badge>{describeFilter(policy)}</Badge>
                  {!policy.enabled && <Badge>disabled</Badge>}
                </div>
                {policy.description && <p className="mt-1 text-xs text-muted-foreground">{policy.description}</p>}
                <ul className="mt-2 space-y-1">
                  {policy.targets.map((target, index) => (
                    <li key={`${target.backend}:${index}`} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono">{describePolicyTarget(target)}</span>
                      {target.recursive && <Badge>sub-path</Badge>}
                      {target.recreateDirectories && <Badge>folders</Badge>}
                      {target.key && <Badge title={target.key}>named</Badge>}
                      {target.onConflict && target.onConflict !== 'error' && <Badge>{target.onConflict}</Badge>}
                    </li>
                  ))}
                </ul>
                {isBusy && progress && <p role="status" className="mt-2 text-xs text-muted-foreground">{progress}</p>}
              </div>
              <Switch checked={policy.enabled} disabled={isBusy} onClick={() => toggle(policy)} label={policy.enabled ? 'Disable policy' : 'Enable policy'} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => setEditing(policy)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
              <Button variant="outline" size="sm" disabled={isBusy || !policy.enabled} onClick={() => apply(policy)}><Play className="mr-1 h-3.5 w-3.5" />Apply to existing</Button>
              <Button variant="ghost" size="sm" onClick={() => { void refresh() }}><Activity className="mr-1 h-3.5 w-3.5" />Refresh status</Button>
              <Button variant="ghost" size="sm" disabled={isBusy} className="text-destructive" onClick={() => remove(policy)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
            </div>
          </section>
        )
      })}

      {editing && (
        <StoragePolicyPanel
          workspaceId={workspaceId}
          path={editing.path}
          policy={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { invalidateStoragePolicies(workspaceId); void refresh() }}
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LinkToCard } from './LinkToCard'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from './LinkToSidePanel'
import { buildAutoLinkRules, type AutoLinkDirection, type AutoLinkDestination } from '@/lib/auto-link'
import { addAutoLinkRule, backfillHook } from '@/services/hooks'
import { listBackends } from '@/services/workspace'
import { backendUploadTarget } from '@/lib/backend-upload'
import { useEscapeClose } from '@/hooks/useEscapeClose'

export function AutoLinkFolderPanel({ workspaceId, sourcePath, onClose, onManageRules }: {
  workspaceId: string
  sourcePath: string
  onClose: () => void
  onManageRules: () => void
}) {
  const [destinations, setDestinations] = useState<AutoLinkDestination[]>([])
  const [picker, setPicker] = useState(false)
  const [direction, setDirection] = useState<AutoLinkDirection>('forward')
  const [mode, setMode] = useState<'copy' | 'move'>('copy')
  const [ruleIndex, setRuleIndex] = useState(0)
  const [recursive, setRecursive] = useState(false)
  const [includeExisting, setIncludeExisting] = useState(true)
  const [ruleId] = useState(() => `autolink-${crypto.randomUUID()}`)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const [linked, setLinked] = useState(0)
  const [failed, setFailed] = useState(0)
  useEscapeClose(onClose, !busy && !picker)
  const close = () => { if (!busy) onClose() }

  const save = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const storage = direction === 'forward' ? undefined : backendUploadTarget(sourcePath, await listBackends(workspaceId))
      if (storage?.driver === 'cacache') throw new Error('Choose a backend that preserves folder paths.')
      const rules = buildAutoLinkRules(ruleId, sourcePath, destinations, recursive, direction, mode, storage)
      if (!saved) {
        await addAutoLinkRule(workspaceId, rules)
        setSaved(true)
      }
      if (includeExisting) {
        for (let index = ruleIndex; index < rules.length; index++) {
          let next: number | null = index === ruleIndex ? offset : 0
          while (next !== null) {
            const page = await backfillHook(workspaceId, { ruleId: rules[index].id, limit: 100, offset: next })
            setLinked(count => count + page.matched - page.failed)
            setFailed(count => count + page.failed)
            // Older servers do not expose continuation; never silently claim
            // the entire folder was processed when only its first batch ran.
            if (page.nextOffset === undefined) throw new Error('The rule is enabled, but applying the full folder needs an updated server. Use Rules to rerun existing documents after updating.')
            next = page.nextOffset
            if (next !== null) setOffset(next)
          }
          setRuleIndex(index + 1)
          setOffset(0)
        }
        window.dispatchEvent(new CustomEvent('workspace:documents:refresh'))
        window.dispatchEvent(new CustomEvent('workspace:tree:refresh'))
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not configure Auto-Link')
    } finally { setBusy(false) }
  }

  return <>
    <LinkToSidePanel onClose={close}>
      <section role="dialog" aria-modal="true" aria-labelledby="autolink-title" className={`${LINK_TO_SIDE_SIZE} flex flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-4`}>
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <h2 id="autolink-title" className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" />Auto-Link folder</h2>
          <button type="button" onClick={close} disabled={busy} aria-label="Close" className="p-1 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div><p className="text-xs text-muted-foreground">Backend folder</p><p className="mt-1 break-words text-sm">{sourcePath}</p></div>
          <fieldset disabled={busy || saved} className="space-y-2 text-sm">
            <label className="block font-medium" htmlFor="autolink-direction">Direction</label>
            <select id="autolink-direction" className="w-full rounded-md border bg-background p-2" value={direction} onChange={e => setDirection(e.target.value as AutoLinkDirection)}>
              <option value="forward">Backend → virtual tree</option>
              <option value="reverse">Virtual tree → backend</option>
              <option value="both">Both</option>
            </select>
            <p className="text-xs text-muted-foreground">{direction === 'forward' ? 'Link indexed files into your virtual paths. Files stay where they are.' : 'Store files explicitly added to these virtual paths in the backend folder. Documents appearing through context filters are not copied.'}</p>
            {direction !== 'forward' && <details><summary className="cursor-pointer">Advanced: storage operation</summary>
              <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={mode === 'move'} onChange={e => setMode(e.target.checked ? 'move' : 'copy')} />Move instead of copy — release the source only after the destination is safely stored.</label>
            </details>}
          </fieldset>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Virtual paths</h3>
            {destinations.map((target, index) => <div key={`${target.tree}:${target.path}`} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <div className="min-w-0 flex-1"><span className="text-xs text-muted-foreground">{target.tree === 'context' ? 'Context tree' : 'Directory tree'}</span><p className="break-words">{target.path}</p></div>
              {!saved && <button type="button" aria-label={`Remove ${target.tree}:${target.path}`} disabled={busy} onClick={() => setDestinations(prev => prev.filter((_, i) => i !== index))}><X className="h-4 w-4" /></button>}
            </div>)}
            {!saved && <Button variant="outline" size="sm" disabled={busy} onClick={() => setPicker(true)}><Plus className="mr-1 h-4 w-4" />Add virtual path…</Button>}
            <p className="text-xs text-muted-foreground">Choose a context path, a directory path, or both.</p>
          </div>
          <fieldset disabled={busy || saved} className="space-y-3 text-sm">
            <label className="flex items-start gap-2"><input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} className="mt-1" />Recursive — include subfolders and recreate their structure at each destination</label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={includeExisting} onChange={e => setIncludeExisting(e.target.checked)} className="mt-1" />Apply to existing documents</label>
          </fieldset>
          <p className="text-xs text-muted-foreground">Without Recursive, only direct folder contents are included. Context paths keep their usual layer membership. Both creates two independently manageable rules in workspace Rules. Removing rules keeps existing files and links. Renames and deletions are not synchronized. Filename conflicts stop the transfer without overwriting.</p>
          {busy && <p role="status" className="text-sm">{saved ? `Applying to existing documents… ${linked} processed` : 'Saving Auto-Link…'}</p>}
          {done && <p role="status" className="text-sm">Auto-Link is enabled for future documents.{includeExisting ? ` ${linked} existing document matches processed.` : ''}</p>}
          {failed > 0 && <p role="alert" className="text-sm text-destructive">{failed} document operations failed. Check the rule’s run log in Rules and rerun it after resolving the errors.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{saved ? 'Auto-Link is enabled. ' : ''}{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t p-3">
          <Button variant="ghost" disabled={busy} onClick={onManageRules}>Manage rules</Button>
          {done ? <Button onClick={onClose}>Done</Button> : <Button disabled={busy || !destinations.length} onClick={save}>{busy ? 'Applying…' : saved ? 'Retry existing documents' : 'Enable Auto-Link'}</Button>}
        </div>
      </section>
    </LinkToSidePanel>
    {picker && <LinkToSidePanel onClose={() => setPicker(false)}>
      <LinkToCard fixedWorkspaceName={workspaceId} title="Choose virtual paths" confirmLabel="Add paths" sizeClassName={LINK_TO_SIDE_SIZE} onClose={() => setPicker(false)} onConfirm={(paths, target) => {
        setDestinations(prev => {
          const next = [...prev]
          for (const path of paths) if (!next.some(item => item.tree === target.treeType && item.path === path)) next.push({ tree: target.treeType, path })
          return next
        })
        setPicker(false)
      }} />
    </LinkToSidePanel>}
  </>
}

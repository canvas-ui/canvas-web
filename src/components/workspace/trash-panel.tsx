import { useCallback, useEffect, useMemo, useState } from 'react'
import { RotateCcw, Trash2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { emptyTrash, listTrash, restoreFromTrash, type TrashedDocument } from '@/services/workspace'

/**
 * The workspace trash.
 *
 * A filesystem-style delete (WebDAV, canvas-fuse, the remove action in this UI)
 * detaches a document from a path; if that was its LAST placement it lands here
 * instead of becoming reachable only through the whole-workspace list. So this
 * panel answers two questions: what did I lose track of, and where was it?
 *
 * Restoring re-files a document at every path it held when it was trashed.
 * Emptying is the one place the UI destroys — see docs/data-representation.md.
 */
export function TrashPanel({ workspaceName }: { workspaceName: string }) {
  const { showToast } = useToast()
  const [documents, setDocuments] = useState<TrashedDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [busyIds, setBusyIds] = useState<number[]>([])
  const [confirmingEmpty, setConfirmingEmpty] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setDocuments(await listTrash(workspaceName))
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load the trash',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
    // showToast is stable enough for a manual refresh trigger; re-running on it
    // would reload the list on every toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceName])

  // Fetch on mount / workspace change. The lint rule fires on the setState
  // inside load(), which is the point of the effect — this IS the external
  // system synchronisation an effect is for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const isBusy = useCallback((id: number) => busyIds.includes(id), [busyIds])

  const withBusy = async (ids: number[], fn: () => Promise<void>) => {
    setBusyIds(prev => [...prev, ...ids])
    try { await fn() } finally { setBusyIds(prev => prev.filter(id => !ids.includes(id))) }
  }

  const handleRestore = (document: TrashedDocument) => withBusy([document.id], async () => {
    try {
      const result = await restoreFromTrash(workspaceName, [document.id])
      if (result.failed?.length) {
        // The usual cause is a document trashed with no recorded target; it
        // stays in the trash rather than being stranded outside it.
        showToast({
          title: 'Not restored',
          description: result.failed[0]?.error || 'No restore target recorded',
          variant: 'destructive',
        })
      } else {
        showToast({ title: 'Restored', description: 'Document put back where it was.' })
        setDocuments(prev => prev.filter(doc => doc.id !== document.id))
      }
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to restore',
        variant: 'destructive',
      })
    }
  })

  const handleDestroy = (document: TrashedDocument) => withBusy([document.id], async () => {
    try {
      await emptyTrash(workspaceName, [document.id])
      showToast({ title: 'Deleted', description: 'Document permanently deleted.' })
      setDocuments(prev => prev.filter(doc => doc.id !== document.id))
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete',
        variant: 'destructive',
      })
    }
  })

  const handleEmpty = async () => {
    if (!confirmingEmpty) { setConfirmingEmpty(true); return }
    setConfirmingEmpty(false)
    try {
      const result = await emptyTrash(workspaceName)
      showToast({ title: 'Trash emptied', description: `${result.destroyed?.length ?? 0} document(s) permanently deleted.` })
      setDocuments([])
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to empty the trash',
        variant: 'destructive',
      })
    }
  }

  const rows = useMemo(() => documents.map(document => {
    const display = getDocumentDisplayInfo(document)
    const placements = document.trashed?.placements ?? []
    const origin = placements.flatMap(p => p.paths.map(path => `${p.tree}:${path}`))
    return { document, title: display.title, origin, trashedAt: document.trashed?.trashedAt || null }
  }), [documents])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-sm font-medium">Trash</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Removing a document from a path detaches it; when that was its last place, it lands here so
            nothing goes missing. Restoring puts it back everywhere it was. Emptying deletes for real —
            from the index and from canvas-owned storage, never from external backends.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 max-sm:flex-wrap">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant={confirmingEmpty ? 'destructive' : 'outline'}
            size="sm"
            onClick={handleEmpty}
            onBlur={() => setConfirmingEmpty(false)}
            disabled={documents.length === 0}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {confirmingEmpty ? 'Click again to delete everything' : 'Empty trash'}
          </Button>
        </div>
      </div>

      {isLoading && documents.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!isLoading && documents.length === 0 && (
        <p className="text-sm text-muted-foreground">The trash is empty.</p>
      )}

      {rows.length > 0 && (
        <div className="border rounded-md divide-y">
          {rows.map(({ document, title, origin, trashedAt }) => (
            <div key={document.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {origin.length > 0 ? `from ${origin.join(', ')}` : 'no recorded origin'}
                  {trashedAt ? ` · ${new Date(trashedAt).toLocaleString()}` : ''}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(document)}
                disabled={isBusy(document.id) || origin.length === 0}
                title={origin.length === 0 ? 'Nothing recorded to restore to' : 'Put it back where it was'}
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Restore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDestroy(document)}
                disabled={isBusy(document.id)}
                title="Delete permanently"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TrashPanel

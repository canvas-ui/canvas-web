import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, ArrowRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { LinkToCard } from '@/components/menu/shared/LinkToCard'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from '@/components/menu/shared/LinkToSidePanel'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useDocumentModal } from '@/components/shell/use-document-modal'
import {
  getDocumentRelations,
  createDocumentRelations,
  removeDocumentRelation,
  type DocumentRelation,
  type DocumentRelations,
} from '@/services/workspace'
import { RELATIONS_CHANGED, announceRelationsChanged } from '@/lib/relation-events'
import type { Document } from '@/types/workspace'

// One edge row: the far-side document (clickable — opens it in the shared
// details modal, which is how "query related documents" actually feels) plus a
// remove control for edges a person asserted.
function RelationRow({
  relation, workspaceId, direction, onRemove, removing,
}: {
  relation: DocumentRelation
  workspaceId: string
  direction: 'in' | 'out'
  onRemove: () => void
  removing: boolean
}) {
  const { open } = useDocumentModal()
  const otherId = direction === 'out' ? relation.to : relation.from
  const doc = relation.document ?? null
  // Absence of a meta row IS the asserted-edge convention (synapsd synthesizes
  // src:'doc'), so anything else came from an extractor or an agent. Those are
  // not the user's to delete — re-running their producer owns them.
  const asserted = !relation.meta || relation.meta.src === 'doc'

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
      {direction === 'out'
        ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        : <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      {doc ? <DocumentIcon document={doc} size={3.5} /> : null}
      {doc ? (
        <button
          type="button"
          onClick={() => open(doc as Document, workspaceId)}
          className="min-w-0 flex-1 truncate text-left hover:underline"
          title={`Open document ${otherId}`}
        >
          {getDocumentDisplayInfo(doc).title}
        </button>
      ) : (
        // Edges to documents that no longer exist are legal in synapsd — show
        // the bare id rather than hiding the edge that is still in the index.
        <span className="min-w-0 flex-1 truncate italic text-muted-foreground">Document {otherId} (not available)</span>
      )}
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{otherId}</span>
      {!asserted && (
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={`Derived by ${relation.meta?.src}`}>
          {relation.meta?.src}
        </span>
      )}
      {asserted && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-40"
          title="Remove relation"
          aria-label="Remove relation"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * Typed doc<->doc relations (the synapsd edge plane) for one document: the
 * management half of the Synapses tab. Creation reuses the "Link to…" card,
 * switched to its relations tab — same gesture, a document destination instead
 * of a path one.
 */
export function DocumentRelationsSection({ document, workspaceId }: { document: Document; workspaceId: string }) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const [relations, setRelations] = useState<DocumentRelations | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removingKey, setRemovingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await getDocumentRelations(workspaceId, document.id)
      setRelations(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [workspaceId, document.id])

  // Render-time reset when the host swaps documents, so the previous
  // document's edges never flash under the new one's header.
  const fetchKey = `${workspaceId}:${document.id}`
  const [lastKey, setLastKey] = useState(fetchKey)
  if (fetchKey !== lastKey) {
    setLastKey(fetchKey)
    setRelations(null)
    setError(null)
  }

  useEffect(() => {
    // Wrapped rather than called bare so the read is asynchronous from the
    // effect's point of view — nothing sets state synchronously in its body.
    async function loadRelations() { await load() }
    loadRelations()
    window.addEventListener(RELATIONS_CHANGED, loadRelations)
    return () => window.removeEventListener(RELATIONS_CHANGED, loadRelations)
  }, [load])

  const remove = async (relation: DocumentRelation, direction: 'in' | 'out') => {
    const otherId = direction === 'out' ? relation.to : relation.from
    if (otherId == null) return
    const key = `${direction}:${relation.p}:${otherId}`
    setRemovingKey(key)
    try {
      await removeDocumentRelation(workspaceId, document.id, relation.p, otherId, direction)
      showSuccessToast('Relation removed')
      announceRelationsChanged()
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Failed to remove relation')
    } finally {
      setRemovingKey(null)
    }
  }

  const groups: { dir: 'out' | 'in'; title: string; hint: string; entries: DocumentRelation[] }[] = [
    { dir: 'out', title: 'Points at', hint: 'this document as the subject', entries: relations?.outgoing ?? [] },
    { dir: 'in', title: 'Pointed at by', hint: 'this document as the object', entries: relations?.incoming ?? [] },
  ]

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold">Documents</h3>
        <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
          <Plus className="mr-1 h-3 w-3" /> Add relation
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p>
        : !relations ? <p className="text-sm text-muted-foreground">Loading relations…</p>
        : groups.every(g => g.entries.length === 0)
          ? <p className="text-sm text-muted-foreground">No related documents.</p>
          : (
            <div className="space-y-4">
              {groups.filter(g => g.entries.length > 0).map(({ dir, title, hint, entries }) => (
                <div key={dir}>
                  <p className="mb-1 text-xs font-medium text-muted-foreground" title={hint}>{title}</p>
                  {/* Grouped by predicate: the predicate is the relationship,
                      and repeating it on every row reads as noise. */}
                  {Array.from(new Set(entries.map(e => e.p))).map(p => (
                    <div key={p} className="mb-2">
                      <p className="px-2 font-mono text-[11px] text-muted-foreground">{p}</p>
                      {entries.filter(e => e.p === p).map((relation) => {
                        const otherId = dir === 'out' ? relation.to : relation.from
                        const key = `${dir}:${relation.p}:${otherId}`
                        return (
                          <RelationRow
                            key={key}
                            relation={relation}
                            workspaceId={workspaceId}
                            direction={dir}
                            removing={removingKey === key}
                            onRemove={() => void remove(relation, dir)}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

      {/* Same right-edge geometry as every other "Link to…" — z-picker (60)
          puts it above the object card's own modal (z-dialog, 50). */}
      {picking && (
        <LinkToSidePanel onClose={() => { if (!saving) setPicking(false) }}>
            <LinkToCard
              sizeClassName={LINK_TO_SIDE_SIZE}
              title="Relate to…"
              tabs={['relations']}
              fixedWorkspaceName={workspaceId}
              documentCount={1}
              saving={saving}
              relationPredicates={relations?.predicates}
              // A document cannot be related to itself.
              relationExcludeIds={new Set([document.id])}
              onClose={() => setPicking(false)}
              onConfirm={() => {}}
              onConfirmRelation={async ({ predicate, direction, targetIds }) => {
                setSaving(true)
                try {
                  await createDocumentRelations(workspaceId, document.id, predicate, targetIds, direction)
                  showSuccessToast(`Related to ${targetIds.length} document${targetIds.length !== 1 ? 's' : ''}`)
                  setPicking(false)
                  announceRelationsChanged()
                } catch (e) {
                  showErrorToast(e instanceof Error ? e.message : 'Failed to create relation')
                } finally {
                  setSaving(false)
                }
              }}
            />
        </LinkToSidePanel>
      )}
    </div>
  )
}

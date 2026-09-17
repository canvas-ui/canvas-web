import { useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { LinkToCard } from '@/components/menu/shared/LinkToCard'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from '@/components/menu/shared/LinkToSidePanel'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { cn } from '@/lib/utils'
import { DEFAULT_RELATION_PREDICATE, type RelationFieldsState } from './useRelationFields'

// "Related documents" block shared by the add forms: the pending relation rows
// (predicate + axis + target) and the picker that adds more. The picker is the
// same "Link to…" card the Synapses tab uses, switched to its relations tab —
// the confirm appends rows here instead of writing edges, because there is no
// subject id yet (see useRelationFields).
export function RelationFields({ f, idPrefix }: { f: RelationFieldsState; idPrefix: string }) {
  const [picking, setPicking] = useState(false)
  const [adding, setAdding] = useState(false)
  const disabled = !f.workspaceName

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>Related documents</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={disabled}
          onClick={() => setPicking(true)}
          title={disabled ? 'No workspace to relate within' : 'Pick documents the new one relates to'}
        >
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>

      {f.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None. Relations are written right after the document is created.</p>
      ) : (
        <ul className="space-y-1">
          {f.rows.map((row, i) => {
            const title = row.document ? getDocumentDisplayInfo(row.document).title : `Document ${row.targetId}`
            const selectId = `${idPrefix}-relation-${i}`
            return (
              <li key={`${row.direction}:${row.predicate}:${row.targetId}`} className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-sm">
                {/* Axis toggle: which side is the subject. */}
                <button
                  type="button"
                  onClick={() => f.update(i, { direction: row.direction === 'out' ? 'in' : 'out' })}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={row.direction === 'out'
                    ? `The new document ${row.predicate} this one (click to flip)`
                    : `This document ${row.predicate} the new one (click to flip)`}
                  aria-label="Flip relation direction"
                >
                  {row.direction === 'out' ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
                </button>
                <label htmlFor={selectId} className="sr-only">Predicate</label>
                <select
                  id={selectId}
                  value={row.predicate}
                  onChange={(e) => f.update(i, { predicate: e.target.value })}
                  className="w-[9.5rem] shrink-0 rounded-md border border-input bg-background px-1.5 py-1 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {(f.predicates.includes(row.predicate) ? f.predicates : [row.predicate, ...f.predicates]).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {row.document ? <DocumentIcon document={row.document} size={3.5} /> : null}
                <span className={cn('min-w-0 flex-1 truncate', !row.document && 'italic text-muted-foreground')} title={`#${row.targetId}`}>
                  {title}
                </span>
                <button
                  type="button"
                  onClick={() => f.remove(i)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove"
                  aria-label="Remove relation"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {picking && f.workspaceName && (
        <LinkToSidePanel onClose={() => { if (!adding) setPicking(false) }}>
          <LinkToCard
            sizeClassName={LINK_TO_SIDE_SIZE}
            title="Relate to…"
            confirmLabel="Add"
            tabs={['relations']}
            fixedWorkspaceName={f.workspaceName}
            documentCount={1}
            saving={adding}
            relationPredicates={f.predicates.length ? f.predicates : [DEFAULT_RELATION_PREDICATE]}
            relationExcludeIds={new Set(f.rows.map((r) => r.targetId))}
            onClose={() => setPicking(false)}
            onConfirm={() => {}}
            onConfirmRelation={async ({ predicate, direction, targetIds }) => {
              setAdding(true)
              try {
                await f.add(predicate, direction, targetIds)
                setPicking(false)
              } finally {
                setAdding(false)
              }
            }}
          />
        </LinkToSidePanel>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Document } from '@/types/workspace'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { ObjectPropertiesModal } from '@/components/object-card/ObjectPropertiesModal'
import { type BoardColumnConfig } from '@/components/common/content-views'

/**
 * Column-based overview of a task container (tree path/layer): one column per
 * document family — Emails | Todos | Notes | Links | Files… — so opening
 * /work/…/tasks/bar reads as a project dashboard. Columns are configurable
 * and each carries its own free-text filter under the header; both persist
 * with the view (layer metadata). Cards stay schema-generic here — the
 * context-aware apps (mail, todos, …) are the richer consumers.
 */

// Add-column choices. `schemas` are prefixes (see BoardColumnConfig).
const KNOWN_COLUMNS: Array<Omit<BoardColumnConfig, 'filter'>> = [
  { id: 'emails', label: 'Emails', schemas: ['data/schema/message'] },
  { id: 'todos', label: 'Todos', schemas: ['data/schema/task'] },
  { id: 'notes', label: 'Notes', schemas: ['data/schema/note'] },
  { id: 'links', label: 'Links', schemas: ['data/schema/tab', 'data/schema/link'] },
  { id: 'files', label: 'Files', schemas: ['data/schema/file'] },
]

function matchesSchemas(document: Document, schemas: string[]): boolean {
  return schemas.some((s) => document.schema === s || document.schema.startsWith(`${s}/`))
}

interface SchemaColumnsBoardProps {
  documents: Document[]
  workspaceId?: string
  columns: BoardColumnConfig[]
  /** Persist a column-config change (add/remove/filter). */
  onColumnsChange: (columns: BoardColumnConfig[]) => void
  readOnly?: boolean
}

export function SchemaColumnsBoard({ documents, workspaceId, columns, onColumnsChange, readOnly = false }: SchemaColumnsBoardProps) {
  const [openDocument, setOpenDocument] = useState<Document | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  // Filters are edited locally per keystroke and persisted on blur/Enter so a
  // PATCH doesn't fire per character.
  const [filterDrafts, setFilterDrafts] = useState<Record<string, string>>({})

  const commitFilter = (columnId: string) => {
    const draft = filterDrafts[columnId]
    if (draft === undefined) return
    const current = columns.find((c) => c.id === columnId)
    if (current && (current.filter || '') !== draft) {
      onColumnsChange(columns.map((c) => (c.id === columnId ? { ...c, filter: draft || undefined } : c)))
    }
  }

  const addableColumns = KNOWN_COLUMNS.filter((k) => !columns.some((c) => c.id === k.id))

  return (
    <div className="flex-1 min-h-0 overflow-x-auto" data-testid="schema-columns-board">
      <div className="flex h-full min-w-max gap-3 pb-2 pr-2">
        {columns.map((column) => {
          const filterText = (filterDrafts[column.id] ?? column.filter ?? '').toLowerCase()
          const columnDocuments = documents
            .filter((d) => matchesSchemas(d, column.schemas))
            .filter((d) => {
              if (!filterText) return true
              const display = getDocumentDisplayInfo(d)
              return `${display.title}\n${display.preview}\n${display.subtitle}`.toLowerCase().includes(filterText)
            })

          return (
            <div key={column.id} className="flex h-full w-72 shrink-0 flex-col rounded-lg border bg-muted/20">
              <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
                <span className="truncate text-sm font-medium">{column.label}</span>
                <span className="text-xs text-muted-foreground">{columnDocuments.length}</span>
                <span className="flex-1" />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onColumnsChange(columns.filter((c) => c.id !== column.id))}
                    title="Remove column"
                    className="rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="px-3 pb-2">
                <input
                  value={filterDrafts[column.id] ?? column.filter ?? ''}
                  onChange={(e) => setFilterDrafts((prev) => ({ ...prev, [column.id]: e.target.value }))}
                  onBlur={() => commitFilter(column.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitFilter(column.id) }}
                  placeholder="Filter…"
                  readOnly={readOnly}
                  className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
                {columnDocuments.map((document) => {
                  const display = getDocumentDisplayInfo(document)
                  return (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => setOpenDocument(document)}
                      className="w-full rounded-md border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-1.5">
                        <DocumentIcon document={document} size={3.5} />
                        <span className="truncate text-xs font-medium" title={display.title}>{display.title}</span>
                      </div>
                      {display.preview && (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{display.preview}</p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground/70">
                        {new Date(document.updatedAt || document.createdAt).toLocaleDateString()}
                      </p>
                    </button>
                  )
                })}
                {columnDocuments.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground/60">Empty</p>
                )}
              </div>
            </div>
          )
        })}

        {!readOnly && addableColumns.length > 0 && (
          <div className="flex h-full w-44 shrink-0 flex-col">
            {addingColumn ? (
              <div className="rounded-lg border bg-muted/20 p-2">
                {addableColumns.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => { setAddingColumn(false); onColumnsChange([...columns, { ...k }]) }}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  >
                    {k.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAddingColumn(false)}
                  className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground/60 hover:bg-accent/50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingColumn(true)}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Column
              </button>
            )}
          </div>
        )}
      </div>

      <ObjectPropertiesModal
        document={openDocument}
        isOpen={openDocument !== null}
        onClose={() => setOpenDocument(null)}
        workspaceId={workspaceId}
      />
    </div>
  )
}

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
  // Live width while dragging a column edge; persisted once on pointer-up.
  const [widthDrafts, setWidthDrafts] = useState<Record<string, number>>({})

  const startResize = (e: React.PointerEvent, columnId: string) => {
    e.preventDefault()
    const columnEl = (e.currentTarget as HTMLElement).parentElement
    if (!columnEl) return
    const startX = e.clientX
    const startWidth = columnEl.getBoundingClientRect().width
    let latest = startWidth
    const onMove = (ev: PointerEvent) => {
      latest = Math.min(900, Math.max(220, startWidth + ev.clientX - startX))
      setWidthDrafts((prev) => ({ ...prev, [columnId]: latest }))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onColumnsChange(columns.map((c) => (c.id === columnId ? { ...c, width: Math.round(latest) } : c)))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const resetWidth = (columnId: string) => {
    setWidthDrafts((prev) => { const next = { ...prev }; delete next[columnId]; return next })
    onColumnsChange(columns.map((c) => (c.id === columnId ? { ...c, width: undefined } : c)))
  }

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
    // Snap-scrolling flex row: swipe (or scroll) horizontally column by
    // column; each column scrolls vertically on its own. h-full works because
    // the DefaultCanvas content pane has a definite height (flex-1 min-h-0).
    <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 pr-2" data-testid="schema-columns-board">
        {columns.map((column) => {
          const filterText = (filterDrafts[column.id] ?? column.filter ?? '').toLowerCase()
          const columnDocuments = documents
            .filter((d) => matchesSchemas(d, column.schemas))
            .filter((d) => {
              if (!filterText) return true
              const display = getDocumentDisplayInfo(d)
              return `${display.title}\n${display.preview}\n${display.subtitle}`.toLowerCase().includes(filterText)
            })

          const draggedWidth = widthDrafts[column.id] ?? column.width

          return (
            // Viewport-proportional widths: ~1 column on a phone (with a peek
            // of the next), 2 / 3 / 4 as the pane widens. Percentages resolve
            // against the scroll container, so a narrow side pane gets the
            // same column-per-swipe feel as a full-width monitor. A dragged
            // width (right-edge handle) overrides the responsive default.
            <div
              key={column.id}
              className="relative flex h-full min-h-0 shrink-0 grow-0 basis-[85%] snap-start flex-col rounded-lg border bg-muted/20 sm:basis-[48%] lg:basis-[32%] xl:basis-[24%]"
              style={draggedWidth ? { flexBasis: draggedWidth } : undefined}
            >
              {!readOnly && (
                <div
                  onPointerDown={(e) => startResize(e, column.id)}
                  onDoubleClick={() => resetWidth(column.id)}
                  title="Drag to resize — double-click to reset"
                  className="absolute -right-2 inset-y-0 z-10 w-3 cursor-col-resize touch-none"
                />
              )}
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

        {/* Add-column control — sticky at the right edge of the scroll row so
            it is always reachable without swiping to the end (that's also how
            a removed column comes back: it returns to this list). */}
        {!readOnly && addableColumns.length > 0 && (
          <div className="sticky right-0 z-20 flex h-full shrink-0 flex-col items-end pl-1">
            {addingColumn ? (
              <div className="w-40 rounded-lg border bg-background p-2 shadow-elevation-2">
                <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Add column</p>
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
                title="Add column"
                aria-label="Add column"
                className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background/90 text-muted-foreground shadow-elevation-1 backdrop-blur hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        <ObjectPropertiesModal
          document={openDocument}
          isOpen={openDocument !== null}
          onClose={() => setOpenDocument(null)}
          workspaceId={workspaceId}
        />
    </div>
  )
}

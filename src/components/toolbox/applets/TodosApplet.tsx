import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, CheckCircle2, Circle, Eye, EyeOff, Loader2, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppletTarget, type AppletTarget } from './applet-target'
import { submitDocuments, describeTarget } from '../add/useAddTarget'
import { updateWorkspaceDocument } from '@/services/workspace'
import { TODO_SCHEMA } from '@/components/renderers/types'
import { buildTodoData, todayEndOfDayLocal, type TodoStatus, TODO_STATUS_LABELS } from '../add/useTodoFields'
import type { Document } from '@/types/workspace'
import type { AppletProps } from './registry'
import {
  APPLET_AUTOSAVE_MS, GrowingTextarea, ItemActions, LinkDocOverlay, formatCreated, useAppletDocs,
} from './shared'

const TODO_SCHEMA_VERSION = '2.1'

// Done = anything the user no longer acts on.
const DONE_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled'])

function formatDue(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// One todo in the stack - the Notes item plus a status checkbox; the body is
// the todo's description. Title/description autosave like a note, the
// checkbox writes through immediately.
function TodoItem({
  doc,
  updateWorkspace,
  registerEl,
  registerBody,
  highlighted,
  onLinkTo,
  onDelete,
  onStatusSaved,
}: {
  doc: Document
  updateWorkspace: string | null
  registerEl: (id: number, el: HTMLDivElement | null) => void
  registerBody: (id: number, el: HTMLTextAreaElement | null) => void
  highlighted: boolean
  onLinkTo: () => void
  onDelete: () => void
  onStatusSaved: (id: number, status: TodoStatus) => void
}) {
  const [title, setTitle] = useState(String(doc.data?.title ?? ''))
  const [description, setDescription] = useState(String(doc.data?.description ?? ''))
  const [itemStatus, setItemStatus] = useState<TodoStatus>((doc.data?.status as TodoStatus) || 'pending')
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const baseline = useRef({ title: String(doc.data?.title ?? ''), description: String(doc.data?.description ?? '') })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSeq = useRef(0)

  const persist = useCallback(async (next: { title: string; description: string; status: TodoStatus }) => {
    if (!updateWorkspace) return
    // A todo without a title fails schema-side; keep the last titled save.
    if (!next.title.trim()) return
    const seq = ++saveSeq.current
    setSaveState('saving')
    try {
      await updateWorkspaceDocument(updateWorkspace, {
        id: doc.id,
        schema: doc.schema,
        schemaVersion: doc.schemaVersion,
        data: {
          ...(doc.data || {}),
          title: next.title.trim(),
          ...(next.description.trim() ? { description: next.description.trim() } : { description: undefined }),
          status: next.status,
          completed: next.status === 'completed',
        },
        metadata: doc.metadata,
      })
      if (seq !== saveSeq.current) return
      baseline.current = { title: next.title, description: next.description }
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
    } catch {
      if (seq === saveSeq.current) setSaveState('error')
    }
  }, [doc.id, doc.schema, doc.schemaVersion, doc.data, doc.metadata, updateWorkspace])

  const scheduleSave = useCallback((nextTitle: string, nextDescription: string) => {
    if (nextTitle === baseline.current.title && nextDescription === baseline.current.description) return
    setSaveState('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => persist({ title: nextTitle, description: nextDescription, status: itemStatus }), APPLET_AUTOSAVE_MS)
  }, [persist, itemStatus])

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    persist({ title, description, status: itemStatus })
  }, [persist, title, description, itemStatus])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const toggleDone = useCallback(async () => {
    const next: TodoStatus = itemStatus === 'completed' ? 'pending' : 'completed'
    setItemStatus(next)
    await persist({ title, description, status: next })
    onStatusSaved(doc.id, next)
  }, [itemStatus, persist, title, description, doc.id, onStatusSaved])

  const done = DONE_STATUSES.has(itemStatus)
  const due = formatDue(doc.data?.dueDate as string | undefined)

  return (
    <div
      ref={(el) => registerEl(doc.id, el)}
      className={cn(
        'group border-t border-border/60 px-4 py-3 transition-colors',
        highlighted && 'bg-primary/5',
      )}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {formatCreated(doc.createdAt)} · #{doc.id}
          {due && <span> · due {due}</span>}
          {itemStatus !== 'pending' && <span> · {TODO_STATUS_LABELS[itemStatus] ?? itemStatus}</span>}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
          {saveState === 'saving' && <Loader2 className="inline h-3 w-3 animate-spin" />}
          {saveState === 'saved' && <Check className="inline h-3 w-3 text-success" />}
          {saveState === 'dirty' && '·'}
          {saveState === 'error' && <span className="text-destructive">save failed</span>}
          <ItemActions onLinkTo={onLinkTo} onDelete={onDelete} />
        </span>
      </div>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggleDone}
          className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={done ? 'Mark as pending' : 'Mark as completed'}
          title={done ? 'Mark as pending' : 'Mark as completed'}
        >
          {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); scheduleSave(e.target.value, description) }}
            onBlur={flush}
            placeholder="Untitled"
            spellCheck={false}
            className={cn(
              'mb-1 w-full border-0 bg-transparent p-0 text-sm font-semibold outline-none placeholder:text-muted-foreground/50',
              done ? 'text-muted-foreground line-through' : 'text-foreground',
            )}
          />
          <GrowingTextarea
            value={description}
            onChange={(v) => { setDescription(v); scheduleSave(title, v) }}
            onBlur={flush}
            placeholder="Description…"
            innerRef={(el) => registerBody(doc.id, el)}
          />
        </div>
      </div>
    </div>
  )
}

// Inline creation - due defaults to end of today, matching every other todo
// add surface.
function DraftTodo({ target, onCreated, onCancel }: { target: AppletTarget; onCreated: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!title.trim() || !target || saving) return
    setSaving(true)
    setError(null)
    try {
      await submitDocuments(target, [{
        schema: TODO_SCHEMA,
        schemaVersion: TODO_SCHEMA_VERSION,
        data: buildTodoData({ title, description, status: 'pending', priority: '', due: todayEndOfDayLocal() }),
        metadata: { features: [] },
      }])
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create todo')
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-border/60 bg-muted/30 px-4 py-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">New todo · due today</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Discard draft">
          <X className="h-3 w-3" />
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        autoFocus
        spellCheck={false}
        className="mb-1 w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <GrowingTextarea value={description} onChange={setDescription} placeholder="Description (optional)…" />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={create}
          disabled={!title.trim() || saving}
          className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save todo'}
        </button>
      </div>
    </div>
  )
}

export function TodosApplet({ autoAdd = false }: AppletProps) {
  const target = useAppletTarget()
  const { docs, setDocs, loading, error, scope, reload, removeDoc } = useAppletDocs(target, TODO_SCHEMA)

  const [query, setQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const [showDone, setShowDone] = useState(false)
  const [adding, setAdding] = useState(autoAdd)
  const [linkDocId, setLinkDocId] = useState<number | null>(null)

  const itemEls = useRef(new Map<number, HTMLDivElement>())
  const bodyEls = useRef(new Map<number, HTMLTextAreaElement>())
  const registerEl = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) itemEls.current.set(id, el); else itemEls.current.delete(id)
  }, [])
  const registerBody = useCallback((id: number, el: HTMLTextAreaElement | null) => {
    if (el) bodyEls.current.set(id, el); else bodyEls.current.delete(id)
  }, [])

  const handleDelete = useCallback(async (doc: Document) => {
    const label = doc.data?.title ? `"${doc.data.title}"` : `#${doc.id}`
    if (!window.confirm(`Delete todo ${label}?\n\nIt is removed from this path and moves to the workspace trash if nothing else links it.`)) return
    try { await removeDoc(doc.id) } catch { /* toast handled globally */ }
  }, [removeDoc])

  // Keep the doc list's copy of a status in sync after a checkbox write, so
  // the done filter reacts without a reload.
  const handleStatusSaved = useCallback((id: number, status: TodoStatus) => {
    setDocs(prev => prev.map(d => d.id === id
      ? { ...d, data: { ...(d.data || {}), status, completed: status === 'completed' } }
      : d))
  }, [setDocs])

  const sorted = useMemo(() => {
    const list = showDone ? [...docs] : docs.filter(d => !DONE_STATUSES.has(String(d.data?.status ?? 'pending')))
    list.sort((a, b) => {
      const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return order === 'asc' ? d : -d
    })
    return list
  }, [docs, order, showDone])

  const hiddenDone = useMemo(
    () => docs.filter(d => DONE_STATUSES.has(String(d.data?.status ?? 'pending'))).length,
    [docs],
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as { docId: number; offset: number }[]
    const out: { docId: number; offset: number }[] = []
    for (const doc of sorted) {
      const description = String(doc.data?.description ?? '')
      const title = String(doc.data?.title ?? '')
      const at = description.toLowerCase().indexOf(q)
      if (at >= 0) out.push({ docId: doc.id, offset: at })
      else if (title.toLowerCase().includes(q)) out.push({ docId: doc.id, offset: -1 })
    }
    return out
  }, [query, sorted])

  useEffect(() => { setMatchIdx(0) }, [query])

  const currentMatch = matches.length ? matches[Math.min(matchIdx, matches.length - 1)] : null

  useEffect(() => {
    if (!currentMatch) return
    itemEls.current.get(currentMatch.docId)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentMatch])

  const confirmMatch = useCallback((advance: boolean) => {
    if (!matches.length) return
    const idx = advance ? (matchIdx + 1) % matches.length : matchIdx
    if (advance) setMatchIdx(idx)
    const m = matches[idx]
    const body = bodyEls.current.get(m.docId)
    if (body && m.offset >= 0) {
      body.focus()
      body.setSelectionRange(m.offset, m.offset + query.trim().length)
    }
    itemEls.current.get(m.docId)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [matches, matchIdx, query])

  if (!target) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {describeTarget(target)}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmMatch(true) } }}
            placeholder="Search todos…"
            spellCheck={false}
            className="w-full rounded-md border border-input bg-transparent py-1 pl-7 pr-14 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
          {query.trim() && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground">
              {matches.length ? `${Math.min(matchIdx + 1, matches.length)}/${matches.length}` : '0/0'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className={cn(
            'rounded-md border p-1.5 transition-colors',
            showDone
              ? 'border-foreground text-foreground'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          title={showDone ? 'Hide done items' : `Show done items${hiddenDone ? ` (${hiddenDone})` : ''}`}
          aria-label={showDone ? 'Hide done items' : 'Show done items'}
        >
          {showDone ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
          className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={order === 'desc' ? 'Newest first (click for oldest first)' : 'Oldest first (click for newest first)'}
          aria-label="Toggle sort order"
        >
          {order === 'desc' ? <ArrowDownWideNarrow className="h-3.5 w-3.5" /> : <ArrowUpNarrowWide className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs text-primary-foreground"
          title="Add a todo"
        >
          <Plus className="h-3.5 w-3.5" />
          Todo
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {adding && (
          <DraftTodo
            target={target}
            onCreated={() => { setAdding(false); reload() }}
            onCancel={() => setAdding(false)}
          />
        )}

        {loading && !docs.length && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="px-4 py-6 text-center text-sm text-destructive">{error}</p>}
        {!loading && !error && !sorted.length && !adding && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {hiddenDone
              ? `Nothing pending - ${hiddenDone} done item${hiddenDone > 1 ? 's' : ''} hidden.`
              : 'No todos here yet - add the first one.'}
          </p>
        )}

        {sorted.map((doc) => (
          <TodoItem
            key={doc.id}
            doc={doc}
            updateWorkspace={scope?.workspaceName ?? null}
            registerEl={registerEl}
            registerBody={registerBody}
            highlighted={currentMatch?.docId === doc.id}
            onLinkTo={() => setLinkDocId(doc.id)}
            onDelete={() => handleDelete(doc)}
            onStatusSaved={handleStatusSaved}
          />
        ))}
      </div>

      {linkDocId !== null && (
        <LinkDocOverlay documentId={linkDocId} onClose={() => setLinkDocId(null)} />
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Loader2, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppletTarget, type AppletTarget } from './applet-target'
import { submitDocuments, describeTarget } from '../add/useAddTarget'
import { updateWorkspaceDocument } from '@/services/workspace'
import { NOTE_SCHEMA } from '@/components/renderers/types'
import type { Document } from '@/types/workspace'
import type { AppletProps } from './registry'
import {
  APPLET_AUTOSAVE_MS, GrowingTextarea, ItemActions, LinkDocOverlay, formatCreated, useAppletDocs,
} from './shared'

const NOTE_SCHEMA_VERSION = '2.0'

// The Notes applet: every note visible in the bound target, stacked in one
// editable document view - as close to a notepad as the data model allows.
// Title and body write back through the normal document update path (debounced
// + flushed on blur); search scrolls to the match and Enter selects it in the
// body like a desktop editor's find.

interface NoteMatch {
  docId: number
  offset: number // offset into content (title-only matches use offset -1)
}

// One note in the stack. Owns its edit drafts and autosave lifecycle so a slow
// save on one note never blocks typing in another.
function NoteItem({
  doc,
  updateWorkspace,
  registerEl,
  registerBody,
  highlighted,
  onLinkTo,
  onDelete,
}: {
  doc: Document
  updateWorkspace: string | null
  registerEl: (id: number, el: HTMLDivElement | null) => void
  registerBody: (id: number, el: HTMLTextAreaElement | null) => void
  highlighted: boolean
  onLinkTo: () => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(String(doc.data?.title ?? ''))
  const [content, setContent] = useState(String(doc.data?.content ?? ''))
  const [status, setStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  // Baseline = last persisted values; dirty is a comparison, not a flag that
  // can drift out of sync with what actually saved.
  const baseline = useRef({ title: String(doc.data?.title ?? ''), content: String(doc.data?.content ?? '') })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSeq = useRef(0)

  const save = useCallback(async (nextTitle: string, nextContent: string) => {
    if (!updateWorkspace) return
    if (nextTitle === baseline.current.title && nextContent === baseline.current.content) return
    // An emptied body would fail schema-side; keep the last non-empty save.
    if (!nextContent.trim()) return
    const seq = ++saveSeq.current
    setStatus('saving')
    try {
      await updateWorkspaceDocument(updateWorkspace, {
        id: doc.id,
        schema: doc.schema,
        schemaVersion: doc.schemaVersion,
        data: {
          ...(doc.data || {}),
          ...(nextTitle.trim() ? { title: nextTitle.trim() } : { title: undefined }),
          content: nextContent,
        },
        metadata: doc.metadata,
      })
      if (seq !== saveSeq.current) return
      baseline.current = { title: nextTitle, content: nextContent }
      setStatus('saved')
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1500)
    } catch {
      if (seq === saveSeq.current) setStatus('error')
    }
  }, [doc.id, doc.schema, doc.schemaVersion, doc.data, doc.metadata, updateWorkspace])

  const scheduleSave = useCallback((nextTitle: string, nextContent: string) => {
    setStatus('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(nextTitle, nextContent), APPLET_AUTOSAVE_MS)
  }, [save])

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    save(title, content)
  }, [save, title, content])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div
      ref={(el) => registerEl(doc.id, el)}
      className={cn(
        'group border-t border-border/60 px-4 py-3 transition-colors',
        highlighted && 'bg-primary/5',
      )}
    >
      {/* Muted meta line - date is immutable, id aids cross-referencing. */}
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {formatCreated(doc.createdAt)} · #{doc.id}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
          {status === 'saving' && <Loader2 className="inline h-3 w-3 animate-spin" />}
          {status === 'saved' && <Check className="inline h-3 w-3 text-success" />}
          {status === 'dirty' && '·'}
          {status === 'error' && <span className="text-destructive">save failed</span>}
          <ItemActions onLinkTo={onLinkTo} onDelete={onDelete} />
        </span>
      </div>
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); scheduleSave(e.target.value, content) }}
        onBlur={flush}
        placeholder="Untitled"
        spellCheck={false}
        className="mb-1 w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <GrowingTextarea
        value={content}
        onChange={(v) => { setContent(v); scheduleSave(title, v) }}
        onBlur={flush}
        innerRef={(el) => registerBody(doc.id, el)}
      />
    </div>
  )
}

// Inline creation - a blank note pinned above the list, saved into the bound
// target like the toolbox NoteForm.
function DraftNote({ target, onCreated, onCancel }: { target: AppletTarget; onCreated: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!content.trim() || !target || saving) return
    setSaving(true)
    setError(null)
    try {
      await submitDocuments(target, [{
        schema: NOTE_SCHEMA,
        schemaVersion: NOTE_SCHEMA_VERSION,
        data: { ...(title.trim() ? { title: title.trim() } : {}), content },
        metadata: { features: [] },
      }])
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note')
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-border/60 bg-muted/30 px-4 py-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">New note</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Discard draft">
          <X className="h-3 w-3" />
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled"
        autoFocus
        spellCheck={false}
        className="mb-1 w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <GrowingTextarea value={content} onChange={setContent} placeholder="Write your note…" />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={create}
          disabled={!content.trim() || saving}
          className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </div>
  )
}

export function NotesApplet({ autoAdd = false }: AppletProps) {
  const target = useAppletTarget()
  const { docs, loading, error, scope, reload, removeDoc } = useAppletDocs(target, NOTE_SCHEMA)

  const [query, setQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const [adding, setAdding] = useState(autoAdd)
  const [linkDocId, setLinkDocId] = useState<number | null>(null)

  const noteEls = useRef(new Map<number, HTMLDivElement>())
  const bodyEls = useRef(new Map<number, HTMLTextAreaElement>())
  const registerEl = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) noteEls.current.set(id, el); else noteEls.current.delete(id)
  }, [])
  const registerBody = useCallback((id: number, el: HTMLTextAreaElement | null) => {
    if (el) bodyEls.current.set(id, el); else bodyEls.current.delete(id)
  }, [])

  const handleDelete = useCallback(async (doc: Document) => {
    const label = doc.data?.title ? `"${doc.data.title}"` : `#${doc.id}`
    if (!window.confirm(`Delete note ${label}?\n\nIt is removed from this path and moves to the workspace trash if nothing else links it.`)) return
    try { await removeDoc(doc.id) } catch { /* toast handled globally */ }
  }, [removeDoc])

  const sorted = useMemo(() => {
    const list = [...docs]
    list.sort((a, b) => {
      const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return order === 'asc' ? d : -d
    })
    return list
  }, [docs, order])

  // Full-text matches across the loaded notes, in display order. Typing
  // scrolls to the current match; Enter selects it in the body (find-style).
  const matches = useMemo<NoteMatch[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: NoteMatch[] = []
    for (const doc of sorted) {
      const content = String(doc.data?.content ?? '')
      const title = String(doc.data?.title ?? '')
      const at = content.toLowerCase().indexOf(q)
      if (at >= 0) out.push({ docId: doc.id, offset: at })
      else if (title.toLowerCase().includes(q)) out.push({ docId: doc.id, offset: -1 })
    }
    return out
  }, [query, sorted])

  useEffect(() => { setMatchIdx(0) }, [query])

  const currentMatch = matches.length ? matches[Math.min(matchIdx, matches.length - 1)] : null

  useEffect(() => {
    if (!currentMatch) return
    noteEls.current.get(currentMatch.docId)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentMatch])

  // Enter: advance + select the match text inside the note body, so the caret
  // lands exactly where the hit is.
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
    noteEls.current.get(m.docId)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
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
      {/* Controls: search / sort / add. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmMatch(true) } }}
            placeholder="Search notes…"
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
          title="Add a note"
        >
          <Plus className="h-3.5 w-3.5" />
          Note
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {adding && (
          <DraftNote
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
            No notes here yet - add the first one.
          </p>
        )}

        {sorted.map((doc) => (
          <NoteItem
            key={doc.id}
            doc={doc}
            updateWorkspace={scope?.workspaceName ?? null}
            registerEl={registerEl}
            registerBody={registerBody}
            highlighted={currentMatch?.docId === doc.id}
            onLinkTo={() => setLinkDocId(doc.id)}
            onDelete={() => handleDelete(doc)}
          />
        ))}
      </div>

      {linkDocId !== null && (
        <LinkDocOverlay documentId={linkDocId} onClose={() => setLinkDocId(null)} />
      )}
    </div>
  )
}

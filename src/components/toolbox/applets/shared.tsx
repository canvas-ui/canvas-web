import { useCallback, useEffect, useRef, useState } from 'react'
import { Link2, Trash2 } from 'lucide-react'
import { LinkToCard, type LinkToTarget } from '@/components/menu/shared/LinkToCard'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import {
  getWorkspaceDocuments,
  deleteWorkspaceDocuments,
  pasteDocumentsToWorkspacePath,
  DEFAULT_WORKSPACE_TREE_NAME,
} from '@/services/workspace'
import { getContextDocuments, getContext } from '@/services/context'
import type { Document } from '@/types/workspace'
import type { AppletTarget } from './applet-target'

// One page of the document list - a path binding deliberately shows the first
// page only (the applet is a notepad, not a browser).
export const APPLET_LIST_LIMIT = 50

export const APPLET_AUTOSAVE_MS = 1200

export function formatCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// Auto-growing borderless textarea - the notepad body.
export function GrowingTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  innerRef,
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  innerRef?: (el: HTMLTextAreaElement | null) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
  useEffect(() => { resize() }, [value, resize])
  return (
    <textarea
      ref={(el) => { ref.current = el; innerRef?.(el) }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={1}
      spellCheck={false}
      className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
    />
  )
}

// The workspace surface a target resolves to - update/delete always go through
// a workspace even when the applet is bound to a context.
export interface AppletScope {
  workspaceName: string
  path: string
  treeName: string
  treeType: 'context' | 'directory'
}

// Load + live-refresh one schema's documents for an applet target, and expose
// the resolved scope for writes.
export function useAppletDocs(target: AppletTarget, schema: string) {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<AppletScope | null>(null)

  const load = useCallback(async () => {
    if (!target) { setDocs([]); setScope(null); return }
    setLoading(true)
    setError(null)
    try {
      if (target.mode === 'context') {
        const [list, ctx] = await Promise.all([
          getContextDocuments(target.contextId, [schema]),
          getContext(target.contextId),
        ])
        setDocs(Array.isArray(list) ? (list as unknown as Document[]) : [])
        const wn = ctx.workspaceName || ctx.workspaceId
        setScope(wn ? {
          workspaceName: wn,
          path: ctx.path || '/',
          treeName: ctx.treeId || DEFAULT_WORKSPACE_TREE_NAME,
          treeType: 'context',
        } : null)
      } else {
        const res = await getWorkspaceDocuments(target.workspaceName, target.path, [schema], {
          treeName: target.treeName,
          treeType: target.treeType,
          limit: APPLET_LIST_LIMIT,
        })
        setDocs(res.payload || [])
        setScope({ workspaceName: target.workspaceName, path: target.path, treeName: target.treeName, treeType: target.treeType })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [target, schema])

  useEffect(() => { load() }, [load])

  // External creates/edits (AddPanel, quick-add cards, other tabs) land live.
  useEffect(() => {
    const onRefresh = () => load()
    window.addEventListener('workspace:documents:refresh', onRefresh)
    return () => window.removeEventListener('workspace:documents:refresh', onRefresh)
  }, [load])

  // Delete = move to workspace trash (same semantics as the document list's
  // Delete action), then drop the row locally.
  const removeDoc = useCallback(async (id: number) => {
    if (!scope) throw new Error('No workspace scope resolved')
    await deleteWorkspaceDocuments(scope.workspaceName, [id], scope.path, [], scope.treeName, scope.treeType)
    setDocs(prev => prev.filter(d => d.id !== id))
  }, [scope])

  return { docs, setDocs, loading, error, scope, reload: load, removeDoc }
}

// Per-item Link To / Delete controls for the meta row. Quiet by default on
// pointer devices (reveal-on-hover pairs with `group` on the item row).
export function ItemActions({ onLinkTo, onDelete }: { onLinkTo: () => void; onDelete: () => void }) {
  return (
    <span className="reveal-on-hover flex items-center gap-0.5">
      <button
        type="button"
        onClick={onLinkTo}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Link to…"
        title="Link to…"
      >
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
        aria-label="Delete"
        title="Delete (moves to trash)"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

// Right-edge LinkToCard overlay - the same picker the document list uses,
// unfixed workspace so the item can be linked anywhere.
export function LinkDocOverlay({ documentId, onClose }: { documentId: number; onClose: () => void }) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const [saving, setSaving] = useState(false)

  const confirm = async (paths: string[], t: LinkToTarget) => {
    if (!paths.length) return
    setSaving(true)
    try {
      for (const p of paths) {
        await pasteDocumentsToWorkspacePath(t.workspaceName, p, [documentId], t.treeName, t.treeType)
      }
      showSuccessToast(`Linked to ${paths.length} path${paths.length > 1 ? 's' : ''}`)
      onClose()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to link document')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-panel flex items-stretch justify-end bg-scrim animate-fade-in" onClick={onClose}>
      <div className="h-full p-2" onClick={(e) => e.stopPropagation()}>
        <LinkToCard onClose={onClose} onConfirm={confirm} documentCount={1} saving={saving} sizeClassName="h-full w-[380px] max-w-[90vw]" />
      </div>
    </div>
  )
}

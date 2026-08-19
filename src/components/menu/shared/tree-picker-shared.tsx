import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, CornerDownRight } from 'lucide-react'
import { Icon } from '@iconify/react'
import type { TreeNode, Document } from '@/types/workspace'
import { getLayerStyle, DEFAULT_FOLDER_ICON, DEFAULT_CANVAS_ICON, DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { visibleAccentColor } from '@/utils/color'
import { cn } from '@/lib/utils'
import { getCachedWorkspaceTreeByName, getCanvasPathDocuments, DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { buildPath, matchesSearch, useRowMenu, type TreeTab, type RowMenuEvent } from './tree-picker-utils'
// Workspace is a global type declared in src/types/api.d.ts

// Inline "new folder" input rendered as a pseudo child row — Enter creates,
// Escape/blur cancels.
export function InlineCreateRow({ onConfirm, onCancel, busy }: {
  onConfirm: (name: string) => void
  onCancel: () => void
  busy?: boolean
}) {
  const [name, setName] = useState('')
  return (
    <div className="flex min-h-10 items-center gap-2 rounded-md bg-card px-3 py-2 text-sm shadow-elevation-1">
      <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && name.trim()) onConfirm(name.trim())
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => { if (!busy) onCancel() }}
        placeholder="New folder name…"
        autoFocus
        disabled={busy}
        className="w-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {busy && <span className="shrink-0 text-xs text-muted-foreground">Creating…</span>}
    </div>
  )
}

// Single tree row — mirrors the MenuTreeView card style, multi-select via the
// same selected highlight (no checkbox), so it matches the normal tree visually.
export function LinkNode({
  node, parentPath, query, selected, onToggle, onRowMenu, createParent, onCreateConfirm, onCreateCancel, creating,
}: {
  node: TreeNode
  parentPath: string
  query: string
  selected: Set<string>
  onToggle: (path: string) => void
  // Right-click / long-press menu + inline "new folder" support — all
  // optional; PickDocumentsCard's browse tree simply doesn't pass them.
  onRowMenu?: (e: RowMenuEvent) => void
  createParent?: string | null
  onCreateConfirm?: (parent: string, name: string) => void
  onCreateCancel?: () => void
  creating?: boolean
}) {
  const path = buildPath(parentPath, node.name)
  const hasChildren = !!node.children?.length
  const [expanded, setExpanded] = useState(false)
  const { handlers: menuHandlers, guardClick } = useRowMenu(path, onRowMenu)

  if (query && !matchesSearch(node, parentPath, query)) return null

  const isCreateHere = createParent === path
  const shouldExpand = expanded || query.length > 0 || isCreateHere
  const isSelected = selected.has(path)
  const isCanvas = node.type === 'canvas'
  const style = getLayerStyle(node)

  return (
    <div>
      <div
        className={cn(
          'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-all select-none text-sm shadow-elevation-1 hover:shadow',
          'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:transition-colors',
          isSelected
            ? 'bg-primary/[0.08] hover:bg-primary/[0.12] before:bg-primary'
            : 'bg-card hover:bg-primary/[0.04] before:bg-transparent',
        )}
        onClick={guardClick(() => onToggle(path))}
        title={path}
        {...menuHandlers}
      >
        <button
          type="button"
          className={cn('shrink-0 text-muted-foreground hover:text-foreground', !hasChildren && 'invisible')}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {shouldExpand ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <Icon
          icon={style.icon || (isCanvas ? DEFAULT_CANVAS_ICON : DEFAULT_FOLDER_ICON)}
          width={16}
          height={16}
          color={visibleAccentColor(style.color)}
          className={cn('shrink-0', !visibleAccentColor(style.color) && (isCanvas ? 'text-primary' : 'text-muted-foreground'))}
        />

        <span className="flex-1 truncate font-medium" title={node.description || undefined}>
          {node.label || node.name}
        </span>
      </div>

      {(shouldExpand && hasChildren) || isCreateHere ? (
        <div className="ml-[22px] mt-1.5 space-y-1.5">
          {isCreateHere && onCreateConfirm && onCreateCancel && (
            <InlineCreateRow
              busy={creating}
              onConfirm={(name) => {
                // Pin this node open so the freshly created child stays
                // visible (and selected) once the inline row goes away.
                setExpanded(true)
                onCreateConfirm(path, name)
              }}
              onCancel={onCreateCancel}
            />
          )}
          {shouldExpand && node.children?.map(child => (
            <LinkNode
              key={child.id || child.name}
              node={child}
              parentPath={path}
              query={query}
              selected={selected}
              onToggle={onToggle}
              onRowMenu={onRowMenu}
              createParent={createParent}
              onCreateConfirm={onCreateConfirm}
              onCreateCancel={onCreateCancel}
              creating={creating}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// Step 1 of the two-step slide shell — WorkspaceList.tsx row styling, minus
// manage controls (Start/Stop/Settings).
export function WorkspaceListStep({
  workspaces, loading, onPick,
}: {
  workspaces: Workspace[]
  loading: boolean
  onPick: (name: string) => void
}) {
  if (loading && workspaces.length === 0) {
    return <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>
  }
  if (workspaces.length === 0) {
    return <div className="px-2 py-3 text-xs text-muted-foreground">No workspaces found</div>
  }
  return (
    <div className="space-y-1.5">
      {workspaces.map(ws => {
        const accent = visibleAccentColor(ws.color)
        return (
        <div
          key={ws.id || ws.name}
          onClick={() => onPick(ws.name)}
          className="group relative flex cursor-pointer items-center gap-2 rounded-md bg-card px-3 py-2.5 shadow-elevation-1 transition-all hover:bg-accent/50 hover:shadow"
          style={{ borderRight: `6px solid ${accent || 'transparent'}`, borderRadius: accent ? '6px 0 0 6px' : undefined }}
        >
          <Icon icon={ws.icon || DEFAULT_WORKSPACE_ICON} width={18} height={18} color={accent} className={cn('shrink-0', !accent && 'text-muted-foreground')} />
          <span className="flex-1 truncate text-sm font-medium">{ws.label || ws.name}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        )
      })}
    </div>
  )
}

/**
 * Browse a tree to a path, then multi-select the DOCUMENTS filed there.
 *
 * Shared by PickDocumentsCard ("add existing documents to this folder") and
 * LinkToCard's relations tab ("which document does this one point at") — both
 * need the same navigate-then-pick body, only their confirm semantics differ.
 * Owns its own tree/document fetching; the host owns the search box (`query`)
 * and the selection set, since both are rendered in its chrome.
 */
export function DocumentPathBrowser({
  workspaceName, treeTab, query, selectedDocIds, onToggleDoc, onNavigate, excludeDocumentIds,
}: {
  workspaceName: string
  treeTab: TreeTab
  // Path filter from the host's search box (lowercased).
  query: string
  selectedDocIds: Set<number>
  onToggleDoc: (id: number) => void
  // Fires on every path change — hosts use it to clear their selection.
  onNavigate?: (path: string) => void
  // Documents that must not be offered (e.g. the relation's own subject —
  // a document cannot be related to itself).
  excludeDocumentIds?: ReadonlySet<number>
}) {
  const [browsePath, setBrowsePath] = useState('/')
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [loadingTree, setLoadingTree] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)

  // Render-time reset: switching tree tabs restarts the browse at the root, so
  // the doc list can never show results from a path of the previous tree.
  const [lastTab, setLastTab] = useState(treeTab)
  if (treeTab !== lastTab) {
    setLastTab(treeTab)
    setBrowsePath('/')
  }

  useEffect(() => {
    let cancelled = false

    async function loadTree() {
      setLoadingTree(true)
      try {
        const res = await getCachedWorkspaceTreeByName(workspaceName, treeTab)
        if (!cancelled) setTree(res)
      } catch {
        if (!cancelled) setTree(null)
      } finally {
        if (!cancelled) setLoadingTree(false)
      }
    }

    loadTree()
    return () => { cancelled = true }
  }, [workspaceName, treeTab])

  useEffect(() => {
    let cancelled = false
    const treeName = treeTab === 'directory' ? 'directory' : DEFAULT_WORKSPACE_TREE_NAME

    async function loadDocs() {
      setLoadingDocs(true)
      try {
        const res = await getCanvasPathDocuments(workspaceName, browsePath, treeName)
        if (!cancelled) setDocs(res.payload || [])
      } catch {
        if (!cancelled) setDocs([])
      } finally {
        if (!cancelled) setLoadingDocs(false)
      }
    }

    loadDocs()
    return () => { cancelled = true }
  }, [workspaceName, treeTab, browsePath])

  const navigate = (path: string) => {
    setBrowsePath(path)
    onNavigate?.(path)
  }

  const offered = excludeDocumentIds?.size ? docs.filter((d) => !excludeDocumentIds.has(d.id)) : docs

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-1.5 border-b p-3">
        {loadingTree ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div
              className={cn(
                'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-all select-none text-sm shadow-elevation-1 hover:shadow',
                'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:transition-colors',
                browsePath === '/'
                  ? 'bg-primary/[0.08] hover:bg-primary/[0.12] before:bg-primary'
                  : 'bg-card hover:bg-primary/[0.04] before:bg-transparent',
              )}
              onClick={() => navigate('/')}
              title="/"
            >
              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate font-medium">/</span>
            </div>
            <div className="ml-[22px] space-y-1.5">
              {tree?.children?.length ? (
                tree.children.map(child => (
                  <LinkNode key={child.id || child.name} node={child} parentPath="/" query={query} selected={new Set([browsePath])} onToggle={navigate} />
                ))
              ) : (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Empty tree</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Documents at the currently-browsed path */}
      <div className="space-y-1 p-3">
        {loadingDocs ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">Loading documents…</div>
        ) : offered.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">No documents at this path</div>
        ) : (
          offered.map(doc => {
            const display = getDocumentDisplayInfo(doc)
            const isSelected = selectedDocIds.has(doc.id)
            return (
              <div
                key={doc.id}
                onClick={() => onToggleDoc(doc.id)}
                className={cn(
                  'flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 cursor-pointer transition-all select-none text-sm',
                  isSelected ? 'bg-primary/[0.08] hover:bg-primary/[0.12]' : 'hover:bg-primary/[0.04]',
                )}
              >
                <input type="checkbox" checked={isSelected} onChange={() => onToggleDoc(doc.id)} className="shrink-0" onClick={e => e.stopPropagation()} />
                <DocumentIcon document={doc} size={3.5} />
                <span className="flex-1 truncate">{display.title}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

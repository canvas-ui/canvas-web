import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, CornerDownRight, Search, X } from 'lucide-react'
import { Icon } from '@iconify/react'
import type { TreeNode, Document } from '@/types/workspace'
import { getLayerStyle, DEFAULT_FOLDER_ICON, DEFAULT_CANVAS_ICON, DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { visibleAccentColor } from '@/utils/color'
import { cn } from '@/lib/utils'
import { getCachedWorkspaceTreeByName, getCanvasPathDocuments, getWorkspaceDocuments, DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { buildPath, matchesSearch, useRowMenu, TAB_ICONS, TAB_LABELS, type TreeTab, type RowMenuEvent } from './tree-picker-utils'
// Workspace is a global type declared in src/types/api.d.ts

// One page of documents in the picker. Deep enough that browsing a normal
// folder needs no paging, and the search box covers anything past it.
const DOC_PICK_LIMIT = 200

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
  node, parentPath, query, selected, onToggle, onActivate, onRowMenu, createParent, onCreateConfirm, onCreateCancel, creating,
}: {
  node: TreeNode
  parentPath: string
  query: string
  selected: Set<string>
  onToggle: (path: string) => void
  // Double-click "commit" on a row — the folder step of DocumentPathBrowser
  // uses it as a shortcut past its Next button. Plain hosts omit it.
  onActivate?: (path: string) => void
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
        onDoubleClick={onActivate ? () => onActivate(path) : undefined}
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
              onActivate={onActivate}
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
 * Pick a DOCUMENT, in two labelled steps: choose a folder, then choose from the
 * documents filed there.
 *
 * The two steps are explicit (rather than one scrolling pane with a tree on top
 * and a document list underneath) because both halves are selectable lists and
 * nothing in the old single-pane layout said which one you were choosing — the
 * step header and the back-link now name the target on every screen.
 *
 * Shared by PickDocumentsCard ("add existing documents to this folder") and
 * LinkToCard's relations tab ("which document does this one point at") — same
 * navigate-then-pick body, different confirm semantics. Owns its own tree and
 * document fetching AND its own folder filter: a host-level "Search paths…" box
 * would sit above the document step doing nothing, which is exactly the
 * ambiguity the two steps exist to remove.
 */
export function DocumentPathBrowser({
  workspaceName, treeTab, onTreeTabChange, selectedDocIds, onToggleDoc, onNavigate, excludeDocumentIds,
}: {
  workspaceName: string
  treeTab: TreeTab
  // Hosts with their own tree tabs (PickDocumentsCard) pass this and stay in
  // charge. Without it the picker renders its OWN tree switch — the relations
  // tab has no outer tabs of its own, so otherwise there is nothing on screen
  // saying which tree these folders come from, let alone a way to reach the
  // directory tree.
  onTreeTabChange?: (tab: TreeTab) => void
  selectedDocIds: Set<number>
  onToggleDoc: (id: number) => void
  // Fires on every path change — hosts use it to clear their selection.
  onNavigate?: (path: string) => void
  // Documents that must not be offered (e.g. the relation's own subject —
  // a document cannot be related to itself).
  excludeDocumentIds?: ReadonlySet<number>
}) {
  const [step, setStep] = useState<'folder' | 'documents'>('folder')
  const [folderQuery, setFolderQuery] = useState('')
  const query = folderQuery.trim().toLowerCase()
  const [browsePath, setBrowsePath] = useState('/')
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [loadingTree, setLoadingTree] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  // Server-side document search inside the picked folder. NOT a client filter
  // over `docs`: that list is one page deep, so filtering it would quietly fail
  // to find anything past the first page — the case search exists for.
  const [docQuery, setDocQuery] = useState('')
  const [docSearch, setDocSearch] = useState('')

  // Own the tree when the host has no switch of its own.
  const [ownTab, setOwnTab] = useState<TreeTab>(treeTab)
  const activeTab = onTreeTabChange ? treeTab : ownTab
  const setActiveTab = (tab: TreeTab) => {
    setBrowsePath('/')
    setStep('folder')
    setDocQuery('')
    setDocSearch('')
    onNavigate?.('/')
    if (onTreeTabChange) onTreeTabChange(tab); else setOwnTab(tab)
  }

  // Render-time reset: a host-driven tree change restarts the browse at the
  // root, so the doc list can never show results from the previous tree.
  const [lastTab, setLastTab] = useState(activeTab)
  if (activeTab !== lastTab) {
    setLastTab(activeTab)
    setBrowsePath('/')
    setStep('folder')
  }

  // Debounce the typed query into the one that actually hits the server.
  useEffect(() => {
    const id = setTimeout(() => setDocSearch(docQuery.trim()), 300)
    return () => clearTimeout(id)
  }, [docQuery])

  useEffect(() => {
    let cancelled = false

    async function loadTree() {
      setLoadingTree(true)
      try {
        const res = await getCachedWorkspaceTreeByName(workspaceName, activeTab)
        if (!cancelled) setTree(res)
      } catch {
        if (!cancelled) setTree(null)
      } finally {
        if (!cancelled) setLoadingTree(false)
      }
    }

    loadTree()
    return () => { cancelled = true }
  }, [workspaceName, activeTab])

  // Documents are only read on step 2 — browsing folders costs no document
  // fetches, and stepping back and forward re-reads (cheap, and always current).
  useEffect(() => {
    if (step !== 'documents') return
    let cancelled = false
    const treeName = activeTab === 'directory' ? 'directory' : DEFAULT_WORKSPACE_TREE_NAME
    const treeType = activeTab === 'context' ? 'context' : 'directory'

    async function loadDocs() {
      setLoadingDocs(true)
      try {
        // Same server search the main document list runs, scoped to the folder
        // that was picked in step 1 (the server widens a directory search to the
        // subtree, which is what "find it under here" should mean).
        const res = docSearch
          ? await getWorkspaceDocuments(workspaceName, browsePath, [], { treeName, treeType, q: docSearch, limit: DOC_PICK_LIMIT })
          : await getCanvasPathDocuments(workspaceName, browsePath, treeName, { limit: DOC_PICK_LIMIT })
        if (!cancelled) setDocs(res.payload || [])
      } catch {
        if (!cancelled) setDocs([])
      } finally {
        if (!cancelled) setLoadingDocs(false)
      }
    }

    loadDocs()
    return () => { cancelled = true }
  }, [workspaceName, activeTab, browsePath, step, docSearch])

  // `ctx://` + `/work` would read `ctx:///work`; the rest of the app (rule
  // builder scopes, the address bar) strips the leading slash, so root is a
  // bare `ctx://`.
  const scopeLabel = (path: string) =>
    `${activeTab === 'directory' ? 'dir' : 'ctx'}://${path.replace(/^\/+/, '')}`

  const selectFolder = (path: string) => {
    setBrowsePath(path)
    onNavigate?.(path)
  }

  const offered = excludeDocumentIds?.size ? docs.filter((d) => !excludeDocumentIds.has(d.id)) : docs

  if (step === 'folder') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 space-y-2 border-b bg-muted/30 px-3 py-2">
          {/* Which tree these folders come from. The scheme prefix is the same
              one the rule builder and the address bar use (ctx:// / dir://), so
              the picker names its scope in the vocabulary the rest of the app
              already speaks. Hidden when the host owns the switch. */}
          {!onTreeTabChange && (
            <div className="flex items-center gap-1 rounded-md border border-input p-0.5">
              {(['context', 'directory'] as TreeTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
                    activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  title={`Browse the ${TAB_LABELS[tab].toLowerCase()}`}
                >
                  {TAB_ICONS[tab]}
                  <span className="font-mono">{tab === 'directory' ? 'dir://' : 'ctx://'}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Step 1 of 2 · Pick a folder</span>
            <button
              type="button"
              onClick={() => setStep('documents')}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter folders…"
              value={folderQuery}
              onChange={e => setFolderQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
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
                onClick={() => selectFolder('/')}
                onDoubleClick={() => { selectFolder('/'); setStep('documents') }}
                title="/"
              >
                <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">/</span>
              </div>
              <div className="ml-[22px] space-y-1.5">
                {tree?.children?.length ? (
                  tree.children.map(child => (
                    <LinkNode
                      key={child.id || child.name}
                      node={child}
                      parentPath="/"
                      query={query}
                      selected={new Set([browsePath])}
                      onToggle={selectFolder}
                      onActivate={(path) => { selectFolder(path); setStep('documents') }}
                    />
                  ))
                ) : (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">Empty tree</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep('folder')}
            className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Back to folders"
          >
            <ChevronRight className="h-3.5 w-3.5 shrink-0 rotate-180" />
            <span className="truncate font-mono">{scopeLabel(browsePath)}</span>
          </button>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">Step 2 of 2 · Pick a document</span>
        </div>
        {/* Server-side search, not a filter over the page below — see the
            docSearch state. Scoped to the folder picked in step 1. */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search documents in this folder…"
            value={docQuery}
            onChange={e => setDocQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-7 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {docQuery && (
            <button
              type="button"
              onClick={() => setDocQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear document search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {loadingDocs ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">Loading documents…</div>
        ) : offered.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            {docSearch ? `No documents match “${docSearch}” here.` : 'No documents in this folder.'}
          </div>
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

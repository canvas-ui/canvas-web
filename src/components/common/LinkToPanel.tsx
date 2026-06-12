import { useState } from 'react'
import { X, Search, Link2, ChevronRight, ChevronDown } from 'lucide-react'
import { Icon } from '@iconify/react'
import type { TreeNode } from '@/types/workspace'
import { getLayerStyle, DEFAULT_FOLDER_ICON, DEFAULT_CANVAS_ICON } from '@/lib/layer-style'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LinkToPanelProps {
  tree: TreeNode
  documentCount: number
  onConfirm: (paths: string[]) => Promise<void>
  onClose: () => void
}

function buildPath(parent: string, name: string) {
  return parent === '/' ? `/${name}` : `${parent}/${name}`
}

// Match on path or label, recursively — keeps ancestors of a hit visible.
function matchesSearch(node: TreeNode, parentPath: string, query: string): boolean {
  const path = buildPath(parentPath, node.name)
  if (path.toLowerCase().includes(query) || (node.label || '').toLowerCase().includes(query)) return true
  return node.children?.some(c => matchesSearch(c, path, query)) ?? false
}

// Single tree row — mirrors the MenuTreeView card style, multi-select via the
// same selected highlight (no checkbox), so it matches the normal tree visually.
function LinkNode({
  node, parentPath, query, selected, onToggle,
}: {
  node: TreeNode
  parentPath: string
  query: string
  selected: Set<string>
  onToggle: (path: string) => void
}) {
  const path = buildPath(parentPath, node.name)
  const hasChildren = !!node.children?.length
  const [expanded, setExpanded] = useState(false)

  if (query && !matchesSearch(node, parentPath, query)) return null

  const shouldExpand = expanded || query.length > 0
  const isSelected = selected.has(path)
  const isCanvas = node.type === 'canvas'
  const style = getLayerStyle(node)

  return (
    <div>
      <div
        className={cn(
          'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-all select-none text-sm shadow-sm hover:shadow',
          'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:transition-colors',
          isSelected
            ? 'bg-primary/[0.08] hover:bg-primary/[0.12] before:bg-primary'
            : 'bg-card hover:bg-primary/[0.04] before:bg-transparent',
        )}
        onClick={() => onToggle(path)}
        title={path}
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
          color={style.color || undefined}
          className={cn('shrink-0', !style.color && (isCanvas ? 'text-violet-500' : 'text-muted-foreground'))}
        />

        <span className="flex-1 truncate font-medium" title={node.description || undefined}>
          {node.label || node.name}
        </span>
      </div>

      {shouldExpand && hasChildren && (
        <div className="ml-[22px] mt-1.5 space-y-1.5">
          {node.children!.map(child => (
            <LinkNode
              key={child.id || child.name}
              node={child}
              parentPath={path}
              query={query}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function LinkToPanel({ tree, documentCount, onConfirm, onClose }: LinkToPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const q = query.trim().toLowerCase()

  const toggle = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const confirm = async () => {
    if (selected.size === 0 || submitting) return
    setSubmitting(true)
    try {
      await onConfirm(Array.from(selected))
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[90vw] flex-col border-l bg-background shadow-elevation-3">
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4" />
            Link {documentCount} document{documentCount !== 1 ? 's' : ''} to…
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              placeholder="Search paths…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Pinned selected paths — same idea as the browser extension's Sync To */}
        {selected.size > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b bg-primary/[0.04] px-3 py-2">
            {Array.from(selected).map(path => (
              <span
                key={path}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
              >
                <span className="truncate" title={path}>{path}</span>
                <button
                  type="button"
                  onClick={() => toggle(path)}
                  className="shrink-0 rounded-full hover:bg-primary-foreground/20"
                  aria-label={`Remove ${path}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {/* Root "/" row, then children indented below — like the normal tree */}
          <div
            className={cn(
              'group relative flex min-h-10 items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-all select-none text-sm shadow-sm hover:shadow',
              'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:transition-colors',
              selected.has('/')
                ? 'bg-primary/[0.08] hover:bg-primary/[0.12] before:bg-primary'
                : 'bg-card hover:bg-primary/[0.04] before:bg-transparent',
            )}
            onClick={() => toggle('/')}
            title="/"
          >
            <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate font-medium">/</span>
          </div>
          <div className="ml-[22px] space-y-1.5">
            {tree.children?.length ? (
              tree.children.map(child => (
                <LinkNode
                  key={child.id || child.name}
                  node={child}
                  parentPath="/"
                  query={q}
                  selected={selected}
                  onToggle={toggle}
                />
              ))
            ) : (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Empty tree</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {selected.size} path{selected.size !== 1 ? 's' : ''} selected
          </span>
          <Button size="sm" onClick={confirm} disabled={selected.size === 0 || submitting}>
            <Link2 className="mr-1 h-3.5 w-3.5" />
            {submitting ? 'Linking…' : 'Link'}
          </Button>
        </div>
      </div>
    </>
  )
}

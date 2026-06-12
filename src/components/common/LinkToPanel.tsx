import { useMemo, useState } from 'react'
import { X, Search, Link2, ChevronRight } from 'lucide-react'
import type { TreeNode } from '@/types/workspace'
import { Button } from '@/components/ui/button'

interface LinkToPanelProps {
  tree: TreeNode
  documentCount: number
  onConfirm: (paths: string[]) => Promise<void>
  onClose: () => void
}

interface FlatRow {
  path: string
  name: string
  depth: number
}

// Depth-first flatten that mirrors the path scheme used across the app: root is
// '/', children join with '/'. Root itself is skipped (you link into folders).
function flatten(node: TreeNode, parentPath: string, depth: number, out: FlatRow[]) {
  const isRoot = depth === 0
  const path = isRoot ? '/' : parentPath === '/' ? `/${node.name}` : `${parentPath}/${node.name}`
  if (!isRoot) out.push({ path, name: node.name, depth: depth - 1 })
  for (const child of node.children ?? []) flatten(child, path, depth + 1, out)
}

export function LinkToPanel({ tree, documentCount, onConfirm, onClose }: LinkToPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const rows = useMemo(() => {
    const out: FlatRow[] = []
    flatten(tree, '', 0, out)
    return out
  }, [tree])

  // Filter on the path so a search matches by folder name or any ancestor segment.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.path.toLowerCase().includes(q))
  }, [rows, query])

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
      <div className="fixed inset-y-0 right-0 z-50 flex w-[360px] max-w-[90vw] flex-col border-l bg-card shadow-elevation-3">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {visible.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No matching paths.</p>
          ) : (
            visible.map(row => {
              const checked = selected.has(row.path)
              return (
                <button
                  key={row.path}
                  type="button"
                  onClick={() => toggle(row.path)}
                  style={{ paddingLeft: 8 + row.depth * 14 }}
                  className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-3 text-left text-sm transition-colors ${
                    checked ? 'bg-primary/10 text-foreground' : 'hover:bg-muted'
                  }`}
                  title={row.path}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="pointer-events-none h-3.5 w-3.5 shrink-0"
                  />
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{row.name}</span>
                </button>
              )
            })
          )}
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

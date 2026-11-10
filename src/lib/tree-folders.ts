import type { FolderEntry } from '@/components/common/document-list'
import type { TreeNode } from '@/types/workspace'

// File-manager folders for a content view: the tree node's child folders
// (already client-side in the tree JSON) plus a ".." parent entry. On a
// directory tree they are directories; on a context tree they are the
// bitmap-backed layers below the path. Canvas nodes are not folders.
export function folderEntriesForPath(tree: TreeNode | null, path: string): FolderEntry[] {
  if (!tree) return []
  const segments = path.split('/').filter(Boolean)
  let node: TreeNode | null = tree
  for (const seg of segments) {
    node = node?.children?.find(c => c.name === seg) ?? null
    if (!node) return []
  }
  const base = segments.length ? `/${segments.join('/')}` : ''
  const entries: FolderEntry[] = (node.children ?? [])
    .filter(child => child.type !== 'canvas')
    .map(child => ({
      name: child.name,
      path: `${base}/${child.name}`,
      label: child.label,
      color: child.color,
      childCount: child.children?.length ?? 0,
    }))
    .sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name, undefined, { numeric: true, sensitivity: 'base' }))
  if (segments.length > 0) {
    entries.unshift({ name: '..', path: segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : '/', isParent: true })
  }
  return entries
}

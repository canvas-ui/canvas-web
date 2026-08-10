import { useState } from 'react'
import { insertWorkspacePath, invalidateWorkspaceTreeCache } from '@/services/workspace'

export const DEFAULT_FOLDER_NAMES = ['Home', 'Travel', 'Work', 'Books', 'Workouts', 'Beauty', 'Recipes', 'To Watch', 'To Read', 'Learning', 'Tech', 'Music', 'Finance', 'Shopping', 'Ideas']
export type FolderTree = 'context' | 'directory'

export async function createDefaultFolders(workspaceName: string, names: string[], tree: FolderTree): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  for (const name of names) {
    try {
      await insertWorkspacePath(workspaceName, `/${name}`, true, tree === 'directory' ? 'directory' : 'context')
      ok += 1
    } catch {
      failed += 1
    }
  }
  invalidateWorkspaceTreeCache(workspaceName)
  window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName, treeName: tree } }))
  return { ok, failed }
}

export function useFolderSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tree, setTree] = useState<FolderTree>('context')
  const toggle = (name: string) => setSelected((previous) => {
    const next = new Set(previous)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  return { selected, setSelected, tree, setTree, toggle }
}

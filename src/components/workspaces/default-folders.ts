import { useState } from 'react'
import { presetStylePatch } from '@/lib/layer-style'
import { insertWorkspacePath, updateWorkspacePath, invalidateWorkspaceTreeCache } from '@/services/workspace'

// Well-known starter folders (each ships a default icon + color via
// FOLDER_NAME_DEFAULTS) — turns a fresh workspace into a stash-anything setup.
export const DEFAULT_FOLDER_NAMES = [
  'Home', 'Travel', 'Work', 'Books', 'Workouts', 'Beauty', 'Recipes',
  'To Watch', 'To Read', 'Learning', 'Tech', 'Music', 'Finance', 'Shopping', 'Ideas',
]

export type FolderTree = 'context' | 'directory'

/**
 * Create the given folders in a workspace tree, then invalidate the cached
 * tree + broadcast the refresh event. Cache invalidation matters: the tree
 * menu (WorkspaceM2) only reacts to the event while mounted — a stale cache
 * would otherwise survive until a full reload.
 */
export async function createDefaultFolders(
  workspaceName: string,
  names: string[],
  tree: FolderTree,
): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  const treeName = tree === 'directory' ? 'directory' : 'context'
  for (const name of names) {
    try {
      await insertWorkspacePath(workspaceName, `/${name}`, true, treeName)
      // Store the preset ON the layer rather than leaving it to the name-keyed
      // render fallback, which a rename would drop.
      const patch = presetStylePatch(`/${name}`)
      if (patch) {
        await updateWorkspacePath(workspaceName, `/${name}`, patch, treeName)
          .catch(() => { /* folder is created; style stays on the fallback */ })
      }
      ok += 1
    } catch {
      failed += 1
    }
  }
  invalidateWorkspaceTreeCache(workspaceName)
  window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName, treeName: tree } }))
  return { ok, failed }
}

/** Shared selection-state helper for hosts of the picker. */
export function useFolderSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tree, setTree] = useState<FolderTree>('context')
  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }
  return { selected, setSelected, tree, setTree, toggle }
}

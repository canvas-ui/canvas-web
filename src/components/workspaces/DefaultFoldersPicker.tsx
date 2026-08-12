import { useState } from 'react'
import { Icon } from '@iconify/react'
import { FOLDER_NAME_DEFAULTS, presetStylePatch } from '@/lib/layer-style'
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

interface DefaultFoldersPickerProps {
  selected: Set<string>
  onToggle: (name: string) => void
  tree: FolderTree
  onTreeChange: (tree: FolderTree) => void
  disabled?: boolean
  // Radio-group name must be unique per mounted instance.
  idPrefix?: string
  // Narrow hosts (M2 panel): stack folders in one column so labels don't clip.
  stacked?: boolean
}

// Controlled checkbox grid of the starter folders + target-tree choice.
// Used by Settings → General and the workspace-creation dialog.
export function DefaultFoldersPicker({ selected, onToggle, tree, onTreeChange, disabled = false, idPrefix = 'default-folders', stacked = false }: DefaultFoldersPickerProps) {
  return (
    <div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">Create in:</span>
        {(['context', 'directory'] as const).map((t) => (
          <label key={t} className="flex items-center gap-1">
            <input type="radio" name={`${idPrefix}-tree`} checked={tree === t} onChange={() => onTreeChange(t)} disabled={disabled} />
            {t} tree
          </label>
        ))}
      </div>
      <div className={`mt-3 grid gap-1.5 ${stacked ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
        {DEFAULT_FOLDER_NAMES.map((name) => {
          const style = FOLDER_NAME_DEFAULTS[name.toLowerCase()]
          return (
            <label key={name} className="flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm hover:bg-accent/50">
              <input type="checkbox" checked={selected.has(name)} onChange={() => onToggle(name)} disabled={disabled} />
              {style?.icon && <Icon icon={style.icon} width={16} height={16} color={style.color} />}
              <span className="truncate">{name}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
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

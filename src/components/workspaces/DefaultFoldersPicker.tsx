import { Icon } from '@iconify/react'
import { FOLDER_NAME_DEFAULTS } from '@/lib/layer-style'
import { DEFAULT_FOLDER_NAMES, type FolderTree } from './default-folders'

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

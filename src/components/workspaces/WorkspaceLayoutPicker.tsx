import { FolderTree, HardDrive } from 'lucide-react'

/**
 * Folder-structure choice, offered at workspace creation only (the layout is
 * fixed once the directory exists). The two options differ in one thing: where
 * the user's drive lives, and therefore how much of the workspace folder is
 * "theirs".
 */
const OPTIONS = [
  {
    value: 'full' as const,
    icon: FolderTree,
    title: 'Standard',
    blurb: 'Everything in one folder: your files in home/, alongside db/, data/, git/.',
    tree: ['workspace.json', 'home/  ← your files', 'db/  data/  cache/  git/'],
  },
  {
    value: 'home' as const,
    icon: HardDrive,
    title: 'Roaming home',
    blurb: 'The workspace folder IS your drive. Mount it over WebDAV and it looks like a plain home directory. Canvas keeps its files in a hidden .workspace/.',
    tree: ['your files, at the top level', '.workspace/  ← hidden, ignored'],
  },
]

export function WorkspaceLayoutPicker({
  value,
  onChange,
  disabled = false,
  idPrefix = 'workspace-layout',
  compact = false,
}: {
  value: WorkspaceLayout
  onChange: (layout: WorkspaceLayout) => void
  disabled?: boolean
  idPrefix?: string
  compact?: boolean
}) {
  return (
    <div className={compact ? 'space-y-1.5' : 'grid gap-2 sm:grid-cols-2'}>
      {OPTIONS.map(option => {
        const selected = value === option.value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            id={`${idPrefix}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex w-full gap-2 rounded-md border p-2.5 text-left transition-colors disabled:opacity-50 ${
              selected ? 'border-primary bg-accent/40' : 'hover:bg-accent/20'
            }`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="min-w-0">
              <span className="block text-xs font-medium">{option.title}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{option.blurb}</span>
              <span className="mt-1 block font-mono text-[10px] leading-relaxed text-muted-foreground/80">
                {option.tree.map(line => (
                  <span key={line} className="block truncate">{line}</span>
                ))}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

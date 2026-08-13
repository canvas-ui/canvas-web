import { insertKindsForDevice, type InsertKind } from './insert-kinds'

interface InsertMenuProps {
  onSelect: (kind: InsertKind) => void
  // 'list' — panel rows (AddPanel picker). 'stack' — floating pill buttons
  // (home quick-add FAB stack). Same entries and order either way.
  variant?: 'list' | 'stack'
  // Kinds a surface can't host — e.g. the home stack omits 'folder' (folders
  // are created inside the Link to… destination tree instead).
  omit?: InsertKind[]
}

export function InsertMenu({ onSelect, variant = 'list', omit }: InsertMenuProps) {
  const kinds = insertKindsForDevice().filter((k) => !omit?.includes(k.kind))

  if (variant === 'stack') {
    return (
      <>
        {kinds.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onSelect(kind)}
            className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm font-medium shadow-elevation-3 transition-transform hover:scale-105"
          >
            {label}
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </>
    )
  }

  return (
    <div className="p-2">
      {kinds.map(({ kind, label, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onSelect(kind)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </button>
      ))}
    </div>
  )
}

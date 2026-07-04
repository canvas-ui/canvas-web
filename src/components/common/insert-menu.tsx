import { StickyNote, Link as LinkIcon, Upload, Camera, FileSearch, FolderPlus, type LucideIcon } from 'lucide-react'

// Single source of truth for "what can be inserted" — the same entries, in
// the same order, with the same labels and icons on every surface (home
// quick-add stack, AddPanel picker, …), so users never relearn the pattern
// from one screen to the next.
export type InsertKind = 'note' | 'link' | 'file' | 'photo' | 'existing' | 'folder'

export const INSERT_KINDS: { kind: InsertKind; label: string; icon: LucideIcon }[] = [
  { kind: 'note', label: 'Note', icon: StickyNote },
  { kind: 'link', label: 'Link', icon: LinkIcon },
  { kind: 'file', label: 'File', icon: Upload },
  { kind: 'photo', label: 'Photo/Video', icon: Camera },
  { kind: 'existing', label: 'Existing document', icon: FileSearch },
  { kind: 'folder', label: 'Folder', icon: FolderPlus },
]

export function insertKindsForDevice() {
  const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  return hasCamera ? INSERT_KINDS : INSERT_KINDS.filter((k) => k.kind !== 'photo')
}

interface InsertMenuProps {
  onSelect: (kind: InsertKind) => void
  // 'list' — panel rows (AddPanel picker). 'stack' — floating pill buttons
  // (home quick-add FAB stack). Same entries and order either way.
  variant?: 'list' | 'stack'
}

export function InsertMenu({ onSelect, variant = 'list' }: InsertMenuProps) {
  const kinds = insertKindsForDevice()

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

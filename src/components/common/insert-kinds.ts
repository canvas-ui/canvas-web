import { StickyNote, Link as LinkIcon, Upload, Camera, Brush, FileSearch, FolderPlus, ListTodo, User, type LucideIcon } from 'lucide-react'

// Single source of truth for "what can be inserted" — the same entries, in
// the same order, with the same labels and icons on every surface (home
// quick-add stack, AddPanel picker, …), so users never relearn the pattern
// from one screen to the next.
export type InsertKind = 'note' | 'link' | 'todo' | 'identity' | 'sketch' | 'file' | 'photo' | 'existing' | 'folder'

export const INSERT_KINDS: { kind: InsertKind; label: string; icon: LucideIcon }[] = [
  { kind: 'note', label: 'Note', icon: StickyNote },
  { kind: 'link', label: 'Link', icon: LinkIcon },
  { kind: 'todo', label: 'Todo', icon: ListTodo },
  { kind: 'identity', label: 'Identity', icon: User },
  { kind: 'sketch', label: 'Sketch', icon: Brush },
  { kind: 'file', label: 'File', icon: Upload },
  { kind: 'photo', label: 'Photo/Video', icon: Camera },
  { kind: 'existing', label: 'Existing document', icon: FileSearch },
  { kind: 'folder', label: 'Folder', icon: FolderPlus },
]

export function insertKindsForDevice() {
  const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  return hasCamera ? INSERT_KINDS : INSERT_KINDS.filter((k) => k.kind !== 'photo')
}

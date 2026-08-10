import { StickyNote, Link as LinkIcon, Upload, Camera, FileSearch, FolderPlus, ListTodo, type LucideIcon } from 'lucide-react'

export type InsertKind = 'note' | 'link' | 'todo' | 'file' | 'photo' | 'existing' | 'folder'

export const INSERT_KINDS: { kind: InsertKind; label: string; icon: LucideIcon }[] = [
  { kind: 'note', label: 'Note', icon: StickyNote },
  { kind: 'link', label: 'Link', icon: LinkIcon },
  { kind: 'todo', label: 'Todo', icon: ListTodo },
  { kind: 'file', label: 'File', icon: Upload },
  { kind: 'photo', label: 'Photo/Video', icon: Camera },
  { kind: 'existing', label: 'Existing document', icon: FileSearch },
  { kind: 'folder', label: 'Folder', icon: FolderPlus },
]

export function insertKindsForDevice() {
  const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  return hasCamera ? INSERT_KINDS : INSERT_KINDS.filter(({ kind }) => kind !== 'photo')
}

import { StickyNote, Link as LinkIcon, Upload, Camera, type LucideIcon } from 'lucide-react'

export type QuickAddKind = 'note' | 'link' | 'file' | 'photo'

export const QUICK_ADD_CONFIG: Record<QuickAddKind, { label: string; icon: LucideIcon }> = {
  note: { label: 'Add Note', icon: StickyNote },
  link: { label: 'Add Link', icon: LinkIcon },
  file: { label: 'Upload File', icon: Upload },
  photo: { label: 'Take Photo/Video', icon: Camera },
}

// Data a B5Card can be pre-filled with (share-target flow) — shape varies
// slightly by kind, all fields optional. Shared files arrive as real File
// objects (stashed by the service worker, retrieved by ShareTargetPage) and
// upload through the normal authenticated flow at Save time — nothing is
// persisted server-side ahead of the user picking a destination.
export interface QuickAddInitialData {
  title?: string
  content?: string
  url?: string
  files?: File[]
}

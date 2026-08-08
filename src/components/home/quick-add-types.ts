// Kinds a share-target landing can pre-open (labels/icons live in the shared
// insert-menu component, the single source of truth for insertion entries).
export type QuickAddKind = 'note' | 'todo' | 'link' | 'file' | 'photo'

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

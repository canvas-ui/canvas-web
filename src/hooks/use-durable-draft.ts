import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { DurableDraft, type DraftOptions } from '@/lib/durable-draft'

// Two views of the same note share both the draft and its serialized write queue.
// Keep the entry while a closing editor is still saving; reopening joins that save.
class DraftEntry<T> {
  users = 0
  readonly draft: DurableDraft<T>
  constructor(draft: DurableDraft<T>) { this.draft = draft }
  attach() { this.users++ }
  release() { this.users-- }
}
const drafts = new Map<string, DraftEntry<unknown>>()

export function useDurableDraft<T>(key: string, initial: T, options: Omit<DraftOptions<T>, 'storage'> = {}) {
  // A document/destination owns one draft for its entire mounted lifetime.
  const entry = useMemo(() => {
    const existing = drafts.get(key)
    if (existing) return existing as DraftEntry<T>
    let storage: Storage | undefined
    try { storage = localStorage } catch { /* Show the storage warning in the editor. */ }
    const created = new DraftEntry(new DurableDraft(key, initial, { ...options, storage }))
    drafts.set(key, created as DraftEntry<unknown>)
    return created
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const { draft } = entry
  useEffect(() => { draft.configure(options) })
  useEffect(() => {
    entry.attach()
    const flush = () => { void draft.flush().catch(() => {}) }
    const hide = () => { if (document.visibilityState === 'hidden') flush() }
    draft.schedule()
    window.addEventListener('online', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('online', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', hide)
      entry.release()
      void draft.flush().catch(() => {}).finally(() => {
        if (entry.users === 0 && drafts.get(key) === entry) drafts.delete(key)
      })
    }
  }, [draft, entry, key])
  const snapshot = useSyncExternalStore(draft.subscribe, draft.getSnapshot)
  return { ...snapshot, update: draft.update, flush: draft.flush, clear: draft.clear, saveWith: draft.saveWith, getSnapshot: draft.getSnapshot }
}

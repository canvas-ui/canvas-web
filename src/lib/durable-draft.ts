export type DraftStatus = 'idle' | 'draft' | 'saving' | 'saved' | 'error'
export interface DraftRecord<T> { value: T; saved: string; meta: Record<string, unknown> }
export interface DraftSnapshot<T> extends DraftRecord<T> { status: DraftStatus; error: string; storageError: boolean }
export interface DraftOptions<T> {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  delay?: number
  retainAfterSave?: boolean
  valid?: (value: T) => boolean
  save?: (value: T, meta: Record<string, unknown>, checkpoint: (meta: Record<string, unknown>) => void) => Promise<void>
}

/** Persist each keystroke before scheduling I/O. Only one server write can run
 * at a time, and acknowledging it never removes a newer, still-unsaved draft. */
export class DurableDraft<T> {
  private snapshot: DraftSnapshot<T>
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<void>
  private forcedSave?: DraftOptions<T>['save']
  options: DraftOptions<T>
  readonly key: string
  constructor(key: string, initial: T, options: DraftOptions<T> = {}) {
    this.key = key
    this.options = options
    let record: DraftRecord<T> = { value: initial, saved: JSON.stringify(initial), meta: {} }
    try {
      const stored = JSON.parse(options.storage?.getItem(key) || 'null')
      if (stored?.version === 1 && stored.value && typeof stored.saved === 'string') record = stored
    } catch { /* A malformed draft must not stop the editor opening. */ }
    this.snapshot = { ...record, status: JSON.stringify(record.value) === record.saved ? 'idle' : 'draft', error: '', storageError: false }
  }
  configure = (options: Omit<DraftOptions<T>, 'storage'>) => { this.options = { ...options, storage: this.options.storage } }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit(patch: Partial<DraftSnapshot<T>>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private persist() {
    try {
      if (!this.options.storage) throw new Error('Storage unavailable')
      this.options.storage.setItem(this.key, JSON.stringify({ version: 1, value: this.snapshot.value, saved: this.snapshot.saved, meta: this.snapshot.meta }))
      if (this.snapshot.storageError) this.emit({ storageError: false })
    } catch { if (!this.snapshot.storageError) this.emit({ storageError: true }) }
  }
  update = (patch: Partial<T>) => {
    const value = { ...this.snapshot.value, ...patch }
    if (JSON.stringify(value) === JSON.stringify(this.snapshot.value)) return
    this.emit({ value, status: 'draft', error: '' })
    this.persist()
    this.schedule()
  }
  schedule = () => {
    this.cancelTimer()
    if (this.options.save) this.timer = setTimeout(() => { void this.flush().catch(() => {}) }, this.options.delay ?? 650)
  }
  cancelTimer = () => { clearTimeout(this.timer); this.timer = undefined }
  flush = (): Promise<void> => {
    this.cancelTimer()
    if (this.running) return this.running
    this.running = this.drain().finally(() => { this.running = undefined; this.forcedSave = undefined })
    return this.running
  }
  private async drain() {
    while (JSON.stringify(this.snapshot.value) !== this.snapshot.saved) {
      const value = this.snapshot.value
      const save = this.forcedSave ?? this.options.save
      if (!save || (this.options.valid && !this.options.valid(value))) return
      this.emit({ status: 'saving', error: '' })
      try {
        await save(value, this.snapshot.meta, meta => { this.emit({ meta }); this.persist() })
        this.emit({ saved: JSON.stringify(value) })
        this.persist()
      } catch (cause) {
        this.emit({ status: 'error', error: cause instanceof Error ? cause.message : 'Save failed' })
        this.persist()
        throw cause
      }
    }
    if (this.snapshot.status !== 'idle') this.emit({ status: 'saved' })
    if (!this.options.retainAfterSave) {
      try { this.options.storage?.removeItem(this.key) } catch { /* Saved on server. */ }
    }
  }
  saveWith = (save: NonNullable<DraftOptions<T>['save']>) => {
    this.forcedSave = save
    return this.flush()
  }
  clear = () => {
    this.cancelTimer()
    try { this.options.storage?.removeItem(this.key) } catch { /* Keep the recoverable draft if storage fails. */ }
  }
}

/** Scope drafts to the account, not its rotating access token. No token is stored. */
export function draftKey(scope: string): string {
  let identity = 'local'
  try {
    const token = localStorage.getItem('authToken') || ''
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    identity = String(claims.sub || claims.userId || claims.id || claims.email || token)
  } catch { /* Cookie/local session. */ }
  let hash = 2166136261
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `canvas:note-draft:${hash >>> 0}:${scope}`
}

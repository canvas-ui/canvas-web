import { useSyncExternalStore } from 'react'
import { resolveBackendUpload, resolveUploadWorkspace, type AddTarget } from './useAddTarget'
import { buildFileDocument } from './useFileFields'
import { readDroppedFiles } from './dropped-files'
import type { UploadStorage } from './useStorageFields'
import { itemKey, runUploadPipeline, summarizeUpload, type BuildUploadDocument, type UploadItem, type UploadSummary } from './useUploadQueue'

// Background uploads. A batch belongs to the app, not to the form or folder
// that started it, so it keeps running while the user navigates elsewhere and
// reports in the upload tray. Batches run one after another; the pipeline
// already uploads a few files of a batch in parallel.

interface UploadBatch {
  id: number
  /** Where the files go, for the tray. */
  label: string
  items: UploadItem[]
  state: 'waiting' | 'running' | 'settled'
}

interface BatchRun {
  target: NonNullable<AddTarget>
  buildDoc: BuildUploadDocument
  storage: UploadStorage | null
  onSettled?: (summary: UploadSummary) => void | Promise<void>
  /** The tree gained folders (a dropped directory): reload it afterwards. */
  refreshTree: boolean
  abort: AbortController | null
}

let batches: UploadBatch[] = []
const runs = new Map<number, BatchRun>()
const listeners = new Set<() => void>()
let nextId = 1
let chain: Promise<void> = Promise.resolve()

function emit(): void {
  for (const listener of listeners) listener()
}

function update(id: number, change: (batch: UploadBatch) => UploadBatch): void {
  batches = batches.map(batch => (batch.id === id ? change(batch) : batch))
  emit()
}

const find = (id: number) => batches.find(batch => batch.id === id)

function targetLabel(target: NonNullable<AddTarget>): string {
  return target.mode === 'workspace' ? `${target.workspaceName} ${target.path}` : 'current context'
}

async function run(id: number): Promise<void> {
  const job = runs.get(id)
  if (!job || !find(id)) return
  const abort = new AbortController()
  job.abort = abort
  update(id, batch => ({ ...batch, state: 'running' }))
  const patch = (itemId: string, changes: Partial<UploadItem>) =>
    update(id, batch => ({ ...batch, items: batch.items.map(item => (item.id === itemId ? { ...item, ...changes } : item)) }))
  try {
    const { workspaceName, treeName, path } = await resolveUploadWorkspace(job.target)
    const backend = treeName === 'backends' ? await resolveBackendUpload(workspaceName, path) : null
    await runUploadPipeline({
      target: job.target, destination: { workspaceName, backend }, storage: backend ? null : job.storage,
      items: () => find(id)?.items ?? [], patch, buildDoc: job.buildDoc, signal: abort.signal,
    })
    if (job.refreshTree) window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName } }))
  } catch (error) {
    // Nothing started (unresolvable or read-only destination): fail every file.
    const message = error instanceof Error ? error.message : 'Upload failed'
    update(id, batch => ({ ...batch, items: batch.items.map(item => (item.status === 'done' ? item : { ...item, status: 'error', error: message })) }))
  } finally {
    job.abort = null
    update(id, batch => ({ ...batch, state: 'settled' }))
  }
  const batch = find(id)
  if (!batch) return
  const summary = summarizeUpload(batch.items)
  try { await job.onSettled?.(summary) } catch (error) { console.error('Upload follow-up failed', error) }
  // A clean batch needs no attention; failures stay until retried or dismissed.
  if (summary.failed === 0) setTimeout(() => { if (find(id)?.state === 'settled') dismissUploadBatch(id) }, 4000)
}

function schedule(id: number): void {
  update(id, batch => ({ ...batch, state: 'waiting' }))
  // One batch failing unexpectedly must not stall the batches behind it.
  chain = chain.then(() => run(id)).catch(error => console.error('Upload batch failed', error))
}

/** Start uploading `files` into `target` in the background. */
export function enqueueUpload(files: File[], target: AddTarget, options: {
  buildDoc?: BuildUploadDocument
  /** Backends picked for the files; omitted, they stay in the default content store. */
  storage?: UploadStorage | null
  onSettled?: (summary: UploadSummary) => void | Promise<void>
  refreshTree?: boolean
} = {}): void {
  if (!target || files.length === 0) return
  const id = nextId++
  const seen = new Set<string>()
  const items = files.flatMap<UploadItem>(file => {
    const key = itemKey(file)
    if (seen.has(key)) return []
    seen.add(key)
    return [{ id: key, file, status: 'queued', progress: 0 }]
  })
  runs.set(id, {
    target,
    buildDoc: options.buildDoc ?? ((blob, file) => buildFileDocument(blob, file)),
    storage: options.storage ?? null,
    onSettled: options.onSettled,
    refreshTree: options.refreshTree ?? false,
    abort: null,
  })
  batches = [...batches, { id, label: targetLabel(target), items, state: 'waiting' }]
  schedule(id)
}

export function cancelUploadBatch(id: number): void {
  const job = runs.get(id)
  if (job?.abort) job.abort.abort()
  else if (find(id)?.state === 'waiting') dismissUploadBatch(id)
}

/** Re-run what failed; files already stored are skipped by the pipeline. */
export function retryUploadBatch(id: number): void {
  if (find(id)?.state === 'settled') schedule(id)
}

export function dismissUploadBatch(id: number): void {
  if (find(id)?.state === 'running') return
  runs.delete(id)
  batches = batches.filter(batch => batch.id !== id)
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useUploadBatches(): UploadBatch[] {
  return useSyncExternalStore(subscribe, () => batches)
}

export type WorkspaceUploadTarget = Extract<NonNullable<AddTarget>, { mode: 'workspace' }>

const joinPath = (base: string, rel: string) => `${base === '/' ? '' : base.replace(/\/$/, '')}/${rel}`

/** Upload an OS drop into a workspace folder; dropped directories keep their structure. */
export async function uploadDroppedFiles(transfer: DataTransfer, target: WorkspaceUploadTarget): Promise<number> {
  const groups = await readDroppedFiles(transfer)
  for (const group of groups) {
    enqueueUpload(group.files, group.folder ? { ...target, path: joinPath(target.path, group.folder) } : target, { refreshTree: Boolean(group.folder) })
  }
  return groups.reduce((count, group) => count + group.files.length, 0)
}

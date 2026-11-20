import { API_ROUTES } from '@/config/api'
import { requestContentTicket } from '@/services/workspace'
import { getDocumentDisplayInfo, getLocationFilename } from '@/lib/document-display'
import type { Document } from '@/types/workspace'

// Documents as files on the user's own disk: dragged out of the page, saved
// into a folder they pick, or handed to the browser's download shelf. The
// server decides what a document is as a file (a stored file's bytes, a note
// as markdown, a link as .url, an e-mail as .eml).

// The most documents one archive request names (the server's limit).
export const ARCHIVE_MAX_DOCUMENTS = 1000

const absolute = (path: string) => new URL(path, window.location.origin).href

export function documentFileUrl(workspaceId: string, documentId: number): string {
  return absolute(`${API_ROUTES.workspaces}/${workspaceId}/documents/${documentId}/file`)
}

export function documentArchiveUrl(workspaceId: string, documentIds: number[], name: string): string {
  const params = new URLSearchParams({ ids: documentIds.join(','), name })
  return absolute(`${API_ROUTES.workspaces}/${workspaceId}/documents/archive?${params}`)
}

const unsafeNameChars = /[\\/:*?"<>|]/g

// The name the dragged file gets. A drag has to name the file before any
// request is made, so this follows the server's naming (webdav/vfs-shared.js
// `docName`) for the document kinds it renders.
function dragFilename(document: Document): string {
  const stored = getLocationFilename(document)
  if (stored) return stored.replace(unsafeNameChars, '_')
  const title = getDocumentDisplayInfo(document).title.replace(unsafeNameChars, '_').trim() || `document-${document.id}`
  const extension = document.schema === 'data/schema/note' ? '.note.md'
    : document.schema === 'data/schema/tab' || document.schema === 'data/schema/link' ? '.url'
      : document.schema === 'data/schema/message/email' ? '.eml'
        : '.json'
  return `${title}${extension}`
}

/**
 * Add the "drag this out of the browser" payload to a document drag.
 *
 * Chromium turns a `DownloadURL` entry into a file where the drag is dropped
 * (desktop, file manager). It carries exactly one file, so several documents
 * travel as one zip. The download is the browser's own request: it
 * authenticates with the media-ticket cookie, which keepContentTicket holds.
 * Returns false when the selection is too large to name in one request.
 */
export function setDragOutData(dataTransfer: DataTransfer, workspaceId: string, documents: Document[], archiveName: string): boolean {
  if (documents.length === 0 || documents.length > ARCHIVE_MAX_DOCUMENTS) return false
  if (documents.length === 1) {
    const [document] = documents
    const mime = document.metadata?.contentType || 'application/octet-stream'
    dataTransfer.setData('DownloadURL', `${mime}:${dragFilename(document)}:${documentFileUrl(workspaceId, document.id)}`)
    return true
  }
  const name = archiveName.replace(unsafeNameChars, '_').trim() || 'canvas-documents'
  dataTransfer.setData('DownloadURL', `application/zip:${name}.zip:${documentArchiveUrl(workspaceId, documents.map(d => d.id), name)}`)
  return true
}

/**
 * Keep the media-ticket cookie valid for a workspace while a view that can be
 * dragged from is open. The ticket has to exist before a drag starts, since
 * dragstart cannot wait for a request. Returns the stop function.
 */
export function keepContentTicket(workspaceId: string, documentId: number): () => void {
  const mint = () => { void requestContentTicket(workspaceId, documentId).catch(() => {}) }
  mint()
  // The ticket lives an hour; renew well inside that.
  const timer = window.setInterval(mint, 20 * 60_000)
  return () => window.clearInterval(timer)
}

/** Hand documents to the browser's own download: one file, or a zip of several. */
export async function downloadDocuments(workspaceId: string, documentIds: number[], archiveName: string): Promise<void> {
  if (documentIds.length === 0) return
  if (documentIds.length > ARCHIVE_MAX_DOCUMENTS) throw new Error(`Select at most ${ARCHIVE_MAX_DOCUMENTS} documents for one download`)
  if (!await requestContentTicket(workspaceId, documentIds[0])) throw new Error('Could not authorize the download')
  const a = window.document.createElement('a')
  a.href = documentIds.length === 1
    ? documentFileUrl(workspaceId, documentIds[0])
    : documentArchiveUrl(workspaceId, documentIds, archiveName.replace(unsafeNameChars, '_').trim() || 'canvas-documents')
  a.download = ''
  window.document.body.appendChild(a)
  a.click()
  a.remove()
}

// ── Save into a folder on disk (File System Access API, Chromium) ───────────

interface DirectoryHandle {
  name: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>
  removeEntry(name: string): Promise<void>
}
type DirectoryPicker = (options: { id: string; mode: 'readwrite' }) => Promise<DirectoryHandle>

const directoryPicker = (): DirectoryPicker | undefined =>
  (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker

export const canSaveToFolder = (): boolean => typeof directoryPicker() === 'function'

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (extended) { try { return decodeURIComponent(extended[1]) } catch { /* fall back to the plain name */ } }
  return /filename="([^"]*)"/i.exec(header)?.[1] || null
}

async function exists(folder: DirectoryHandle, name: string): Promise<boolean> {
  try { await folder.getFileHandle(name); return true } catch { return false }
}

// A free name in the folder: `invoice.pdf`, then `invoice (2).pdf`, … Files
// already there are never overwritten.
async function freeName(folder: DirectoryHandle, wanted: string, taken: Set<string>): Promise<string> {
  const dot = wanted.lastIndexOf('.')
  const [base, extension] = dot > 0 ? [wanted.slice(0, dot), wanted.slice(dot)] : [wanted, '']
  for (let n = 1; ; n++) {
    const name = n === 1 ? wanted : `${base} (${n})${extension}`
    if (!taken.has(name) && !await exists(folder, name)) { taken.add(name); return name }
  }
}

export interface SaveToFolderResult {
  folder: string
  saved: number
  failed: { documentId: number; error: string }[]
}

/**
 * Ask for a folder and write each document into it as a file. The browser
 * remembers the folder last used for this picker. Resolves null when the
 * picker is dismissed.
 */
export async function saveDocumentsToFolder(
  workspaceId: string,
  documentIds: number[],
  onProgress?: (done: number, total: number) => void,
): Promise<SaveToFolderResult | null> {
  const pick = directoryPicker()
  if (!pick) throw new Error('This browser cannot write into a folder')
  let folder: DirectoryHandle
  try { folder = await pick({ id: 'canvas-save-documents', mode: 'readwrite' }) }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }

  const token = localStorage.getItem('authToken')
  const taken = new Set<string>()
  const result: SaveToFolderResult = { folder: folder.name, saved: 0, failed: [] }
  let done = 0
  for (const documentId of documentIds) {
    let name: string | null = null
    try {
      const res = await fetch(documentFileUrl(workspaceId, documentId), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok || !res.body) throw new Error(res.status === 404 ? 'No reachable copy' : `HTTP ${res.status}`)
      name = await freeName(folder, (filenameFromDisposition(res.headers.get('content-disposition')) || `document-${documentId}`).replace(unsafeNameChars, '_'), taken)
      const file = await folder.getFileHandle(name, { create: true })
      await res.body.pipeTo(await file.createWritable())
      result.saved++
    } catch (error) {
      // A failed write leaves an empty or partial file behind; remove it.
      if (name) await folder.removeEntry(name).catch(() => {})
      result.failed.push({ documentId, error: error instanceof Error ? error.message : String(error) })
    }
    onProgress?.(++done, documentIds.length)
  }
  return result
}

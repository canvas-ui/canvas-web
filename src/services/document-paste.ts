import {
  backendTreeTarget, imapFolderTarget, listBackends, moveImapMessages,
  pasteDocumentsToWorkspacePath, removeWorkspaceDocuments, transferDocumentsToBackends,
  treeTypeForName, BACKENDS_TREE_NAME,
} from './workspace'

export interface DocumentPasteTarget {
  treeName: string
  path: string
  treeType?: 'context' | 'directory'
}

export interface DocumentPasteSource {
  move?: boolean
  sourcePath?: string
  sourceTreeName?: string
}

const normalize = (path: string) => `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/'

function announce(workspaceName: string, treeName: string, path: string): void {
  window.dispatchEvent(new CustomEvent('workspace:documents:refresh', { detail: { workspaceName, treeName, path } }))
}

/**
 * Put existing documents into a folder of any workspace tree — the one paste
 * behind Ctrl+V, the Paste menu items and document drag-and-drop.
 *  - context/directory trees: link into the path; a move also unlinks the
 *    documents from the folder they came from.
 *  - backends tree, mail folder: an IMAP MOVE on the server.
 *  - backends tree, storage folder: copy (or move) the bytes into that folder.
 * Resolves with a one-line summary; rejects when nothing was pasted.
 */
export async function pasteDocuments(
  workspaceName: string,
  target: DocumentPasteTarget,
  documentIds: number[],
  source: DocumentPasteSource = {},
): Promise<string> {
  const count = documentIds.length
  if (target.treeName === BACKENDS_TREE_NAME) {
    const mailbox = imapFolderTarget(target.path)
    if (mailbox) {
      const { moved, results } = await moveImapMessages(workspaceName, mailbox.address, documentIds, target.path)
      const failed = results.filter(result => !result.ok)
      // Account root: overlaps both the source folder and the target.
      if (moved) announce(workspaceName, BACKENDS_TREE_NAME, `/imap/${mailbox.address}`)
      if (failed.length) throw new Error(`${failed.length} message(s) not moved: ${failed[0].error || 'move failed'}`)
      return `${moved} message(s) moved`
    }
    const backends = await listBackends(workspaceName)
    const folder = backendTreeTarget(target.path, backends)
    const backend = folder && backends.find(item => item.address === folder.address && item.driver === folder.driver)
    if (!folder || !backend) throw new Error('Choose a folder on a storage backend')
    if (backend.kind !== 'storage' || backend.enabled === false || backend.config?.readOnly === true) {
      throw new Error(`${backend.address} is read-only`)
    }
    const result = await transferDocumentsToBackends(workspaceName, documentIds, {
      to: [folder.address], mode: source.move ? 'move' : 'copy', folder: folder.key, onConflict: 'rename',
    })
    if (result.successful.length) {
      announce(workspaceName, BACKENDS_TREE_NAME, target.path)
      if (source.move && source.sourcePath && source.sourceTreeName) announce(workspaceName, source.sourceTreeName, source.sourcePath)
      window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail: { workspaceName } }))
    }
    if (!result.successful.length) throw new Error(result.failed[0]?.reason || 'Nothing was transferred')
    const skipped = result.failed.length ? `, ${result.failed.length} skipped (${result.failed[0].reason})` : ''
    return `${result.successful.length} file(s) ${source.move ? 'moved' : 'copied'} to ${folder.address}${skipped}`
  }

  const treeType = target.treeType ?? treeTypeForName(target.treeName)
  const ok = await pasteDocumentsToWorkspacePath(workspaceName, target.path, documentIds, target.treeName, treeType)
  if (!ok) throw new Error('Failed to paste documents')
  // A move unlinks from the folder the documents came from. Backend folders
  // hold the bytes themselves, so filing a backend file elsewhere never
  // removes it from its backend.
  const sameFolder = source.sourceTreeName === target.treeName && source.sourcePath !== undefined && normalize(source.sourcePath) === normalize(target.path)
  const moved = Boolean(source.move && source.sourcePath && source.sourceTreeName && source.sourceTreeName !== BACKENDS_TREE_NAME && !sameFolder)
  if (moved) {
    await removeWorkspaceDocuments(workspaceName, documentIds, source.sourcePath!, [], source.sourceTreeName!, treeTypeForName(source.sourceTreeName!))
    announce(workspaceName, source.sourceTreeName!, source.sourcePath!)
  }
  announce(workspaceName, target.treeName, target.path)
  return `${count} document(s) ${moved ? 'moved' : 'pasted'} to "${target.path}"`
}

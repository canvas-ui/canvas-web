// Files of an OS drop, grouped by the folder they sit in relative to the drop
// ('' = dropped directly). Dropped directories are walked recursively, so a
// folder lands as a folder; browsers without the entries API yield flat files.

interface DroppedFolder {
  /** Slash-separated folder path relative to the drop target, '' for the top. */
  folder: string
  files: File[]
}

const readFile = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject))

async function readDirectory(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader()
  const entries: FileSystemEntry[] = []
  // readEntries returns the listing in chunks; an empty chunk ends it.
  for (;;) {
    const chunk = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (chunk.length === 0) return entries
    entries.push(...chunk)
  }
}

export const isFileDrag = (transfer: DataTransfer | null): boolean => !!transfer && Array.from(transfer.types).includes('Files')

export async function readDroppedFiles(transfer: DataTransfer): Promise<DroppedFolder[]> {
  // Entries must be taken synchronously: the item list is emptied once the
  // drop handler returns.
  const entries = Array.from(transfer.items)
    .filter(item => item.kind === 'file')
    .map(item => item.webkitGetAsEntry?.() ?? null)
  const flat = Array.from(transfer.files)
  if (entries.length === 0 || entries.some(entry => !entry)) return flat.length ? [{ folder: '', files: flat }] : []

  const groups = new Map<string, File[]>()
  const walk = async (entry: FileSystemEntry, folder: string): Promise<void> => {
    if (entry.isFile) {
      const files = groups.get(folder) ?? []
      files.push(await readFile(entry as FileSystemFileEntry))
      groups.set(folder, files)
    } else if (entry.isDirectory) {
      const inner = folder ? `${folder}/${entry.name}` : entry.name
      for (const child of await readDirectory(entry as FileSystemDirectoryEntry)) await walk(child, inner)
    }
  }
  for (const entry of entries) await walk(entry!, '')
  return [...groups].map(([folder, files]) => ({ folder, files }))
}

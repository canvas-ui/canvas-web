export interface BackendTrashItem {
  id: string
  key: string
  type: 'file' | 'directory'
  sha256: string | null
  size: number | null
  deletedAt: number
  legacy?: boolean
}

export function backendTrashLocation(tree: string, path: string): { backend: string | null; prefix: string } | null {
  const parts = path.split('/').filter(Boolean)
  if (tree !== 'backends' || parts[0] !== 'Trash') return null
  try { return { backend: parts[1] ? decodeURIComponent(parts[1]) : null, prefix: parts.slice(2).join('/') } }
  catch { return null }
}

export function backendTrashPath(backend?: string | null, prefix = ''): string {
  return `/Trash${backend ? `/${encodeURIComponent(backend)}` : ''}${prefix ? `/${prefix}` : ''}`
}

export interface TrashRow {
  id: string
  name: string
  key: string
  directory: boolean
  navigable: boolean
  items: BackendTrashItem[]
}

// Original directories group individually deleted files, without flattening
// duplicate filenames or combining distinct deleted versions of the same file.
export function backendTrashRows(items: BackendTrashItem[], prefix = ''): TrashRow[] {
  const folders = new Map<string, TrashRow>()
  const rows: TrashRow[] = []
  const start = prefix ? `${prefix}/` : ''
  for (const item of items) {
    if (!item.key.startsWith(start)) continue
    const relative = item.key.slice(start.length)
    if (!relative) continue
    const slash = relative.indexOf('/')
    if (slash >= 0) {
      const name = relative.slice(0, slash)
      const key = start + name
      const row = folders.get(key) ?? { id: `folder:${key}`, name, key, directory: true, navigable: true, items: [] }
      row.items.push(item)
      folders.set(key, row)
    } else {
      rows.push({ id: item.id, name: relative, key: item.key, directory: item.type === 'directory', navigable: false, items: [item] })
    }
  }
  return [...folders.values(), ...rows].sort((a, b) => Number(b.directory) - Number(a.directory)
    || a.name.localeCompare(b.name) || b.items[0].deletedAt - a.items[0].deletedAt || a.id.localeCompare(b.id))
}

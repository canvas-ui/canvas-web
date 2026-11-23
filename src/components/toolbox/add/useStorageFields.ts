import { useEffect, useMemo, useState } from 'react'
import { listBackends, type Backend } from '@/services/workspace'
import { supportsBackendFolders } from '@/lib/backend-folders'
import type { AddTarget } from './useAddTarget'

/** A backend picked for an upload: the bytes are written straight to it. */
export interface UploadStorage {
  driver: string
  address: string
  /** Folder on a backend that keeps paths; empty for its top folder. */
  folder: string
}

export interface StorageFields {
  /** Backends of the upload's workspace that take uploads. Content stores are not among them. */
  backends: Backend[]
  /** Null: the workspace's own storage. */
  selected: Backend | null
  select: (address: string | null) => void
  folder: string
  setFolder: (folder: string) => void
  /** Null while the files go to the workspace's own storage. */
  storage: UploadStorage | null
}

// The server reports `upload` only for an enabled, writable backend whose
// driver takes keyed files; a content-addressed store reports `blobs` instead.
const takesUploads = (backend: Backend) => backend.capabilities?.upload === true && backend.capabilities.blobs !== true

const trimSlashes = (value: string) => value.split('/').map((part) => part.trim()).filter(Boolean).join('/')

/**
 * Storage choice for an upload into a virtual tree: the workspace's own
 * storage, or one backend that receives the files directly. A directory-tree
 * folder is the suggested folder on a backend that keeps paths; a context path
 * is a set of layers, so those files default to the backend's top folder.
 */
export function useStorageFields(workspaceName: string | null, target: AddTarget): StorageFields {
  const [loaded, setLoaded] = useState<{ workspaceName: string; backends: Backend[] } | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [typedFolder, setTypedFolder] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceName) return
    let cancelled = false
    listBackends(workspaceName)
      .then((list) => { if (!cancelled) setLoaded({ workspaceName, backends: list.filter(takesUploads) }) })
      .catch(() => { /* the workspace's own storage needs no list */ })
    return () => { cancelled = true }
  }, [workspaceName])

  const backends = useMemo(
    () => (loaded && loaded.workspaceName === workspaceName ? loaded.backends : []),
    [loaded, workspaceName],
  )
  const selected = backends.find((backend) => backend.address === address) ?? null
  const suggested = target?.mode === 'workspace' && target.treeType === 'directory' ? trimSlashes(target.path) : ''
  const folder = selected && supportsBackendFolders(selected) ? typedFolder ?? suggested : ''

  const storage = useMemo<UploadStorage | null>(
    () => (selected ? { driver: selected.driver, address: selected.address, folder: trimSlashes(folder) } : null),
    [selected, folder],
  )

  return { backends, selected, select: setAddress, folder, setFolder: setTypedFolder, storage }
}

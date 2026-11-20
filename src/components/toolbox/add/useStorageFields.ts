import { useEffect, useMemo, useState } from 'react'
import { listBackends, type Backend } from '@/services/workspace'
import type { AddTarget } from './useAddTarget'

/** The content store every upload lands in unless the user picks otherwise. */
export const DEFAULT_UPLOAD_STORE = 'workspace:data'

/** Where the bytes of an upload are kept, beyond the default content store. */
export interface UploadStorage {
  /** Backends that receive a copy. */
  to: string[]
  /** False: the copy in the default store is released once the first of `to` holds the file. */
  keepDefault: boolean
  /** Folder on backends that keep paths; the content stores ignore it. */
  folder: string
}

export interface StorageFields {
  /** Writable storage backends of the upload's workspace, default store first. */
  backends: Backend[]
  selected: Set<string>
  toggle: (address: string) => void
  folder: string
  /** Null when the selection is the default store alone. */
  storage: UploadStorage | null
}

const writable = (backend: Backend) =>
  backend.kind === 'storage' && backend.enabled !== false && backend.config?.readOnly !== true && backend.config?.supported !== false

/**
 * Storage choice for an upload into a virtual tree: the default content store,
 * other backends, or both. A directory-tree folder keeps its path on backends
 * that have folders; a context path is a set of layers, so those files go to
 * the backend root.
 */
export function useStorageFields(workspaceName: string | null, target: AddTarget): StorageFields {
  const [loaded, setLoaded] = useState<{ workspaceName: string; backends: Backend[] } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set([DEFAULT_UPLOAD_STORE]))

  useEffect(() => {
    if (!workspaceName) return
    let cancelled = false
    listBackends(workspaceName)
      .then((list) => { if (!cancelled) setLoaded({ workspaceName, backends: list.filter(writable) }) })
      .catch(() => { /* the default store needs no list */ })
    return () => { cancelled = true }
  }, [workspaceName])

  const backends = useMemo(() => {
    const list = loaded && loaded.workspaceName === workspaceName ? loaded.backends : []
    return [...list].sort((a, b) => Number(b.address === DEFAULT_UPLOAD_STORE) - Number(a.address === DEFAULT_UPLOAD_STORE))
  }, [loaded, workspaceName])

  const folder = target?.mode === 'workspace' && target.treeType === 'directory' ? target.path.replace(/^\/+|\/+$/g, '') : ''

  const toggle = (address: string) => setSelected((previous) => {
    const next = new Set(previous)
    if (next.has(address)) next.delete(address)
    else next.add(address)
    // The file has to be kept somewhere.
    return next.size ? next : previous
  })

  const storage = useMemo<UploadStorage | null>(() => {
    const available = new Set(backends.map((b) => b.address))
    const to = [...selected].filter((address) => address !== DEFAULT_UPLOAD_STORE && available.has(address))
    if (!to.length) return null
    return { to, keepDefault: selected.has(DEFAULT_UPLOAD_STORE), folder }
  }, [backends, selected, folder])

  return { backends, selected, toggle, folder, storage }
}

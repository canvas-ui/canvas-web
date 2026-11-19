import type { Backend } from '@/services/workspace'

/** Whether the storage driver reports support for user-chosen folder paths. */
export function supportsBackendFolders(backend?: Pick<Backend, 'capabilities'>): boolean {
  return backend?.capabilities?.paths === true
}

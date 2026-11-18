import type { Backend } from '@/services/workspace'

/** Whether the rule builder offers a folder within this backend. */
export function supportsBackendFolders(backend?: Pick<Backend, 'address' | 'capabilities'>): boolean {
  return backend?.address !== 'workspace:home' && backend?.capabilities?.paths === true
}

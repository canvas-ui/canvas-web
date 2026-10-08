import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

export interface SubtreeArchive {
  format: 'canvas-subtree'
  version: 1
  id: string
  source: { workspaceId: string; workspaceName: string; path: string; tree: { id: string; name: string; type: string } }
  nodes: Array<{ path: string; name: string; documentIds: number[] }>
  documents: Array<{ id: number }>
  relations: Array<{ from: number; p: string; to: number }>
  externalReferences: Array<{ id: number }>
  summary: { folders: number; subtreeDocuments: number; supportingDocuments: number; documents: number; externalRelations: number }
}

export interface SubtreeImportResult {
  path: string
  folders: number
  documents: number
  created: number
  reused: number
  relations: number
  unresolvedRelations: number
}

export interface SubtreeJob {
  id: string
  status: 'running' | 'done' | 'failed'
  phase: string
  received: number
  total: number | null
  result: SubtreeArchive | SubtreeImportResult | null
  error: { message: string } | null
}

const base = (workspace: string, tree: string) => `${API_ROUTES.workspaces}/${encodeURIComponent(workspace)}/trees/${encodeURIComponent(tree)}/subtree`

export function startSubtreeExport(workspace: string, tree: string, path: string, dependencies: 'related' | 'none') {
  return api.post<SubtreeJob>(`${base(workspace, tree)}/export`, { path, dependencies })
}

export function startSubtreeImport(workspace: string, tree: string, parentPath: string, name: string, archive: SubtreeArchive) {
  return api.post<SubtreeJob>(`${base(workspace, tree)}/import`, { parentPath, name, archive })
}

export async function waitForSubtreeJob(workspace: string, tree: string, id: string, onProgress: (job: SubtreeJob) => void): Promise<SubtreeJob> {
  for (;;) {
    const job = await api.get<SubtreeJob>(`${base(workspace, tree)}/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' })
    onProgress(job)
    if (job.status === 'failed') throw new Error(job.error?.message || 'Subtree transfer failed')
    if (job.status === 'done') return job
    await new Promise(resolve => setTimeout(resolve, 750))
  }
}

import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

export interface BlobUploadResult {
  url: string
  key: string
  checksum: string
  size: number
}

// Raw-bytes upload into a workspace's blob store (workspace:data). Returns a
// stored:// URL usable as a document location — see src/transports/routes/workspaces/blobs.js.
// api.post already unwraps the response envelope — the result IS the payload.
export async function uploadWorkspaceBlob(workspaceName: string, file: File | Blob): Promise<BlobUploadResult> {
  return api.post<BlobUploadResult>(
    `${API_ROUTES.workspaces}/${workspaceName}/blobs`,
    file,
    { headers: { 'Content-Type': 'application/octet-stream' } },
  )
}

import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

export interface BlobUploadResult {
  url: string
  key: string
  checksum: string
  size: number
}

interface BlobUploadResponse {
  payload: BlobUploadResult
  message: string
  status: string
  statusCode: number
}

// Raw-bytes upload into a workspace's blob store (workspace:data). Returns a
// stored:// URL usable as a document location — see src/transports/routes/workspaces/blobs.js.
export async function uploadWorkspaceBlob(workspaceName: string, file: File | Blob): Promise<BlobUploadResult> {
  const response = await api.post<BlobUploadResponse>(
    `${API_ROUTES.workspaces}/${workspaceName}/blobs`,
    file,
    { headers: { 'Content-Type': 'application/octet-stream' } },
  )
  return response.payload
}

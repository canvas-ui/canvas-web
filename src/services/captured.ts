import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'

export type CaptureConfig = { enabled: boolean; url: string; tokenSet: boolean; timeoutMs: number; maxBytes: number }
const endpoint = (workspace: string) => `${API_ROUTES.workspaces}/${encodeURIComponent(workspace)}/captured`
export const getCaptureConfig = (workspace: string) => api.get<CaptureConfig>(`${endpoint(workspace)}/config`)
export const saveCaptureConfig = (workspace: string, config: Omit<CaptureConfig, 'tokenSet'> & { token?: string }) =>
  api.put<CaptureConfig>(`${endpoint(workspace)}/config`, config)
export const checkCaptureService = (workspace: string) => api.post<{ message: string }>(`${endpoint(workspace)}/test`, {})

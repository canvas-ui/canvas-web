import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'

export interface Device {
  deviceId: string
  name: string
  description?: string
  platform?: string
  arch?: string
  type?: string
  createdAt?: string
  updatedAt?: string
}

export interface WorkspaceDevice {
  id: number
  deviceId: string
  name?: string
  description?: string
  platform?: string
  arch?: string
  type?: string
  createdAt?: string
  updatedAt?: string
}

export async function listDevices(): Promise<Device[]> {
  const res = await api.get<{ payload: Device[] }>(API_ROUTES.devices)
  return res.payload || []
}

export async function updateDevice(deviceId: string, patch: { name?: string; description?: string }): Promise<Device> {
  const res = await api.patch<{ payload: Device }>(`${API_ROUTES.devices}/${encodeURIComponent(deviceId)}`, patch)
  return res.payload
}

export async function listWorkspaceDevices(workspaceId: string): Promise<WorkspaceDevice[]> {
  const res = await api.get<{ payload: WorkspaceDevice[] }>(`${API_ROUTES.workspaces}/${workspaceId}/devices`)
  return res.payload || []
}

export async function linkWorkspaceDevice(workspaceId: string, deviceId: string): Promise<WorkspaceDevice[]> {
  const res = await api.post<{ payload: WorkspaceDevice[] }>(
    `${API_ROUTES.workspaces}/${workspaceId}/devices`,
    { deviceId }
  )
  return Array.isArray(res.payload) ? res.payload : [res.payload]
}

export async function unlinkWorkspaceDevice(workspaceId: string, deviceId: string): Promise<void> {
  await api.delete<{ payload: unknown }>(
    `${API_ROUTES.workspaces}/${workspaceId}/devices/${encodeURIComponent(deviceId)}`
  )
}

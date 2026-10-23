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
  lastSeen?: string
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
  const res = await api.get<Device[]>(API_ROUTES.devices)
  return res || []
}

export async function updateDevice(deviceId: string, patch: { name?: string; description?: string }): Promise<Device> {
  const res = await api.patch<Device>(`${API_ROUTES.devices}/${encodeURIComponent(deviceId)}`, patch)
  return res
}

/** Revoke a device: its tokens and its registry record (mirrors included). */
export async function removeDevice(deviceId: string): Promise<void> {
  await api.delete<unknown>(`${API_ROUTES.devices}/${encodeURIComponent(deviceId)}`)
}

export async function listWorkspaceDevices(workspaceId: string): Promise<WorkspaceDevice[]> {
  const res = await api.get<WorkspaceDevice[]>(`${API_ROUTES.workspaces}/${workspaceId}/devices`)
  return res || []
}

/** The workspace keeps its own record of the device (name, platform …), so the account record goes along. */
export async function linkWorkspaceDevice(workspaceId: string, device: Device): Promise<WorkspaceDevice[]> {
  const { deviceId, name, description, platform, arch, type } = device
  const res = await api.post<WorkspaceDevice[]>(
    `${API_ROUTES.workspaces}/${workspaceId}/devices`,
    { devices: [{ deviceId, name, description, platform, arch, type }] }
  )
  return Array.isArray(res) ? res : [res]
}

export async function unlinkWorkspaceDevice(workspaceId: string, deviceId: string): Promise<void> {
  await api.delete<unknown>(
    `${API_ROUTES.workspaces}/${workspaceId}/devices/${encodeURIComponent(deviceId)}`
  )
}

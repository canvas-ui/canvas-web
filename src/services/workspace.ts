import { API_ROUTES } from '@/config/api';
import { api } from '@/lib/api';
// GLOBAL Workspace type from src/types/api.d.ts will be used.
// No local Workspace interface should be defined here.

interface ResponseObject<T> { // This generic wrapper is fine.
  status: 'success' | 'error';
  statusCode: number;
  message: string;
  payload: T;
  count?: number;
}

// listWorkspaces should return a Promise where Workspace is the global type.
export async function listWorkspaces(): Promise<ResponseObject<Workspace[]>> {
  try {
    // The T in ResponseObject<T> will be Workspace[] (global type).
    return await api.get<ResponseObject<Workspace[]>>(API_ROUTES.workspaces);
  } catch (error) {
    console.error('Failed to list workspaces:', error);
    throw error;
  }
}

// createWorkspace payload and response should align with the global Workspace type.
// Note: Global Workspace has owner, createdAt, updatedAt, status, type - some set by backend.
interface CreateWorkspacePayload {
    name: string;
    description?: string;
    color?: string;
    label?: string;
    type?: string; // This aligns with optional 'type' in global Workspace
}
export async function createWorkspace(payload: CreateWorkspacePayload): Promise<ResponseObject<Workspace>> {
  try {
    // Response T is Workspace (global type).
    return await api.post<ResponseObject<Workspace>>(API_ROUTES.workspaces, payload);
  } catch (error) {
    console.error('Failed to create workspace:', error);
    throw error;
  }
}

export async function startWorkspace(id: string): Promise<ResponseObject<Workspace>> {
  try {
    return await api.post<ResponseObject<Workspace>>(`${API_ROUTES.workspaces}/${id}/start`);
  } catch (error) {
    console.error(`Failed to start workspace ${id}:`, error);
    throw error;
  }
}

// openWorkspace and closeWorkspace should also operate with the global Workspace type.
export async function openWorkspace(id: string): Promise<ResponseObject<Workspace>> {
  try {
    return await api.post<ResponseObject<Workspace>>(`${API_ROUTES.workspaces}/${id}/open`);
  } catch (error) {
    console.error(`Failed to open workspace ${id}:`, error);
    throw error;
  }
}

export async function closeWorkspace(id: string): Promise<ResponseObject<Workspace>> {
  try {
    return await api.post<ResponseObject<Workspace>>(`${API_ROUTES.workspaces}/${id}/close`);
  } catch (error) {
    console.error(`Failed to close workspace ${id}:`, error);
    throw error;
  }
}

export async function removeWorkspace(id: string): Promise<ResponseObject<null>> {
  try {
    return await api.delete<ResponseObject<null>>(`${API_ROUTES.workspaces}/${id}`);
  } catch (error) {
    console.error(`Failed to remove workspace ${id}:`, error);
    throw error;
  }
}

export async function purgeWorkspace(id: string): Promise<ResponseObject<null>> {
  try {
    return await api.delete<ResponseObject<null>>(`${API_ROUTES.workspaces}/${id}/purge`);
  } catch (error) {
    console.error(`Failed to purge workspace ${id}:`, error);
    throw error;
  }
}

import { API_ROUTES } from '@/config/api';
import { api } from '@/lib/api';

interface Workspace {
  id: string;
  name: string;
  description: string;
  color: string;
  status: string;
}

interface WorkspaceResponse {
  message: string;
  payload: Workspace;
  status: "success" | "error";
  statusCode: number;
}

interface WorkspaceListResponse {
  message: string;
  payload: {
    workspaces: Workspace[];
    total: number;
    limit: number;
    offset: number;
  };
  status: "success" | "error";
  statusCode: number;
}

export async function listWorkspaces(): Promise<WorkspaceListResponse> {
  try {
    return await api.get<WorkspaceListResponse>(API_ROUTES.workspaces);
  } catch (error) {
    throw error;
  }
}

export async function createWorkspace(name: string, description?: string): Promise<WorkspaceResponse> {
  try {
    return await api.post<WorkspaceResponse>(API_ROUTES.workspaces, { name, description });
  } catch (error) {
    throw error;
  }
}

export async function openWorkspace(id: string): Promise<WorkspaceResponse> {
  try {
    return await api.post<WorkspaceResponse>(`${API_ROUTES.workspaces}/${id}/open`);
  } catch (error) {
    throw error;
  }
}

export async function closeWorkspace(id: string): Promise<WorkspaceResponse> {
  try {
    return await api.post<WorkspaceResponse>(`${API_ROUTES.workspaces}/${id}/close`);
  } catch (error) {
    throw error;
  }
}

export async function removeWorkspace(id: string): Promise<WorkspaceResponse> {
  try {
    return await api.delete<WorkspaceResponse>(`${API_ROUTES.workspaces}/${id}`);
  } catch (error) {
    throw error;
  }
}

export async function purgeWorkspace(id: string): Promise<WorkspaceResponse> {
  try {
    return await api.delete<WorkspaceResponse>(`${API_ROUTES.workspaces}/${id}/purge`);
  } catch (error) {
    throw error;
  }
}

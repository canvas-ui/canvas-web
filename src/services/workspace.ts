import { API_ROUTES } from '@/config/api';
import { api } from '@/lib/api';

interface Workspace {
  id: string;
  name: string;
  description: string;
  color: string;
  status: string;
  created: string;
  updated: string;
}

interface ResponseObject<T> {
  status: 'success' | 'error';
  statusCode: number;
  message: string;
  payload: T;
  count?: number;
}

export async function listWorkspaces(): Promise<ResponseObject<Workspace[]>> {
  try {
    return await api.get<ResponseObject<Workspace[]>>(API_ROUTES.workspaces);
  } catch (error) {
    throw error;
  }
}

export async function createWorkspace(name: string, description?: string): Promise<ResponseObject<Workspace>> {
  try {
    return await api.post<ResponseObject<Workspace>>(API_ROUTES.workspaces, { name, description });
  } catch (error) {
    throw error;
  }
}

export async function openWorkspace(id: string): Promise<ResponseObject<Workspace>> {
  try {
    return await api.post<ResponseObject<Workspace>>(`${API_ROUTES.workspaces}/${id}/open`);
  } catch (error) {
    throw error;
  }
}

export async function closeWorkspace(id: string): Promise<ResponseObject<Workspace>> {
  try {
    return await api.post<ResponseObject<Workspace>>(`${API_ROUTES.workspaces}/${id}/close`);
  } catch (error) {
    throw error;
  }
}

export async function removeWorkspace(id: string): Promise<ResponseObject<null>> {
  try {
    return await api.delete<ResponseObject<null>>(`${API_ROUTES.workspaces}/${id}`);
  } catch (error) {
    throw error;
  }
}

export async function purgeWorkspace(id: string): Promise<ResponseObject<null>> {
  try {
    return await api.delete<ResponseObject<null>>(`${API_ROUTES.workspaces}/${id}/purge`);
  } catch (error) {
    throw error;
  }
}

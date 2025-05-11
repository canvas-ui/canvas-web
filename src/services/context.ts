import { API_ROUTES } from '@/config/api';
import { api } from '@/lib/api';
// Removed import for Context and Workspace as they are global types from src/types/api.d.ts

// Re-defining ApiResponse for service-specific payload unwrapping, aligned with global structure
interface ServiceApiResponse<T> {
  status: string;
  statusCode: number;
  message: string;
  payload: T;
}

// Type for the payload when creating a context
// Based on current usage in ContextsPage: id, url, description, workspaceId, baseUrl
// Global Context type already includes most of these. We need to ensure `workspace` is `workspaceId` for the POST.
// And make sure other non-provided fields are optional or handled.
type CreateContextPayload = Pick<Context, 'id' | 'url'> &
                            Partial<Pick<Context, 'description' | 'baseUrl'>> &
                            { workspaceId: string };

export async function listContexts(): Promise<Context[]> {
  try {
    const response = await api.get<ServiceApiResponse<Context[]>>(API_ROUTES.contexts);
    return response.payload; // ContextsPage expects the array directly
  } catch (error) {
    console.error('Failed to list contexts:', error);
    throw error;
  }
}

export async function getContext(id: string): Promise<Context> {
  try {
    // API returns { payload: { context: Context } }
    const response = await api.get<ServiceApiResponse<{ context: Context }>>(`${API_ROUTES.contexts}/${id}`);
    if (response.payload && response.payload.context) {
      return response.payload.context;
    }
    throw new Error('Context data not found in API response');
  } catch (error) {
    console.error(`Failed to get context ${id}:`, error);
    throw error;
  }
}

export async function createContext(contextData: CreateContextPayload): Promise<Context> {
  try {
    // API expects { id, url, description?, workspaceId, baseUrl? }
    // API returns { payload: { context: Context } }
    const response = await api.post<ServiceApiResponse<{ context: Context }>>(API_ROUTES.contexts, contextData);
    if (response.payload && response.payload.context) {
      return response.payload.context;
    }
    throw new Error('Created context data not found in API response');
  } catch (error) {
    console.error('Failed to create context:', error);
    throw error;
  }
}

export async function updateContextUrl(id: string, url: string): Promise<Context> {
  try {
    // API expects { url: string }
    // API returns { payload: Context } (as assumed in ContextDetailPage)
    const response = await api.post<ServiceApiResponse<Context>>(`${API_ROUTES.contexts}/${id}/url`, { url });
    return response.payload;
  } catch (error) {
    console.error(`Failed to update context URL for ${id}:`, error);
    throw error;
  }
}

export async function deleteContext(id: string): Promise<void> {
  try {
    // API typically returns a success message or no content for delete
    await api.delete<ServiceApiResponse<null>>(`${API_ROUTES.contexts}/${id}`);
  } catch (error) {
    console.error(`Failed to delete context ${id}:`, error);
    throw error;
  }
}

export async function getContextDocuments(id: string): Promise<any> {
  try {
    const response = await api.get<ServiceApiResponse<any>>(`${API_ROUTES.contexts}/${id}/documents`);
    return response.payload;
  } catch (error) {
    console.error(`Failed to get context documents for ${id}:`, error);
    throw error;
  }
}

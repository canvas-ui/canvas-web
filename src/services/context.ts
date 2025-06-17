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

interface DocumentResponse {
  data: Array<{
    id: number;
    schema: string;
    schemaVersion: string;
    data: Record<string, any>;
    metadata: {
      contentType: string;
      contentEncoding: string;
      dataPaths: string[];
    };
    indexOptions: {
      checksumAlgorithms: string[];
      primaryChecksumAlgorithm: string;
      checksumFields: string[];
      ftsSearchFields: string[];
      vectorEmbeddingFields: string[];
      embeddingOptions: {
        embeddingModel: string;
        embeddingDimensions: number;
        embeddingProvider: string;
        embeddingProviderOptions: Record<string, any>;
        chunking: {
          type: string;
          chunkSize: number;
          chunkOverlap: number;
        };
      };
    };
    createdAt: string;
    updatedAt: string;
    checksumArray: string[];
    embeddingsArray: any[];
    parentId: string | null;
    versions: any[];
    versionNumber: number;
    latestVersion: number;
  }>;
  count: number;
  error: string | null;
}

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

export async function getSharedContext(ownerId: string, contextId: string): Promise<Context> {
  try {
    // API returns { payload: { context: Context } }
    const response = await api.get<ServiceApiResponse<{ context: Context }>>(`${API_ROUTES.users}/${ownerId}/contexts/${contextId}`);
    if (response.payload && response.payload.context) {
      return response.payload.context;
    }
    throw new Error('Shared context data not found in API response');
  } catch (error) {
    console.error(`Failed to get shared context ${ownerId}/${contextId}:`, error);
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

export async function getContextDocuments(
  id: string,
  featureArray: string[] = [],
  filterArray: string[] = [],
  options: Record<string, any> = {}
): Promise<DocumentResponse['data']> {
  try {
    // Build query parameters - API expects arrays as separate parameters
    const params = new URLSearchParams();

    // Add each feature as a separate featureArray parameter
    featureArray.forEach(feature => {
      params.append('featureArray', feature);
    });

    // Add each filter as a separate filterArray parameter
    filterArray.forEach(filter => {
      params.append('filterArray', filter);
    });

    // Add options
    if (options.includeServerContext !== undefined) {
      params.append('includeServerContext', options.includeServerContext.toString());
    }
    if (options.includeClientContext !== undefined) {
      params.append('includeClientContext', options.includeClientContext.toString());
    }

    const url = `${API_ROUTES.contexts}/${id}/documents${params.toString() ? '?' + params.toString() : ''}`;
    // The API returns documents directly in payload array, not wrapped in a data property
    const response = await api.get<ServiceApiResponse<DocumentResponse['data']>>(url);
    return response.payload || [];
  } catch (error) {
    console.error(`Failed to get context documents for ${id}:`, error);
    throw error;
  }
}

export async function getSharedContextDocuments(
  ownerId: string,
  contextId: string,
  featureArray: string[] = [],
  filterArray: string[] = [],
  options: Record<string, any> = {}
): Promise<DocumentResponse['data']> {
  try {
    // Build query parameters - API expects arrays as separate parameters
    const params = new URLSearchParams();

    // Add each feature as a separate featureArray parameter
    featureArray.forEach(feature => {
      params.append('featureArray', feature);
    });

    // Add each filter as a separate filterArray parameter
    filterArray.forEach(filter => {
      params.append('filterArray', filter);
    });

    // Add options
    if (options.includeServerContext !== undefined) {
      params.append('includeServerContext', options.includeServerContext.toString());
    }
    if (options.includeClientContext !== undefined) {
      params.append('includeClientContext', options.includeClientContext.toString());
    }

    const url = `${API_ROUTES.users}/${ownerId}/contexts/${contextId}/documents${params.toString() ? '?' + params.toString() : ''}`;
    // The API returns documents directly in payload array, not wrapped in a data property
    const response = await api.get<ServiceApiResponse<DocumentResponse['data']>>(url);
    return response.payload || [];
  } catch (error) {
    console.error(`Failed to get shared context documents for ${ownerId}/${contextId}:`, error);
    throw error;
  }
}

// Context sharing functions
export async function grantContextAccess(ownerId: string, contextId: string, sharedWithUserId: string, accessLevel: string): Promise<{ message: string }> {
  try {
    const response = await api.post<ServiceApiResponse<{ message: string }>>(
      `${API_ROUTES.users}/${ownerId}/contexts/${contextId}/shares`,
      { sharedWithUserId, accessLevel }
    );
    return response.payload;
  } catch (error) {
    console.error(`Failed to grant context access:`, error);
    throw error;
  }
}

export async function revokeContextAccess(ownerId: string, contextId: string, sharedWithUserId: string): Promise<{ message: string }> {
  try {
    const response = await api.delete<ServiceApiResponse<{ message: string }>>(
      `${API_ROUTES.users}/${ownerId}/contexts/${contextId}/shares/${sharedWithUserId}`
    );
    return response.payload;
  } catch (error) {
    console.error(`Failed to revoke context access:`, error);
    throw error;
  }
}

export async function getContextTree(id: string): Promise<any> {
  try {
    const response = await api.get<ServiceApiResponse<any>>(`${API_ROUTES.contexts}/${id}/tree`);
    return response.payload;
  } catch (error) {
    console.error(`Failed to get context tree for ${id}:`, error);
    throw error;
  }
}

// Remove documents from a context (non-destructive, just unlink)
export async function removeDocumentsFromContext(contextId: string, documentIds: (string|number)[]): Promise<{ message: string }> {
  try {
    const response = await api.delete<ServiceApiResponse<{ message: string }>>(
      `${API_ROUTES.contexts}/${contextId}/documents/remove`,
      {
        body: JSON.stringify(documentIds),
        headers: { 'Content-Type': 'application/json' }
      }
    );
    return response.payload;
  } catch (error) {
    console.error('Failed to remove documents from context:', error);
    throw error;
  }
}

// Permanently delete documents from DB (owner-only)
export async function deleteDocumentsFromContext(contextId: string, documentIds: (string|number)[]): Promise<{ message: string }> {
  try {
    const response = await api.delete<ServiceApiResponse<{ message: string }>>(
      `${API_ROUTES.contexts}/${contextId}/documents`,
      {
        body: JSON.stringify(documentIds),
        headers: { 'Content-Type': 'application/json' }
      }
    );
    return response.payload;
  } catch (error) {
    console.error('Failed to delete documents from context DB:', error);
    throw error;
  }
}

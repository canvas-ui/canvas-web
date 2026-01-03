import { API_ROUTES } from '@/config/api';
import { api } from '@/lib/api';
// Removed import for Context and Workspace as they are global types from src/types/api.d.ts

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
    // The API returns a ResponseObject with contexts in the payload field
    const response = await api.get<{ payload: Context[]; message: string; status: string; statusCode: number }>(API_ROUTES.contexts);

    // Ensure we always return an array even if the response structure is unexpected
    if (Array.isArray(response.payload)) {
      return response.payload;
    } else {
      console.warn('listContexts: response.payload is not an array:', response.payload);
      return [];
    }
  } catch (error) {
    console.error('Failed to list contexts:', error);
    throw error;
  }
}

function withOwnerId(endpoint: string, ownerId?: string): string {
  if (!ownerId) return endpoint;
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}ownerId=${encodeURIComponent(ownerId)}`;
}

export async function getContext(id: string, ownerId?: string): Promise<Context> {
  try {
    const endpoint = withOwnerId(`${API_ROUTES.contexts}/${id}`, ownerId);
    const response = await api.get<{ payload: Context }>(endpoint);
    if (response && response.payload) {
      return response.payload;
    }
    throw new Error('Context data not found in API response');
  } catch (error) {
    console.error(`Failed to get context ${id}:`, error);
    throw error;
  }
}

export async function getSharedContext(contextId: string, ownerId?: string): Promise<Context> {
  return await getContext(contextId, ownerId);
}

export async function createContext(contextData: CreateContextPayload): Promise<Context> {
  try {
    const response = await api.post<{ payload: { context: Context } }>(API_ROUTES.contexts, contextData);
    if (response && response.payload && response.payload.context) {
      return response.payload.context;
    }
    throw new Error('Created context data not found in API response');
  } catch (error) {
    console.error('Failed to create context:', error);
    throw error;
  }
}

export async function updateContextUrl(id: string, url: string, ownerId?: string): Promise<Context> {
  try {
    const endpoint = withOwnerId(`${API_ROUTES.contexts}/${id}/url`, ownerId);
    const response = await api.post<{ payload: { url: string } }>(endpoint, { url });
    if (response && response.payload && response.payload.url) {
      // The URL update endpoint returns just the URL, not the full context
      // We'll need to fetch the context again or return a partial update
      return { url: response.payload.url } as Context;
    }
    throw new Error('Updated context data not found in API response');
  } catch (error) {
    console.error(`Failed to update context URL for ${id}:`, error);
    throw error;
  }
}

export async function deleteContext(id: string, ownerId?: string): Promise<void> {
  try {
    const endpoint = withOwnerId(`${API_ROUTES.contexts}/${id}`, ownerId);
    await api.delete<null>(endpoint);
  } catch (error) {
    console.error(`Failed to delete context ${id}:`, error);
    throw error;
  }
}

export async function getContextDocuments(
  id: string,
  featureArray: string[] = [],
  filterArray: string[] = [],
  options: Record<string, any> = {},
  ownerId?: string
): Promise<DocumentResponse['data'] & { count?: number; totalCount?: number }> {
  try {
    const params = new URLSearchParams();
    featureArray.forEach(feature => params.append('featureArray', feature));
    filterArray.forEach(filter => params.append('filterArray', filter));
    if (ownerId) params.append('ownerId', ownerId);
    if (options.includeServerContext !== undefined) {
      params.append('includeServerContext', options.includeServerContext.toString());
    }
    if (options.includeClientContext !== undefined) {
      params.append('includeClientContext', options.includeClientContext.toString());
    }
    if (options.limit !== undefined) params.append('limit', options.limit.toString());
    if (options.offset !== undefined) params.append('offset', options.offset.toString());
    if (options.page !== undefined) params.append('page', options.page.toString());

    const url = `${API_ROUTES.contexts}/${id}/documents${params.toString() ? '?' + params.toString() : ''}`;
    const response = await api.get<{ payload: DocumentResponse['data']; count: number; totalCount: number }>(url);

    // Handle the correct API response structure where documents are directly in payload
    if (Array.isArray(response.payload)) {
      // Attach pagination metadata to the array
      const result = response.payload as DocumentResponse['data'] & { count?: number; totalCount?: number };
      result.count = response.count;
      result.totalCount = response.totalCount;
      return result;
    } else {
      console.warn('getContextDocuments: response.payload is not an array:', response.payload);
      return [];
    }
  } catch (error) {
    console.error(`Failed to get context documents for ${id}:`, error);
    throw error;
  }
}

export async function getSharedContextDocuments(
  contextId: string,
  featureArray: string[] = [],
  filterArray: string[] = [],
  options: Record<string, any> = {},
  ownerId?: string
): Promise<DocumentResponse['data'] & { count?: number; totalCount?: number }> {
  return await getContextDocuments(contextId, featureArray, filterArray, options, ownerId);
}

// Context sharing functions
export async function grantContextAccess(contextId: string, sharedWithUserId: string, accessLevel: string): Promise<{ message: string }> {
  try {
    const response = await api.post<{ payload: any }>(
      `${API_ROUTES.contexts}/${contextId}/shares`,
      { userEmail: sharedWithUserId, accessLevel }
    );
    return { message: (response as any).payload?.message || 'Context access granted' };
  } catch (error) {
    console.error(`Failed to grant context access:`, error);
    throw error;
  }
}

export async function revokeContextAccess(contextId: string, sharedWithUserId: string): Promise<{ message:string }> {
  try {
    const response = await api.delete<{ payload: any }>(
      `${API_ROUTES.contexts}/${contextId}/shares/${encodeURIComponent(sharedWithUserId)}`
    );
    return { message: (response as any).payload?.message || 'Context access revoked' };
  } catch (error) {
    console.error(`Failed to revoke context access:`, error);
    throw error;
  }
}

export async function getContextTree(id: string, ownerId?: string): Promise<any> {
  try {
    const endpoint = withOwnerId(`${API_ROUTES.contexts}/${id}/tree`, ownerId);
    const response = await api.get<{ payload: any }>(endpoint);
    if (response && response.payload) {
      return response.payload;
    }
    throw new Error('Context tree data not found in API response');
  } catch (error) {
    console.error(`Failed to get context tree for ${id}:`, error);
    throw error;
  }
}

// Remove documents from a context (non-destructive, just unlink)
export async function removeDocumentsFromContext(contextId: string, documentIds: (string|number)[] | string | number, ownerId?: string): Promise<{ message: string }> {
  try {
    // Ensure documentIds is always an array
    const idsArray = Array.isArray(documentIds) ? documentIds : [documentIds];

    const response = await api.delete<{ payload: string }>(
        withOwnerId(`${API_ROUTES.contexts}/${contextId}/documents/remove`, ownerId),
        {
          body: JSON.stringify(idsArray),
          headers: { 'Content-Type': 'application/json' }
        }
    );
    return { message: response.payload || 'Documents removed from context' };
  } catch (error) {
    console.error(`Failed to remove documents from context ${contextId}:`, error);
    throw error;
  }
}

// Permanently delete documents from DB (owner-only)
export async function deleteDocumentsFromContext(contextId: string, documentIds: (string|number)[] | string | number, ownerId?: string): Promise<{ message: string }> {
  try {
    // Ensure documentIds is always an array
    const idsArray = Array.isArray(documentIds) ? documentIds : [documentIds];

    return await api.delete<{ message: string }>(
      withOwnerId(`${API_ROUTES.contexts}/${contextId}/documents`, ownerId),
      {
        body: JSON.stringify(idsArray),
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error(`Failed to delete documents from context ${contextId}:`, error);
    throw error;
  }
}

// Insert/paste documents to context at specific path
export async function pasteDocumentsToContext(contextId: string, path: string, documentIds: number[], ownerId?: string): Promise<boolean> {
  try {
    const ids = Array.isArray(documentIds) ? documentIds : [documentIds];
    await api.post<{ payload: any; message: string; status: string; statusCode: number }>(
      withOwnerId(`${API_ROUTES.contexts}/${contextId}/documents`, ownerId),
      { documentIds: ids, contextSpec: path }
    );
    return true;
  } catch (error) {
    console.error(`Failed to paste documents to context path ${path}:`, error);
    throw error;
  }
}

// Import new documents to context via workspace (since contexts use workspace documents API)
export async function importDocumentsToContext(workspaceId: string, contextPath: string, documents: any[]): Promise<boolean> {
  try {
    const docs = Array.isArray(documents) ? documents : [documents];
    await api.post<{ payload: any; message: string; status: string; statusCode: number }>(
      `${API_ROUTES.workspaces}/${workspaceId}/documents`,
      { documents: docs, contextSpec: contextPath }
    );
    return true;
  } catch (error) {
    console.error(`Failed to import documents to context path ${contextPath}:`, error);
    throw error;
  }
}

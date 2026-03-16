import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';

// Admin User interfaces
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  userType: 'user' | 'admin';
  status: 'active' | 'inactive' | 'pending' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  password?: string;
  userType?: 'user' | 'admin';
  status?: 'active' | 'inactive' | 'pending' | 'deleted';
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  password?: string;
  userType?: 'user' | 'admin';
  status?: 'active' | 'inactive' | 'pending' | 'deleted';
}

// Admin Workspace interfaces
export interface AdminWorkspace {
  id: string;
  name: string;
  label: string;
  description: string;
  color: string;
  owner: string;
  ownerName?: string;
  ownerEmail?: string;
  status: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceData {
  userId: string;
  name: string;
  label?: string;
  description?: string;
  color?: string;
  type?: 'workspace' | 'universe';
  metadata?: Record<string, any>;
}

export interface AdminLogEntry {
  time: string | null;
  level: number | null;
  levelLabel: string;
  module: string | null;
  msg: string;
  line: string;
  raw: string;
}

export interface AdminLogFilters {
  tail?: number;
  level?: string;
  module?: string;
}

function buildLogQuery(filters: AdminLogFilters = {}): string {
  const params = new URLSearchParams();

  if (filters.tail) params.set('tail', String(filters.tail));
  if (filters.level) params.set('level', filters.level);
  if (filters.module) params.set('module', filters.module);

  const query = params.toString();
  return query ? `?${query}` : '';
}

function getStreamHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  if (!token) {
    throw new Error('Authentication required');
  }

  const appName = localStorage.getItem('appName') || window.location.hostname;
  return {
    Authorization: `Bearer ${token}`,
    'X-App-Name': appName,
    Accept: 'text/event-stream',
  };
}

// User Management Services
export const adminUserService = {
  /**
   * List all users
   */
  async listUsers(filters?: { status?: string; userType?: string }): Promise<AdminUser[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.userType) params.append('userType', filters.userType);

    const queryString = params.toString();
    const url = queryString ? `${API_ROUTES.admin.users}?${queryString}` : API_ROUTES.admin.users;

    const response = await api.get<ApiResponse<AdminUser[]>>(url);
    return response.payload;
  },

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<AdminUser> {
    const response = await api.get<ApiResponse<AdminUser>>(`${API_ROUTES.admin.users}/${userId}`);
    return response.payload;
  },

  /**
   * Create a new user
   */
  async createUser(userData: CreateUserData): Promise<AdminUser> {
    const response = await api.post<ApiResponse<AdminUser>>(API_ROUTES.admin.users, userData);
    return response.payload;
  },

  /**
   * Update user
   */
  async updateUser(userId: string, userData: UpdateUserData): Promise<AdminUser> {
    const response = await api.put<ApiResponse<AdminUser>>(`${API_ROUTES.admin.users}/${userId}`, userData);
    return response.payload;
  },

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    await api.delete(`${API_ROUTES.admin.users}/${userId}`);
  },
};

// Workspace Management Services
export const adminWorkspaceService = {
  /**
   * List all workspaces (admin view)
   */
  async listAllWorkspaces(): Promise<AdminWorkspace[]> {
    const response = await api.get<ApiResponse<AdminWorkspace[]>>(API_ROUTES.admin.workspaces);
    return response.payload;
  },

  /**
   * Create workspace for user
   */
  async createWorkspace(workspaceData: CreateWorkspaceData): Promise<AdminWorkspace> {
    const response = await api.post<ApiResponse<AdminWorkspace>>(API_ROUTES.admin.workspaces, workspaceData);
    return response.payload;
  },

  /**
   * Delete workspace
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    await api.delete(`${API_ROUTES.admin.workspaces}/${workspaceId}`);
  },
};

export const adminLogService = {
  async getLogs(filters: AdminLogFilters = {}): Promise<AdminLogEntry[]> {
    const response = await api.get<ApiResponse<{ logs: AdminLogEntry[] }>>(
      `${API_ROUTES.admin.logs}${buildLogQuery(filters)}`
    );
    return response.payload.logs || [];
  },

  async streamLogs(
    filters: AdminLogFilters = {},
    options: {
      signal?: AbortSignal;
      onEntry?: (entry: AdminLogEntry) => void;
      onError?: (error: Error) => void;
    } = {}
  ): Promise<void> {
    const { signal, onEntry, onError } = options;

    try {
      const response = await fetch(`${API_ROUTES.admin.logsStream}${buildLogQuery(filters)}`, {
        method: 'GET',
        headers: getStreamHeaders(),
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to open log stream (${response.status})`);
      }

      if (!response.body) {
        throw new Error('Streaming is not supported by this browser');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const flushEvent = (eventBlock: string) => {
        const lines = eventBlock.split('\n');
        let eventName = 'message';
        const dataLines: string[] = [];

        for (const line of lines) {
          if (!line || line.startsWith(':')) continue;
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (eventName !== 'log' || dataLines.length === 0) {
          return;
        }

        const payload = JSON.parse(dataLines.join('\n')) as AdminLogEntry;
        onEntry?.(payload);
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const eventBlock of events) {
            flushEvent(eventBlock);
          }
        }

        if (buffer.trim()) {
          flushEvent(buffer);
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      const streamError = error instanceof Error ? error : new Error(String(error));
      onError?.(streamError);
      throw streamError;
    }
  },
};

// Combined admin service
export const adminService = {
  users: adminUserService,
  workspaces: adminWorkspaceService,
  logs: adminLogService,
};

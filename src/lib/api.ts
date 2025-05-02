import { API_URL } from '@/config/api'

function getAppName(): string {
  let appName = localStorage.getItem('appName')
  if (!appName) {
    appName = window.location.hostname
    localStorage.setItem('appName', appName)
  }
  return appName
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
  includeSession?: boolean
}

async function fetchWithDefaults(endpoint: string, options: RequestOptions = {}): Promise<Response> {
  const { skipAuth = false, includeSession = false, headers = {}, ...rest } = options

  // Include session ID if available and requested
  let sessionId = null;
  if (includeSession) {
    try {
      const sessionData = localStorage.getItem('selectedSession');
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        sessionId = parsed.id;
      }
    } catch (e) {
      console.error('Error parsing session data:', e);
    }
  }

  // Merge default headers with provided headers
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'X-App-Name': getAppName(),
    ...(sessionId && { 'X-Selected-Session': sessionId }),
    ...headers,
  }

  // Construct the full URL if a relative path is provided
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`

  const response = await fetch(url, {
    credentials: 'include', // Always include credentials for cookie support
    headers: defaultHeaders,
    ...rest,
  })

  if (!response.ok) {
    // Handle 401 Unauthorized specifically
    if (response.status === 401 && !skipAuth) {
      // Redirect to login
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }
    // For other errors, try to get error message from response
    const errorData = await response.json().catch(() => ({
      error: response.statusText || 'An error occurred'
    }))

    // Extract the most detailed error message available
    const errorMessage = errorData.message || errorData.error || response.statusText || 'Request failed'
    throw new Error(errorMessage)
  }

  return response
}

// Helper methods for common HTTP methods
export const api = {
  async get<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const response = await fetchWithDefaults(endpoint, {
      method: 'GET',
      includeSession: true, // Always include session if available
      ...options,
    })
    return response.json()
  },

  async post<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    const response = await fetchWithDefaults(endpoint, {
      method: 'POST',
      includeSession: true, // Always include session if available
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    })
    return response.json()
  },

  async put<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    const response = await fetchWithDefaults(endpoint, {
      method: 'PUT',
      includeSession: true, // Always include session if available
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    })
    return response.json()
  },

  async delete<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const response = await fetchWithDefaults(endpoint, {
      method: 'DELETE',
      includeSession: true, // Always include session if available
      ...options,
    })
    return response.json()
  },
}

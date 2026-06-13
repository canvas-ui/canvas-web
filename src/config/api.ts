function getApiUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL
  const browserOrigin = window.location.origin

  if (!configuredUrl) {
    return `${browserOrigin}/rest/v2`
  }

  try {
    const apiUrl = new URL(configuredUrl)
    const browserUrl = new URL(browserOrigin)
    const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1'])
    const isLoopbackMismatch = loopbackHosts.has(apiUrl.hostname)
      && loopbackHosts.has(browserUrl.hostname)
      && apiUrl.hostname !== browserUrl.hostname
      && apiUrl.port === browserUrl.port

    if (isLoopbackMismatch) {
      return `${browserOrigin}${apiUrl.pathname}`
    }

    return apiUrl.toString().replace(/\/$/, '')
  } catch {
    return configuredUrl
  }
}

export const API_URL = getApiUrl()
// Don't convert to WebSocket protocol here - the socket.io client will handle that
export const WS_URL = API_URL.split('/rest')[0]

export const API_ROUTES = {
  // Auth routes
  login: `${API_URL}/auth/login`,
  register: `${API_URL}/auth/register`,
  logout: `${API_URL}/auth/logout`,
  me: `${API_URL}/auth/me`,
  authConfig: `${API_URL}/auth/config`,
  verifyEmailRequest: `${API_URL}/auth/verify-email`,

  // API Tokens
  tokens: `${API_URL}/auth/tokens`,

  // Users
  users: `${API_URL}/users`,
  currentUser: `${API_URL}/auth/me`,

  // Workspaces
  workspaces: `${API_URL}/workspaces`,

  // Contexts
  contexts: `${API_URL}/contexts`,

  // Admin routes
  admin: {
    users: `${API_URL}/admin/users`,
    workspaces: `${API_URL}/admin/workspaces`,
    logs: `${API_URL}/admin/logs`,
    logsStream: `${API_URL}/admin/logs/stream`,
  },

  // Roles
  roles: `${API_URL}/roles`,
  roleTemplates: `${API_URL}/role-templates`,

  // Devices (global registry)
  devices: `${API_URL}/auth/devices`,

  // WebSocket
  ws: WS_URL
}

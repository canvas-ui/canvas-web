export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/rest/v2'
// Don't convert to WebSocket protocol here - the socket.io client will handle that
export const WS_URL = API_URL.split('/rest')[0]

export const API_ROUTES = {
  // Auth routes
  login: `${API_URL}/auth/login`,
  register: `${API_URL}/auth/register`,
  logout: `${API_URL}/auth/logout`,
  me: `${API_URL}/auth/me`,

  // API Tokens
  tokens: `${API_URL}/auth/tokens`,

  // Users
  users: `${API_URL}/users`,
  currentUser: `${API_URL}/auth/me`,

  // Workspaces
  workspaces: `${API_URL}/workspaces`,

  // Contexts
  contexts: `${API_URL}/contexts`,

  // WebSocket
  ws: WS_URL
}

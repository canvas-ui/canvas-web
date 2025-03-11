export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/rest/v2'

export const API_ROUTES = {
  // Auth routes
  login: `${API_URL}/auth/login`,
  register: `${API_URL}/auth/register`,
  logout: `${API_URL}/auth/logout`,
  me: `${API_URL}/auth/me`,

  // API Tokens
  tokens: `${API_URL}/auth/tokens`,

  // Sessions
  sessions: `${API_URL}/sessions`,

  // Users
  users: `${API_URL}/users`,
  currentUser: `${API_URL}/auth/me`,

  // Workspaces
  workspaces: `${API_URL}/workspaces`,

  // Contexts
  contexts: `${API_URL}/contexts`
}

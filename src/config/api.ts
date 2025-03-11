export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/rest/v2'

export const API_ROUTES = {
  login: `${API_URL}/auth/login`,
  register: `${API_URL}/auth/register`,
  logout: `${API_URL}/auth/logout`,
  sessions: `${API_URL}/sessions`
}

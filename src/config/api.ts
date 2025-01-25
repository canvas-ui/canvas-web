export const API_URL = window.location.origin || 'http://localhost:8001/rest';
//export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/rest'

export const API_ROUTES = {
  login: `${API_URL}/login`,
  register: `${API_URL}/register`,
  logout: `${API_URL}/logout`,
  sessions: `${API_URL}/v2/sessions`
}

// Base API URL configuration
const isDevelopment = import.meta.env.DEV
const baseUrl = isDevelopment ? import.meta.env.VITE_API_URL || 'http://localhost:8001' : ''

export const API_URL = `${baseUrl}/rest`

export const API_ROUTES = {
  login: `${API_URL}/login`,
  register: `${API_URL}/register`,
  logout: `${API_URL}/logout`,
  sessions: `${API_URL}/v2/sessions`
}

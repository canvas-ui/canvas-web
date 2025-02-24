import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'

interface AuthResponse {
  message: string,
  payload: {
    token: string
  },
  status: "success" | "error",
  statusCode: number
}

interface AuthError {
  error: string
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  try {
    return await api.post<AuthResponse>(API_ROUTES.login, { email, password }, { skipAuth: true })
  } catch (error) {
    const err = error as AuthError
    throw new Error(err.error || 'Login failed')
  }
}

export async function registerUser(email: string, password: string): Promise<AuthResponse> {
  try {
    return await api.post<AuthResponse>(API_ROUTES.register, { email, password }, { skipAuth: true })
  } catch (error) {
    const err = error as AuthError
    throw new Error(err.error || 'Registration failed')
  }
}
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

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  try {
    return await api.post<AuthResponse>(API_ROUTES.login, { email, password }, { skipAuth: true })
  } catch (error) {
    throw error;
  }
}

export async function registerUser(email: string, password: string): Promise<AuthResponse> {
  try {
    return await api.post<AuthResponse>(API_ROUTES.register, { email, password }, { skipAuth: true })
  } catch (error) {
    throw error;
  }
}
interface User {
  id: string
  email: string
  createdAt: string
  updatedAt: string
}

interface Session {
  id: string
  name: string
  initializer: string
  user: User
}

interface ApiResponse<T = any> {
  status: string
  statusCode: number
  message: string
  payload: T
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
  includeSession?: boolean
}
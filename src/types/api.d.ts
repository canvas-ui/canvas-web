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
  createdAt: string
  lastActiveAt: string
  isActive: boolean
}

interface Workspace {
  id: string
  name: string
  description: string
  owner: string
  created: string
  updated: string
  status: 'active' | 'archived'
}

interface Context {
  id: string
  url: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  workspace: Workspace
  user: User
}

interface ApiToken {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string
  expiresAt: string
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

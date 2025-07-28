import { api } from '@/lib/api'

// Agent interfaces
export interface Agent {
  id: string
  name: string
  label?: string
  description?: string
  color?: string
  llmProvider: 'anthropic' | 'openai' | 'ollama'
  model: string
  status: 'available' | 'not_found' | 'error' | 'active' | 'inactive' | 'removed' | 'destroyed'
  isActive: boolean
  owner: string
  ownerEmail?: string
  createdAt: string
  updatedAt: string
  lastAccessed?: string
  config: {
    connectors: Record<string, any>
    prompts: Record<string, any>
    tools: Record<string, any>
    mcp: {
      servers: Array<{
        name: string
        command: string
        args: string[]
      }>
    }
  }
  metadata: Record<string, any>
}

export interface CreateAgentData {
  name: string
  label?: string
  description?: string
  color?: string
  llmProvider?: 'anthropic' | 'openai' | 'ollama'
  model?: string
  connectors?: Record<string, any>
  prompts?: Record<string, any>
  tools?: Record<string, any>
  mcp?: {
    servers: Array<{
      name: string
      command: string
      args: string[]
    }>
  }
  metadata?: Record<string, any>
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: {
    model?: string
    provider?: string
    toolCalls?: any[]
  }
}

export interface ChatRequest {
  message: string
  context?: ChatMessage[]
  mcpContext?: boolean
  maxTokens?: number
  temperature?: number
}

export interface ChatResponse {
  content: string
  metadata: {
    model: string
    provider: string
    timestamp: string
  }
}

export interface AgentMemory {
  id: string
  type: string
  user_message?: string
  agent_response?: string
  timestamp: string
  metadata: Record<string, any>
  stored_at: string
  agent_id: string
}

export interface MCPTool {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, any>
  source: string
}

export interface MCPToolResult {
  content: Array<{
    type: string
    text?: string
    [key: string]: any
  }>
}

// Agent API functions
export const listAgents = async (): Promise<Agent[]> => {
  const response = await api.get<{ payload: Agent[] }>('/agents')
  return response.payload
}

export const createAgent = async (agentData: CreateAgentData): Promise<Agent> => {
  const response = await api.post<{ payload: Agent }>('/agents', agentData)
  return response.payload
}

export const getAgent = async (agentId: string): Promise<Agent> => {
  const response = await api.get<{ payload: Agent }>(`/agents/${agentId}`)
  return response.payload
}

export const startAgent = async (agentId: string): Promise<Agent> => {
  const response = await api.post<{ payload: Agent }>(`/agents/${agentId}/start`)
  return response.payload
}

export const stopAgent = async (agentId: string): Promise<{ success: boolean }> => {
  const response = await api.post<{ payload: { success: boolean } }>(`/agents/${agentId}/stop`)
  return response.payload
}

export const getAgentStatus = async (agentId: string): Promise<{
  id: string
  name: string
  status: string
  isActive: boolean
  llmProvider: string
  model: string
  lastAccessed?: string
}> => {
  const response = await api.get<{ payload: any }>(`/agents/${agentId}/status`)
  return response.payload
}

export const chatWithAgent = async (agentId: string, chatRequest: ChatRequest): Promise<ChatResponse> => {
  const response = await api.post<{ payload: ChatResponse }>(`/agents/${agentId}/chat`, chatRequest)
  return response.payload
}

export const getAgentMemory = async (agentId: string, query?: string, limit = 50): Promise<AgentMemory[]> => {
  const params = new URLSearchParams()
  if (query) params.append('query', query)
  params.append('limit', limit.toString())

  const url = `/agents/${agentId}/memory?${params.toString()}`
  const response = await api.get<{ payload: AgentMemory[] }>(url)
  return response.payload
}

export const clearAgentMemory = async (agentId: string): Promise<{ success: boolean }> => {
  const response = await api.delete<{ payload: { success: boolean } }>(`/agents/${agentId}/memory`)
  return response.payload
}

export const getAgentMCPTools = async (agentId: string): Promise<MCPTool[]> => {
  const response = await api.get<{ payload: MCPTool[] }>(`/agents/${agentId}/mcp/tools`)
  return response.payload
}

export const callMCPTool = async (
  agentId: string,
  toolName: string,
  args: Record<string, any>,
  source?: string
): Promise<MCPToolResult> => {
  const response = await api.post<{ payload: MCPToolResult }>(
    `/agents/${agentId}/mcp/tools/${toolName}`,
    { arguments: args, source }
  )
  return response.payload
}

import { api } from '@/lib/api'
import { StreamingChatMessage, StreamingChatRequest } from '@/hooks/useAgentSocket'

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

export const updateAgent = async (agentId: string, updateData: Partial<CreateAgentData>): Promise<Agent> => {
  const response = await api.put<{ payload: Agent }>(`/agents/${agentId}`, updateData)
  return response.payload
}

export const deleteAgent = async (agentId: string): Promise<{ success: boolean }> => {
  const response = await api.delete<{ payload: { success: boolean } }>(`/agents/${agentId}`)
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

// Streaming chat with Server-Sent Events fallback
export const chatWithAgentStream = async (
  agentId: string,
  request: StreamingChatRequest,
  onChunk: (content: string, isComplete: boolean, metadata?: any) => void,
  onError?: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8001/rest/v2'}/agents/${agentId}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(request),
      signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          if (line.startsWith('data: ')) {
            const data = line.substring(6);

            if (data === '[DONE]') {
              onChunk('', true);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              console.log('SSE parsed data:', parsed);

              // Handle backend's actual format
              if (parsed.type === 'start') {
                // Stream starting, don't send content yet
                continue;
              } else if (parsed.type === 'chunk' || parsed.type === 'content') {
                // Send delta content if available, otherwise content
                const content = parsed.delta || parsed.content || '';
                onChunk(content, false, parsed.metadata);
              } else if (parsed.type === 'complete' || parsed.type === 'done') {
                // Stream complete
                onChunk('', true, parsed.metadata);
                return;
              } else if (parsed.type === 'error') {
                // Handle error type
                throw new Error(parsed.error || 'Stream error');
              } else {
                // Fallback for unknown types - treat as content
                const content = parsed.delta || parsed.content || '';
                if (content) {
                  onChunk(content, false, parsed.metadata);
                }
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', data, parseError);
            }
          }
        }
      }

      // If we exit the loop without explicit completion, mark as complete
      onChunk('', true);
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof Error && onError) {
      onError(error);
    } else if (onError) {
      onError(new Error('Unknown streaming error'));
    }
    throw error;
  }
};

// Convert ChatMessage to StreamingChatMessage
export const convertToStreamingMessage = (message: ChatMessage): StreamingChatMessage => ({
  role: message.role,
  content: message.content,
  timestamp: message.timestamp,
  isComplete: true,
  metadata: message.metadata
});

// Convert array of ChatMessages to StreamingChatMessages
export const convertToStreamingMessages = (messages: ChatMessage[]): StreamingChatMessage[] =>
  messages.map(convertToStreamingMessage);

// Fallback chat function that uses regular REST API
export const chatWithAgentFallback = async (
  agentId: string,
  request: ChatRequest
): Promise<ChatResponse> => {
  return chatWithAgent(agentId, request);
};

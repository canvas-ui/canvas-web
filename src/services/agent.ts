import { api } from '@/lib/api';
import { API_URL } from '@/config/api';
import { AnthropicConnector, WebSocketStreamingService, StreamMessage } from './streaming';

export interface AgentMessage {
  id: string;
  agentId: string;
  content: string;
  timestamp: Date;
  type: 'user' | 'agent';
  streaming?: boolean;
  error?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  type: 'anthropic' | 'openai' | 'custom';
  apiKey?: string;
  endpoint?: string;
  streamingSupported: boolean;
}

export interface AgentSkill {
  name: string;
  description: string;
  content: string;
  disableModelInvocation?: boolean;
}

export interface AgentResponseUsageCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

export interface AgentResponseUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: AgentResponseUsageCost;
}

export interface AgentResponseMetadata {
  api?: string;
  provider?: string;
  model?: string;
  stopReason?: string;
  timestamp?: string | number;
  responseId?: string;
  usage?: AgentResponseUsage;
  toolCalls?: any[];
  reasoning?: string;
}

export interface AgentImageContent {
  type: 'image';
  data: string;
  mimeType: string;
  name?: string;
}

export interface AgentSession {
  mode?: 'persistent' | 'experimental' | 'incognito';
  sessionId?: string;
  sessionFile?: string;
  thinkingLevel?: string;
  model?: {
    provider?: string;
    modelId?: string;
  };
  messages: ChatMessage[];
}

export interface AgentSessionSummary {
  id: string;
  path: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessage: string;
  allMessagesText: string;
  isCurrent: boolean;
  isExperimental?: boolean;
}

export interface AgentSessionList {
  mode: 'persistent' | 'experimental' | 'incognito';
  currentSessionId?: string;
  currentSessionPath?: string;
  sessions: AgentSessionSummary[];
}

export interface AgentSessionMutationResult {
  current: AgentSession;
  sessions: AgentSessionList;
}

// Main Agent interface used throughout the application
export interface Agent {
  id: string;
  name: string;
  label?: string;
  description?: string;
  color?: string;
  status: 'active' | 'inactive' | 'error' | 'starting' | 'stopping' | 'available';
  isActive: boolean;
  llmProvider: 'anthropic' | 'openai' | 'ollama' | 'lm-studio' | 'vllm' | 'custom';
  model: string;
  lastAccessed?: string;
  config: {
    type: 'anthropic' | 'openai' | 'ollama' | 'lm-studio' | 'vllm' | 'custom';
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    identity?: {
      role?: string;
      identity?: string;
      instructions?: string;
    };
    prompts?: {
      system?: string;
      append?: string;
      context?: string;
      user?: string;
    };
    memory?: string;
    skills?: AgentSkill[];
    connectors?: {
      [key: string]: {
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        topK?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
        numCtx?: number;
        reasoning?: boolean;
      };
    };
    mcp?: {
      enabled: boolean;
      servers: Array<{
        name: string;
        command: string;
        args?: string[];
        env?: Record<string, string>;
      }>;
    };
    parameters?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
    };
  };
  createdAt: string;
  updatedAt: string;
  lastUsed?: string;
}

// MCP Tool interface for Model Context Protocol tools
export interface MCPTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  server: string;
  source: string;
}

// Agent memory interface
export interface AgentMemory {
  id: string;
  agentId: string;
  type: 'conversation' | 'context' | 'instruction';
  content: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  timestamp?: string;
  user_message?: string;
  agent_response?: string;
}

// Chat message interface for streaming chat
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: AgentResponseMetadata;
}

function extractAgentMessageText(message: any): string {
  if (!message) return '';
  if (typeof message.errorMessage === 'string' && message.errorMessage.trim()) {
    return message.errorMessage.trim();
  }
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const text = content
    .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
    .map((block: any) => block.text)
    .join('\n');
  return text || '';
}

export function extractAgentMessageReasoning(message: any): string {
  if (!message) return '';
  if (typeof message?.metadata?.reasoning === 'string' && message.metadata.reasoning.trim()) {
    return message.metadata.reasoning.trim();
  }
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((block: any) => block?.type === 'thinking' || block?.type === 'reasoning')
    .map((block: any) => {
      if (typeof block?.thinking === 'string') return block.thinking;
      if (typeof block?.reasoning === 'string') return block.reasoning;
      if (typeof block?.text === 'string') return block.text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function extractAgentMessageMetadata(message: any): AgentResponseMetadata | undefined {
  if (!message) return undefined;

  const reasoning = extractAgentMessageReasoning(message);
  const metadata: AgentResponseMetadata = {
    ...(message.api ? { api: message.api } : {}),
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.model ? { model: message.model } : {}),
    ...(message.stopReason ? { stopReason: message.stopReason } : {}),
    ...(message.timestamp !== undefined ? { timestamp: message.timestamp } : {}),
    ...(message.responseId ? { responseId: message.responseId } : {}),
    ...(message.usage ? { usage: message.usage } : {}),
    ...(message.metadata?.toolCalls ? { toolCalls: message.metadata.toolCalls } : {}),
    ...(reasoning ? { reasoning } : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normalizeMessageTimestamp(timestamp: string | number | undefined): string {
  if (typeof timestamp === 'number') return new Date(timestamp).toISOString();
  if (typeof timestamp === 'string') {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

export function convertAgentSessionMessages(messages: any[] = []): ChatMessage[] {
  return messages
    .filter((message: any) => message?.role === 'user' || message?.role === 'assistant')
    .map((message: any) => ({
      role: message.role,
      content: extractAgentMessageText(message),
      timestamp: normalizeMessageTimestamp(message.timestamp),
      ...(message.role === 'assistant'
        ? { metadata: extractAgentMessageMetadata(message) }
        : {}),
    }))
    .filter((message) => message.content || message.metadata?.reasoning);
}

// Agent creation data interface
export interface CreateAgentData {
  name: string;
  label?: string;
  description?: string;
  color?: string;
  llmProvider?: 'anthropic' | 'openai' | 'ollama' | 'lm-studio' | 'vllm' | 'custom';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  config: Partial<Agent['config']>;
  connectors?: {
    [key: string]: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      numCtx?: number;
      reasoning?: boolean;
    };
  };
  mcp?: {
    enabled: boolean;
    servers: Array<{
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }>;
  };
}

export class AgentService {
  private connectors = new Map<string, AnthropicConnector>();
  private wsService: WebSocketStreamingService | null = null;
  private messageCallbacks = new Map<string, (message: AgentMessage) => void>();

  constructor() {
    // Initialize WebSocket fallback if needed
    this.initializeWebSocketFallback();
  }

  private async initializeWebSocketFallback(): Promise<void> {
    try {
      // Get WebSocket URL from current location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.wsService = new WebSocketStreamingService(wsUrl);
      // Don't auto-connect, only use as fallback
    } catch (error) {
      console.warn('WebSocket fallback not available:', error);
    }
  }

  /**
   * Registers an agent with the service
   */
  registerAgent(config: AgentConfig): void {
    if (config.type === 'anthropic') {
      const connector = new AnthropicConnector(
        config.apiKey || '',
        config.endpoint || `${API_URL}/agents/${config.id}`
      );
      this.connectors.set(config.id, connector);
    }
  }

  /**
   * Sends a message to an agent with streaming support
   */
  async sendMessage(
    agentId: string,
    message: string,
    options: {
      onMessage?: (message: AgentMessage) => void;
      onError?: (error: Error) => void;
      onComplete?: () => void;
      useWebSocketFallback?: boolean;
    } = {}
  ): Promise<void> {
    const { onMessage, onError, onComplete, useWebSocketFallback = false } = options;
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store callback for this message
    if (onMessage) {
      this.messageCallbacks.set(messageId, onMessage);
    }

    try {
      if (useWebSocketFallback && this.wsService) {
        // Use WebSocket fallback
        await this.sendMessageViaWebSocket(agentId, messageId, message, onMessage, onError);
        if (onComplete) {
          onComplete();
        }
        return;
      }

      // Try to use the specific connector first
      const connector = this.connectors.get(agentId);
      if (connector) {
        await connector.chatStream(message, {
          agentId,
          messageId,
          onMessage: (streamMsg: StreamMessage) => {
            const agentMessage: AgentMessage = {
              id: streamMsg.messageId,
              agentId: streamMsg.agentId,
              content: streamMsg.content || '',
              timestamp: new Date(),
              type: 'agent',
              streaming: !streamMsg.done,
              error: streamMsg.error,
            };

            if (onMessage) {
              onMessage(agentMessage);
            }
          },
          onError: (error: Error) => {
            console.error('Agent connector error:', error);
            // Try WebSocket fallback on fetch streaming failure
            if (error.message.includes('getReader is not a function') && this.wsService) {
              console.log('Falling back to WebSocket streaming...');
              this.sendMessageViaWebSocket(agentId, messageId, message, onMessage, onError);
              return;
            }
            if (onError) {
              onError(error);
            }
          },
          onComplete,
        });
      } else {
        // Fallback to generic API streaming
        await this.sendMessageViaAPI(agentId, messageId, message, onMessage, onError, onComplete);
      }
    } catch (error) {
      console.error('Agent communication error:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      // Clean up callback
      this.messageCallbacks.delete(messageId);
    }
  }

  private async sendMessageViaAPI(
    agentId: string,
    messageId: string,
    message: string,
    onMessage?: (message: AgentMessage) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): Promise<void> {
    try {
      await api.stream(`${API_URL}/agents/${agentId}/chat/stream`, {
        message,
        messageId,
      }, {
        onChunk: (chunk: string) => {
          try {
            // Try to parse as JSON first
            const data = JSON.parse(chunk);
            const agentMessage: AgentMessage = {
              id: messageId,
              agentId,
              content: data.content || chunk,
              timestamp: new Date(),
              type: 'agent',
              streaming: !data.done,
              error: data.error,
            };

            if (onMessage) {
              onMessage(agentMessage);
            }
          } catch {
            // If not JSON, treat as raw text
            const agentMessage: AgentMessage = {
              id: messageId,
              agentId,
              content: chunk,
              timestamp: new Date(),
              type: 'agent',
              streaming: true,
            };

            if (onMessage) {
              onMessage(agentMessage);
            }
          }
        },
        onError: (error: Error) => {
          console.error('API streaming error:', error);
          if (onError) {
            onError(error);
          }
        },
        onComplete,
      });
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private async sendMessageViaWebSocket(
    agentId: string,
    messageId: string,
    message: string,
    onMessage?: (message: AgentMessage) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    if (!this.wsService) {
      if (onError) {
        onError(new Error('WebSocket service not available'));
      }
      return;
    }

    try {
      // Connect if not already connected
      if (this.wsService['socket']?.readyState !== WebSocket.OPEN) {
        await this.wsService.connect();
      }

      this.wsService.startChatStream(
        agentId,
        messageId,
        message,
        (streamMsg: StreamMessage) => {
          const agentMessage: AgentMessage = {
            id: streamMsg.messageId,
            agentId: streamMsg.agentId,
            content: streamMsg.content || '',
            timestamp: new Date(),
            type: 'agent',
            streaming: !streamMsg.done,
            error: streamMsg.error,
          };

          if (onMessage) {
            onMessage(agentMessage);
          }
        },
        onError
      );
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Gets list of available agents
   */
  async getAvailableAgents(): Promise<AgentConfig[]> {
    try {
      const response = await api.get<{agents: AgentConfig[]}>(`${API_URL}/agents`);
      return response.agents || [];
    } catch (error) {
      console.error('Failed to fetch available agents:', error);
      return [];
    }
  }

  /**
   * Creates a new agent configuration
   */
  async createAgent(config: Omit<AgentConfig, 'id'>): Promise<AgentConfig> {
    const response = await api.post<AgentConfig>(`${API_URL}/agents`, config);

    // Register the new agent
    this.registerAgent(response);

    return response;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.connectors.clear();
    this.messageCallbacks.clear();
    if (this.wsService) {
      this.wsService.disconnect();
    }
  }
}

// Export singleton instance
export const agentService = new AgentService();

// Agent API Functions
// ===================

/**
 * List all available agents
 */
export async function listAgents(): Promise<Agent[]> {
  try {
    const response = await api.get<{ payload: Agent[] }>(`${API_URL}/agents`);
    return response.payload || [];
  } catch (error) {
    console.error('Failed to list agents:', error);
    return [];
  }
}

/**
 * Get a specific agent by ID
 */
export async function getAgent(agentId: string): Promise<Agent> {
  const response = await api.get<{ payload: Agent }>(`${API_URL}/agents/${agentId}`);
  return response.payload;
}

export async function getAgentSession(agentId: string): Promise<AgentSession> {
  const response = await api.get<{ payload: {
    mode?: 'persistent' | 'experimental' | 'incognito';
    sessionId?: string;
    sessionFile?: string;
    thinkingLevel?: string;
    model?: { provider?: string; modelId?: string };
    messages?: any[];
  } }>(`${API_URL}/agents/${agentId}/session`);

  return {
    mode: response.payload?.mode,
    sessionId: response.payload?.sessionId,
    sessionFile: response.payload?.sessionFile,
    thinkingLevel: response.payload?.thinkingLevel,
    model: response.payload?.model,
    messages: convertAgentSessionMessages(response.payload?.messages || []),
  };
}

export async function listAgentSessions(agentId: string): Promise<AgentSessionList> {
  const response = await api.get<{ payload: AgentSessionList }>(`${API_URL}/agents/${agentId}/sessions`);
  return response.payload;
}

export async function createAgentSession(
  agentId: string,
  data: { mode: 'persistent' | 'experimental' | 'incognito'; name?: string }
): Promise<AgentSessionMutationResult> {
  const response = await api.post<{ payload: AgentSessionMutationResult }>(`${API_URL}/agents/${agentId}/sessions`, data);
  return response.payload;
}

export async function selectAgentSession(
  agentId: string,
  data: { mode: 'persistent' | 'experimental' | 'incognito'; sessionId?: string }
): Promise<AgentSessionMutationResult> {
  const response = await api.put<{ payload: AgentSessionMutationResult }>(`${API_URL}/agents/${agentId}/session`, data);
  return response.payload;
}

export async function renameAgentSession(
  agentId: string,
  sessionId: string,
  data: { name: string }
): Promise<AgentSessionMutationResult> {
  const response = await api.patch<{ payload: AgentSessionMutationResult }>(`${API_URL}/agents/${agentId}/sessions/${sessionId}`, data);
  return response.payload;
}

export async function deleteAgentSession(
  agentId: string,
  sessionId: string
): Promise<AgentSessionMutationResult> {
  const response = await api.delete<{ payload: AgentSessionMutationResult }>(`${API_URL}/agents/${agentId}/sessions/${sessionId}`);
  return response.payload;
}

/**
 * Create a new agent
 */
export async function createAgent(agentData: CreateAgentData): Promise<Agent> {
  const response = await api.post<{ payload: Agent }>(`${API_URL}/agents`, agentData);
  return response.payload;
}

/**
 * Update an existing agent
 */
export async function updateAgent(agentId: string, agentData: Partial<CreateAgentData>): Promise<Agent> {
  const response = await api.put<{ payload: Agent }>(`${API_URL}/agents/${agentId}`, agentData);
  return response.payload;
}

/**
 * Delete an agent
 */
export async function deleteAgent(agentId: string): Promise<void> {
  await api.delete(`${API_URL}/agents/${agentId}`);
}

/**
 * Start an agent
 */
export async function startAgent(agentId: string): Promise<Agent> {
  const response = await api.post<{ payload: Agent }>(`${API_URL}/agents/${agentId}/start`);
  return response.payload;
}

/**
 * Stop an agent
 */
export async function stopAgent(agentId: string): Promise<Agent> {
  const response = await api.post<{ payload: Agent }>(`${API_URL}/agents/${agentId}/stop`);
  return response.payload;
}

/**
 * Get agent status
 */
export async function getAgentStatus(agentId: string): Promise<{ status: string; isActive: boolean; lastAccessed?: string }> {
  const response = await api.get<{ payload: { status: string; isActive: boolean; lastAccessed?: string } }>(`${API_URL}/agents/${agentId}/status`);
  return response.payload;
}

// Agent Memory Functions
// ======================

/**
 * Get agent memory
 */
export async function getAgentMemory(agentId: string): Promise<AgentMemory[]> {
  try {
    const response = await api.get<{ payload: AgentMemory[] }>(`${API_URL}/agents/${agentId}/memory`);
    return response.payload || [];
  } catch (error) {
    console.error('Failed to get agent memory:', error);
    return [];
  }
}

/**
 * Clear agent memory
 */
export async function clearAgentMemory(agentId: string): Promise<void> {
  await api.delete(`${API_URL}/agents/${agentId}/memory`);
}

// MCP Tool Functions
// ==================

/**
 * Get MCP tools for an agent
 */
export async function getAgentMCPTools(agentId: string): Promise<MCPTool[]> {
  try {
    const response = await api.get<{ payload: MCPTool[] }>(`${API_URL}/agents/${agentId}/mcp/tools`);
    return response.payload || [];
  } catch (error) {
    console.error('Failed to get MCP tools:', error);
    return [];
  }
}

/**
 * Call an MCP tool
 */
export async function callMCPTool(
  agentId: string,
  toolName: string,
  arguments_: Record<string, any>,
  source?: string
): Promise<any> {
  const response = await api.post<{ payload: any }>(`${API_URL}/agents/${agentId}/mcp/tools/${toolName}`, {
    arguments: arguments_,
    source
  });
  return response.payload;
}

// Chat Functions for Streaming
// =============================

/**
 * Chat with agent using streaming
 */
export async function chatWithAgentStream(
  agentId: string,
  message: string,
  options: {
    onStart?: () => void;
    onMessage?: (content: any, isComplete: any, metadata: any) => void;
    onError?: (error: any) => void;
    onComplete?: () => void;
    context?: ChatMessage[];
    mcpContext?: boolean;
    maxTokens?: number;
    temperature?: number;
    images?: AgentImageContent[];
  } = {}
): Promise<void> {
  const { onStart, onMessage, onError, onComplete, context, mcpContext, maxTokens, temperature, images } = options;
  let buffer = '';

  await api.stream(`${API_URL}/agents/${agentId}/prompt/stream`, {
    message,
    images,
    context,
    mcpContext,
    maxTokens,
    temperature,
  }, {
    onOpen: () => {
      onStart?.();
    },
    onChunk: (chunk: string) => {
      buffer += chunk;
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const eventChunk of events) {
        const lines = eventChunk.split('\n').map((line) => line.trim()).filter(Boolean);
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const data = JSON.parse(payload);
            if (!onMessage) continue;
            if (data.type === 'chunk') {
              onMessage(data.delta || '', false, data.metadata || {});
            } else if (data.type === 'thinking') {
              onMessage('', false, { ...(data.metadata || {}), reasoningDelta: data.delta || '' });
            } else if (data.type === 'complete') {
              const finalMessage = Array.isArray(data.messages)
                ? [...data.messages].reverse().find((msg: any) => msg?.role === 'assistant')
                : null;
              // Pass empty string for content — the streaming buffer already has the full accumulated text.
              // Re-appending the final text here would double the message.
              onMessage('', true, {
                ...(data.metadata || {}),
                ...(extractAgentMessageMetadata(finalMessage) || {}),
              });
            } else if (data.type === 'error' && onError) {
              onError(new Error(data.error || 'Prompt stream failed'));
            }
          } catch {
            // ignore malformed partial event payloads
          }
        }
      }
    },
    onError,
    onComplete
  });
}

/**
 * Chat with agent using fallback method
 */
export async function chatWithAgentFallback(
  agentId: string,
  options: {
    message: string;
    onMessage?: (content: any, isComplete: any, metadata: any) => void;
    onError?: (error: any) => void;
    onComplete?: () => void;
    context?: ChatMessage[];
    mcpContext?: boolean;
    maxTokens?: number;
    temperature?: number;
    images?: AgentImageContent[];
  }
): Promise<{ content: string; metadata?: any }> {
  const { message, onMessage, onError, onComplete, context, mcpContext, maxTokens, temperature, images } = options;

  try {
    const response = await api.post<{
      payload: {
        messages: any[];
      }
    }>(`${API_URL}/agents/${agentId}/prompt`, {
      message,
      images,
      context,
      mcpContext,
      maxTokens,
      temperature,
    });

    const finalMessage = Array.isArray(response.payload.messages)
      ? [...response.payload.messages].reverse().find((msg: any) => msg?.role === 'assistant')
      : null;
    const result = {
      content: extractAgentMessageText(finalMessage),
      metadata: extractAgentMessageMetadata(finalMessage),
    };

    if (onMessage) {
      onMessage(result.content, true, result.metadata);
    }
    if (onComplete) {
      onComplete();
    }

    return result;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
}

/**
 * Convert chat messages to streaming format
 */
export function convertToStreamingMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(msg => ({
    ...msg,
    timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date().toISOString()
  }));
}

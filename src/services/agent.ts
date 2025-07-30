import { api } from '@/lib/api';
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
        config.endpoint || `/api/agents/${config.id}`
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
      await api.stream(`/api/agents/${agentId}/chat`, {
        message,
        messageId,
        stream: true,
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
      const response = await api.get<{agents: AgentConfig[]}>('/api/agents');
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
    const response = await api.post<AgentConfig>('/api/agents', config);
    
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

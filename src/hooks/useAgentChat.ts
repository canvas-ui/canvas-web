import { useState, useCallback, useRef, useEffect } from 'react';
import {
  useAgentSocket,
  StreamingChatMessage,
  StreamingChatRequest,
  StreamingChatChunk,
  StreamingChatError
} from './useAgentSocket';
import {
  chatWithAgentStream,
  chatWithAgentFallback,
  convertToStreamingMessages,
  ChatMessage,
  AgentImageContent,
  AgentStreamMetadata,
  RawAgentMessage,
  extractAgentMessageMetadata,
  getAgentSession,
} from '@/services/agent';

export interface UseAgentChatOptions {
  agentId: string;
  initialMessages?: ChatMessage[];
  historyKey?: string;
  loadHistory?: boolean;
  onError?: (error: Error) => void;
  enableWebSocket?: boolean;
  enableSSE?: boolean;
  enableFallback?: boolean;
  llmProvider?: 'anthropic' | 'openai' | 'ollama' | 'lm-studio' | 'vllm' | 'custom'; // Add provider info
}

export interface ChatState {
  messages: StreamingChatMessage[];
  isStreaming: boolean;
  currentStreamingMessage: StreamingChatMessage | null;
  connectionStatus: 'websocket' | 'sse' | 'rest' | 'disconnected';
  error: string | null;
}

function extractMessageText(message: RawAgentMessage | null | undefined): string {
  if (!message) return '';
  if (typeof message.errorMessage === 'string' && message.errorMessage.trim()) {
    return message.errorMessage.trim();
  }
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const text = content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n');
  return text || '';
}

function appendReasoning(currentReasoning: string | undefined, delta: string | undefined): string | undefined {
  const nextReasoning = `${currentReasoning || ''}${delta || ''}`.trim();
  return nextReasoning || undefined;
}

function sanitizeStreamingMetadata(metadata: AgentStreamMetadata | undefined, reasoning: string | undefined) {
  if (!metadata && !reasoning) return undefined;
  const { reasoningDelta: _reasoningDelta, ...rest } = metadata || {};
  return {
    ...rest,
    ...(reasoning ? { reasoning } : {}),
  };
}

export function useAgentChat(options: UseAgentChatOptions) {
  const {
    agentId,
    initialMessages = [],
    historyKey,
    loadHistory = true,
    onError,
    enableWebSocket = true,
    enableSSE = true,
    enableFallback = true,
    llmProvider
  } = options;

  // Chat state
  const [messages, setMessages] = useState<StreamingChatMessage[]>(
    convertToStreamingMessages(initialMessages)
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<StreamingChatMessage | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ChatState['connectionStatus']>('disconnected');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!agentId || !loadHistory) {
      setMessages(convertToStreamingMessages(initialMessages));
      return;
    }

    getAgentSession(agentId)
      .then((session) => {
        if (cancelled) return;
        setMessages(convertToStreamingMessages(session.messages));
      })
      .catch(() => {
        if (!cancelled) {
          setMessages(convertToStreamingMessages(initialMessages));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, loadHistory, historyKey]);

  // Refs for managing state
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMessageRef = useRef<string | null>(null);

  // WebSocket functionality
  const { isConnected, startStreamingChat } = useAgentSocket({
    agentId: enableWebSocket ? agentId : undefined,
    onMessage: handleWebSocketMessage,
    onComplete: handleWebSocketComplete,
    onError: handleWebSocketError
  });

  // Update connection status based on WebSocket state
  useEffect(() => {
    if (enableWebSocket && isConnected) {
      setConnectionStatus('websocket');
    } else if (connectionStatus === 'websocket') {
      setConnectionStatus('disconnected');
    }
  }, [isConnected, enableWebSocket]);

  function handleWebSocketMessage(chunk: StreamingChatChunk) {
    if (chunk.messageId !== currentMessageRef.current) {
      return; // Ignore messages from old sessions
    }

    console.log('Processing WebSocket chunk:', {
      type: chunk.type,
      content: chunk.content,
      delta: chunk.delta
    });

    // Handle different chunk types from backend
    if (chunk.type === 'content' || chunk.type === 'chunk') {
      setCurrentStreamingMessage(prev => {
        const updatedMessage = prev ? {
          ...prev,
          content: prev.content + (chunk.delta || chunk.content || ''),
          isComplete: false,
          metadata: prev.metadata
        } : {
          role: 'assistant' as const,
          content: chunk.delta || chunk.content || '',
          timestamp: new Date().toISOString(),
          isComplete: false
        };

        return updatedMessage;
      });
    } else if (chunk.type === 'thinking') {
      setCurrentStreamingMessage(prev => {
        const reasoning = appendReasoning(prev?.metadata?.reasoning, chunk.delta);
        return prev ? {
          ...prev,
          metadata: {
            ...(prev.metadata || {}),
            ...(reasoning ? { reasoning } : {})
          }
        } : {
          role: 'assistant' as const,
          content: '',
          timestamp: new Date().toISOString(),
          isComplete: false,
          metadata: reasoning ? { reasoning } : undefined
        };
      });
    } else if (chunk.type === 'complete' || chunk.type === 'done') {
      // Mark current streaming message as complete
      setCurrentStreamingMessage(prev => {
        if (prev) {
          const completedMessage = { ...prev, isComplete: true };
          setMessages(prevMessages => [...prevMessages, completedMessage]);
          setIsStreaming(false);
          currentMessageRef.current = null;
          return null;
        }
        return null;
      });
    }
  }

  function handleWebSocketComplete(_agentId: string, messageId: string, messages?: RawAgentMessage[]) {
    if (messageId === currentMessageRef.current) {
      const finalMessage = Array.isArray(messages)
        ? [...messages].reverse().find((message) => message?.role === 'assistant')
        : null;
      const finalContent = extractMessageText(finalMessage);
      const finalMetadata = extractAgentMessageMetadata(finalMessage);

      // Move streaming message to completed messages
      setCurrentStreamingMessage(prev => {
        if (prev) {
          const completedMessage = {
            ...prev,
            content: finalContent || prev.content,
            isComplete: true,
            metadata: {
              ...(prev.metadata || {}),
              ...(finalMetadata || {})
            }
          };
          setMessages(prevMessages => [...prevMessages, completedMessage]);
        } else if (finalContent) {
          setMessages(prevMessages => [...prevMessages, {
            role: 'assistant',
            content: finalContent,
            timestamp: new Date().toISOString(),
            isComplete: true,
            metadata: finalMetadata
          }]);
        }
        return null;
      });
      setIsStreaming(false);
      currentMessageRef.current = null;
    }
  }

  function handleWebSocketError(error: StreamingChatError) {
    if (error.messageId === currentMessageRef.current) {
      console.error('WebSocket streaming error:', error);
      setError(error.error);
      setIsStreaming(false);
      currentMessageRef.current = null;

      if (onError) {
        onError(new Error(error.error));
      }
    }
  }

  const sendMessage = useCallback(async (
    message: string,
    options: {
      images?: AgentImageContent[];
      mcpContext?: boolean;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ) => {
    if (isStreaming) {
      throw new Error('Cannot send message while streaming');
    }

    // Clear any previous errors
    setError(null);

    // Add user message to chat
    const userMessage: StreamingChatMessage = {
      role: 'user',
      content: message || (options.images?.length ? `[${options.images.length} image${options.images.length === 1 ? '' : 's'} attached]` : ''),
      timestamp: new Date().toISOString(),
      isComplete: true
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    const request: StreamingChatRequest = {
      message,
      images: options.images,
      context: messages.slice(-10), // Last 10 messages for context
      mcpContext: options.mcpContext ?? true,
      maxTokens: options.maxTokens,
      temperature: options.temperature
    };

    // Smart streaming method selection based on provider
    const hasImages = Array.isArray(options.images) && options.images.length > 0;
    const shouldUseWebSocket = enableWebSocket && isConnected && llmProvider !== 'ollama' && !hasImages;
    const shouldUseSSE = enableSSE;

    // Log streaming strategy
    if (llmProvider === 'ollama') {
      console.log('🦙 Ollama detected: Using SSE streaming (WebSocket not supported by Ollama)');
    }

    // Try WebSocket first (except for Ollama)
    if (shouldUseWebSocket) {
      try {
        console.log(`🔌 Attempting WebSocket streaming for ${llmProvider || 'unknown'} provider...`);
        const messageId = startStreamingChat(agentId, request);
        currentMessageRef.current = messageId;
        setConnectionStatus('websocket');
        return;
      } catch (error) {
        console.warn(`WebSocket streaming failed for ${llmProvider || 'unknown'}, falling back to SSE:`, error);
      }
    }

    // Try SSE (primary method for Ollama, fallback for others)
    if (shouldUseSSE) {
      let sseAccepted = false;
      try {
        console.log(`📡 ${llmProvider === 'ollama' ? 'Using' : 'Attempting'} SSE streaming for ${llmProvider || 'unknown'} provider...`);
        setConnectionStatus('sse');

        abortControllerRef.current = new AbortController();
        let streamingMessage = '';

        await chatWithAgentStream(
          agentId,
          request.message,
          {
            onStart: () => {
              sseAccepted = true;
            },
            onMessage: (content: string, isComplete: boolean, metadata: AgentStreamMetadata) => {
              streamingMessage += content;
              const reasoningDelta = typeof metadata?.reasoningDelta === 'string' ? metadata.reasoningDelta : '';

              setCurrentStreamingMessage(prev => {
                const reasoning = metadata?.reasoning || appendReasoning(prev?.metadata?.reasoning, reasoningDelta);
                return {
                  role: 'assistant',
                  content: streamingMessage,
                  timestamp: prev?.timestamp || new Date().toISOString(),
                  isComplete,
                  metadata: sanitizeStreamingMetadata({
                    ...(prev?.metadata || {}),
                    ...metadata,
                  }, reasoning)
                };
              });

              if (isComplete) {
                const reasoning = metadata?.reasoning;
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: streamingMessage,
                  timestamp: new Date().toISOString(),
                  isComplete: true,
                  metadata: sanitizeStreamingMetadata(metadata, reasoning)
                }]);
                setCurrentStreamingMessage(null);
                setIsStreaming(false);
              }
            },
            onError: (error: Error) => {
              console.error('SSE streaming error:', error);
              setError(error.message);
              setIsStreaming(false);
              if (onError) onError(error);
            },
            context: messages.slice(-10).map(msg => ({
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp,
              metadata: msg.metadata
            })),
            images: options.images,
            mcpContext: options.mcpContext ?? true,
            maxTokens: options.maxTokens,
            temperature: options.temperature
          }
        );
        return;
      } catch (error) {
        if (sseAccepted) {
          console.warn(`SSE stream failed after server accepted prompt for ${llmProvider || 'unknown'}; refusing REST fallback to avoid duplicate prompt.`);
          return;
        }
        console.warn(`SSE streaming failed for ${llmProvider || 'unknown'}, falling back to REST:`, error);
      }
    }

    // Final fallback to regular REST API
    if (enableFallback) {
      try {
        console.log(`⚙️ Using REST API fallback for ${llmProvider || 'unknown'} provider...`);
        setConnectionStatus('rest');

        const response = await chatWithAgentFallback(agentId, {
          message,
          images: options.images,
          context: messages.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            metadata: msg.metadata
          })),
          mcpContext: options.mcpContext ?? true,
          maxTokens: options.maxTokens,
          temperature: options.temperature
        });

        const assistantMessage: StreamingChatMessage = {
          role: 'assistant',
          content: response.content,
          timestamp: new Date().toISOString(),
          isComplete: true,
          metadata: response.metadata
        };

        setMessages(prev => [...prev, assistantMessage]);
        setIsStreaming(false);
      } catch (error) {
        console.error('All chat methods failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
        setError(errorMessage);
        setIsStreaming(false);

        if (onError) {
          onError(error instanceof Error ? error : new Error(errorMessage));
        }
      }
    } else {
      setError('All streaming methods failed and fallback is disabled');
      setIsStreaming(false);
    }
  }, [
    agentId,
    messages,
    isStreaming,
    isConnected,
    startStreamingChat,
    enableWebSocket,
    enableSSE,
    enableFallback,
    llmProvider, // Add llmProvider to dependencies
    onError
  ]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentStreamingMessage(null);
    setError(null);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    currentMessageRef.current = null;
    setIsStreaming(false);
    setCurrentStreamingMessage(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
    messages,
    isStreaming,
    currentStreamingMessage,
    connectionStatus,
    error,

    // Actions
    sendMessage,
    clearMessages,
    stopStreaming,

    // Computed state
    allMessages: currentStreamingMessage
      ? [...messages, currentStreamingMessage]
      : messages,

    // Status helpers
    isWebSocketConnected: connectionStatus === 'websocket',
    isUsingSSE: connectionStatus === 'sse',
    isUsingREST: connectionStatus === 'rest'
  };
}

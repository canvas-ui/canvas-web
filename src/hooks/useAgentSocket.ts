import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_ROUTES } from '@/config/api';
import type { AgentImageContent, AgentResponseMetadata, RawAgentMessage } from '@/services/agent';

export interface StreamingChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isComplete?: boolean;
  metadata?: AgentResponseMetadata;
}

// Updated to match backend format
export interface StreamingChatChunk {
  agentId: string;
  messageId: string;  // Backend uses messageId, not sessionId
  type: string;       // Backend uses type field
  content: string;
  delta: string;      // Backend includes delta field
  messages?: RawAgentMessage[];
}

export interface StreamingChatRequest {
  message: string;
  images?: AgentImageContent[];
  context?: StreamingChatMessage[];
  mcpContext?: boolean;
  maxTokens?: number;
  temperature?: number;
  messageId?: string; // Add messageId for session tracking
}

export interface StreamingChatError {
  agentId: string;
  messageId?: string; // Updated to match backend
  error: string;
  details?: unknown;
}

export interface UseAgentSocketOptions {
  agentId?: string;
  onMessage?: (chunk: StreamingChatChunk) => void;
  onComplete?: (agentId: string, messageId: string, messages?: RawAgentMessage[]) => void;
  onError?: (error: StreamingChatError) => void;
}

export function useAgentSocket(options: UseAgentSocketOptions = {}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const optionsRef = useRef(options);
  const socketRef = useRef<Socket | null>(null);
  const isConnectingRef = useRef(false);

  // Update options ref when they change
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const connect = useCallback(() => {
    if (!optionsRef.current.agentId) return;
    if (socketRef.current || isConnectingRef.current) return;

    const token = localStorage.getItem('authToken');
    if (!token) {
      console.warn('No auth token available for WebSocket connection');
      return;
    }

    // Log token type for debugging
    console.log(`[WebSocket] Using token type: ${token.startsWith('canvas-') ? 'API' : 'JWT'}, length: ${token.length}`);

    isConnectingRef.current = true;
    setIsConnecting(true);

    const socketInstance = io(API_ROUTES.ws, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000, // Add timeout
      forceNew: true   // Force new connection to avoid token caching issues
    });

    // Connection events
    socketInstance.on('connect', () => {
      console.log('Agent WebSocket connected successfully');
      setIsConnected(true);
      isConnectingRef.current = false;
      setIsConnecting(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Agent WebSocket connection error:', error);
      setIsConnected(false);
      isConnectingRef.current = false;
      setIsConnecting(false);

      // If auth error, try to refresh token or fallback to SSE
      if (error.message?.includes('Auth error') || error.message?.includes('token')) {
        console.warn('WebSocket auth failed, will fallback to SSE for streaming');
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Agent WebSocket disconnected:', reason);
      setIsConnected(false);
      isConnectingRef.current = false;
      setIsConnecting(false);
    });

    // Agent-specific events - updated to match backend format
    socketInstance.on('agent:chat:chunk', (chunk: StreamingChatChunk) => {
      console.log('Received chat chunk:', chunk);
      if (optionsRef.current.onMessage) {
        optionsRef.current.onMessage(chunk);
      }
    });

    // Backend sends different completion event
    socketInstance.on('agent:chat:complete', (data: { agentId: string; messageId: string; messages?: RawAgentMessage[] }) => {
      console.log('Chat stream complete:', data);
      if (optionsRef.current.onComplete) {
        optionsRef.current.onComplete(data.agentId, data.messageId, data.messages);
      }
    });

    socketInstance.on('agent:chat:error', (error: StreamingChatError) => {
      console.error('Chat stream error:', error);
      if (optionsRef.current.onError) {
        optionsRef.current.onError(error);
      }
    });

    // Additional events from backend
    socketInstance.on('agent:chat:start', (data: { agentId: string; messageId: string }) => {
      console.log('Chat stream started:', data);
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);
  }, []);

  const disconnect = useCallback(() => {
    const activeSocket = socketRef.current;
    if (activeSocket) {
      activeSocket.removeAllListeners();
      activeSocket.close();
    }
    socketRef.current = null;
    isConnectingRef.current = false;
    setSocket(null);
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // Backend uses agent:subscribe instead of agent:join
  const joinAgentChannel = useCallback((agentId: string) => {
    if (socket && isConnected) {
      console.log(`Subscribing to agent channel: ${agentId}`);
      socket.emit('agent:subscribe', { agentId });
    }
  }, [socket, isConnected]);

  const leaveAgentChannel = useCallback((agentId: string) => {
    if (socket && isConnected) {
      console.log(`Unsubscribing from agent channel: ${agentId}`);
      socket.emit('agent:unsubscribe', { agentId });
    }
  }, [socket, isConnected]);

  const startStreamingChat = useCallback((agentId: string, request: StreamingChatRequest): string => {
    if (!socket || !isConnected) {
      throw new Error('WebSocket not connected');
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`Starting streaming chat for agent ${agentId}, message ${messageId}`);
    socket.emit('agent:chat:stream', {
      agentId,
      messageId,
      ...request
    });

    return messageId;
  }, [socket, isConnected]);

  // Auto-connect effect. No disconnect needed in the no-agent branch: the
  // previous run's cleanup already disconnected, and connect() is a no-op
  // without an agentId, so no socket can exist here.
  useEffect(() => {
    if (!options.agentId) return;

    connect();

    return () => {
      disconnect();
    };
  }, [options.agentId, connect, disconnect]);

  // Join/leave agent channel when agentId changes
  useEffect(() => {
    if (isConnected && options.agentId) {
      joinAgentChannel(options.agentId);

      return () => {
        if (options.agentId) {
          leaveAgentChannel(options.agentId);
        }
      };
    }
  }, [isConnected, options.agentId, joinAgentChannel, leaveAgentChannel]);

  return {
    socket,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    joinAgentChannel,
    leaveAgentChannel,
    startStreamingChat
  };
}

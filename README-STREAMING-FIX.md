# Anthropic Agent Streaming Fix

## Problem

The original error occurred when creating an Anthropic agent in the WebUI:

```
Chat stream error: {agentId: 'anthropic', messageId: 'msg_1753878942697_8qrjacw9n', error: 'Chat stream failed: AnthropicConnector chatStream failed: response.body.getReader is not a function'}
```

This error indicates that the `response.body.getReader()` function was not available, which commonly happens when:

1. The browser doesn't support ReadableStream APIs
2. The response doesn't have a readable body
3. The fetch response was not properly configured for streaming
4. The environment doesn't support streaming responses

## Solution

We've implemented a robust streaming system with multiple fallback mechanisms:

### 1. Enhanced API Library (`src/lib/api.ts`)

Added a `stream()` method to the existing API library that:
- Checks if `response.body` exists before attempting to use it
- Validates that `getReader()` is available before calling it
- Falls back to reading the entire response as text if streaming isn't supported
- Provides proper error handling and cleanup

### 2. Streaming Service (`src/services/streaming.ts`)

Created a comprehensive streaming service with:
- **StreamingService**: Core streaming functionality with robust error handling
- **AnthropicConnector**: Anthropic-specific connector with the exact same interface as the original
- **WebSocketStreamingService**: WebSocket-based fallback for environments where fetch streaming fails

### 3. Agent Service (`src/services/agent.ts`)

High-level service that:
- Manages multiple agent connectors
- Automatically falls back to WebSocket when fetch streaming fails
- Provides a unified interface for all agent types
- Handles message queueing and error recovery

### 4. React Hooks (`src/hooks/useAgent.ts`)

Easy-to-use React hooks:
- `useAgent()`: Manages communication with a specific agent
- `useAgents()`: Manages the list of available agents
- Automatic error handling and retry functionality
- Built-in message state management

### 5. Example Component (`src/components/chat/agent-chat.tsx`)

Complete chat interface demonstrating:
- How to use the new agent system
- Error handling and user feedback
- Retry mechanisms
- Streaming indicators

## Usage

### Basic Usage

```typescript
import { agentService } from '@/services/agent';

// Register an Anthropic agent
agentService.registerAgent({
  id: 'anthropic',
  name: 'Anthropic Claude',
  type: 'anthropic',
  streamingSupported: true,
  apiKey: 'your-api-key', // Optional
  endpoint: '/api/agents/anthropic' // Optional
});

// Send a message
await agentService.sendMessage('anthropic', 'Hello!', {
  onMessage: (message) => {
    console.log('Received:', message.content);
  },
  onError: (error) => {
    console.error('Error:', error.message);
  },
  onComplete: () => {
    console.log('Streaming complete');
  }
});
```

### Using React Hooks

```tsx
import { useAgent } from '@/hooks/useAgent';

function ChatComponent() {
  const { messages, sendMessage, isLoading, error } = useAgent({
    agentId: 'anthropic'
  });

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.content}</div>
      ))}
      
      {error && (
        <div className="error">
          Error: {error}
          <button onClick={() => retryLastMessage()}>Retry</button>
        </div>
      )}
      
      <button 
        onClick={() => sendMessage('Hello!')}
        disabled={isLoading}
      >
        Send Message
      </button>
    </div>
  );
}
```

### Using the Complete Chat Component

```tsx
import { AgentChat } from '@/components/chat/agent-chat';

function App() {
  return (
    <div className="h-screen">
      <AgentChat agentId="anthropic" />
    </div>
  );
}
```

## Error Handling & Fallbacks

The system provides multiple layers of error handling:

1. **Primary**: Fetch-based streaming with ReadableStream
2. **Fallback 1**: Fetch-based but reading entire response as text
3. **Fallback 2**: WebSocket-based streaming
4. **Fallback 3**: Regular HTTP requests without streaming

The system automatically tries each fallback when the previous method fails.

## Key Features

### Robust Error Detection
- Detects when `response.body` is null
- Checks if `getReader()` function exists
- Handles network errors and timeouts
- Provides meaningful error messages

### Automatic Fallbacks
- Falls back to text response when streaming fails
- Can switch to WebSocket communication
- Maintains the same interface across all methods

### Stream Processing
- Supports Server-Sent Events (SSE) format
- Handles chunked responses
- Provides real-time message updates
- Manages partial message assembly

### State Management
- Tracks message history
- Manages loading states
- Handles streaming indicators
- Provides retry capabilities

## Configuration

### Environment Variables

You can configure the streaming behavior:

```env
# Enable/disable WebSocket fallback
VITE_WEBSOCKET_FALLBACK=true

# Set custom API endpoints
VITE_API_URL=http://localhost:3000/api

# Set WebSocket URL
VITE_WEBSOCKET_URL=ws://localhost:3000/ws
```

### Agent Configuration

```typescript
const agentConfig: AgentConfig = {
  id: 'anthropic',
  name: 'Anthropic Claude',
  type: 'anthropic',
  streamingSupported: true,
  apiKey: process.env.ANTHROPIC_API_KEY,
  endpoint: '/api/agents/anthropic'
};
```

## Browser Compatibility

The solution works across all modern browsers:

- **Chrome/Edge**: Full streaming support
- **Firefox**: Full streaming support  
- **Safari**: Fallback to text response (automatic)
- **Older browsers**: WebSocket fallback (automatic)

## Troubleshooting

### Common Issues

1. **"getReader is not a function"**: 
   - The system will automatically fall back to text response
   - Check browser compatibility

2. **WebSocket connection failed**:
   - Verify WebSocket endpoint is available
   - Check network/firewall settings

3. **Streaming appears slow**:
   - May be using text fallback instead of streaming
   - Check browser dev tools for streaming support

### Debug Information

Enable debug logging:

```typescript
localStorage.setItem('debug', 'agent:*');
```

This will log detailed information about:
- Which streaming method is being used
- Fallback decisions
- Error details
- Message processing

## Testing

To test the streaming functionality:

1. **Normal streaming**: Use a modern browser with fetch streaming support
2. **Text fallback**: Disable ReadableStream in browser dev tools
3. **WebSocket fallback**: Block fetch requests to trigger WebSocket usage

The system should seamlessly handle all scenarios without user intervention.

## Integration

To integrate this fix into an existing application:

1. Copy the new services and hooks
2. Update your existing agent communication code to use `agentService`
3. Replace direct AnthropicConnector usage with the new service
4. Add error handling UI components

The new system is designed to be backward-compatible while providing enhanced reliability and error handling.
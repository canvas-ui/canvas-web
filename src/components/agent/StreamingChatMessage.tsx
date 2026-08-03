import { useEffect, useState } from 'react';
import { StreamingChatMessage } from '@/hooks/useAgentSocket';
import { Wifi, WifiOff, Radio, Cpu } from 'lucide-react';
import AgentAssistantExtras from './AgentAssistantExtras';

interface StreamingChatMessageProps {
  message: StreamingChatMessage;
  isStreaming?: boolean;
  connectionStatus?: 'websocket' | 'sse' | 'rest' | 'disconnected';
}

export function StreamingChatMessageComponent({
  message,
  isStreaming = false,
  connectionStatus = 'disconnected'
}: StreamingChatMessageProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [showCursor, setShowCursor] = useState(false);

  // Simulate typing effect for streaming messages
  useEffect(() => {
    if (isStreaming && !message.isComplete) {
      const content = message.content;
      let index = 0;

      const typewriter = setInterval(() => {
        if (index < content.length) {
          setDisplayedContent(content.substring(0, index + 1));
          index++;
        } else {
          clearInterval(typewriter);
        }
      }, 20); // Adjust typing speed

      return () => clearInterval(typewriter);
    } else {
      setDisplayedContent(message.content);
    }
  }, [message.content, isStreaming, message.isComplete]);

  // Cursor blinking effect
  useEffect(() => {
    if (isStreaming && !message.isComplete) {
      setShowCursor(true);
      const blinkInterval = setInterval(() => {
        setShowCursor(prev => !prev);
      }, 500);

      return () => clearInterval(blinkInterval);
    } else {
      setShowCursor(false);
    }
  }, [isStreaming, message.isComplete]);

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'websocket':
        return <span title="WebSocket"><Wifi className="h-3 w-3 text-success" /></span>;
      case 'sse':
        return <span title="Server-Sent Events"><Radio className="h-3 w-3 text-info" /></span>;
      case 'rest':
        return <span title="REST API"><Cpu className="h-3 w-3 text-warning" /></span>;
      default:
        return <span title="Disconnected"><WifiOff className="h-3 w-3 text-destructive" /></span>;
    }
  };

  return (
    <div
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[70%] p-3 rounded-lg ${
          message.role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        } ${isStreaming && !message.isComplete ? 'border-2 border-info' : ''}`}
      >
        <AgentAssistantExtras
          reasoning={message.role === 'assistant' ? message.metadata?.reasoning?.trim() : undefined}
          metadata={message.role === 'assistant' ? message.metadata : undefined}
          isStreaming={isStreaming && !message.isComplete}
        />
        <div className="whitespace-pre-wrap text-sm">
          {displayedContent}
          {isStreaming && !message.isComplete && (
            <span className={`inline-block w-2 ${showCursor ? 'bg-current' : 'bg-transparent'}`}>
              |
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-xs mt-2 opacity-70">
          <div className="flex items-center gap-2">
            <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
            {isStreaming && !message.isComplete && (
              <span className="text-info">• streaming...</span>
            )}
          </div>
          {message.role === 'assistant' && getConnectionIcon()}
        </div>
      </div>
    </div>
  );
}

export default StreamingChatMessageComponent;

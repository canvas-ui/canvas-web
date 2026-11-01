import { useEffect, useState } from 'react';
import { StreamingChatMessage } from '@/hooks/useAgentSocket';
import { Wifi, WifiOff, Radio, Cpu } from 'lucide-react';
import AgentAssistantExtras from './AgentAssistantExtras';
import { MarkdownView } from '@/components/common/markdown-view';

interface StreamingChatMessageProps {
  message: StreamingChatMessage;
  isStreaming?: boolean;
  connectionStatus?: 'websocket' | 'sse' | 'rest' | 'disconnected';
}

function StreamingChatMessageComponent({
  message,
  isStreaming = false,
  connectionStatus = 'disconnected'
}: StreamingChatMessageProps) {
  // Starts visible; the blink interval below toggles it while streaming. The
  // cursor span is only rendered while streaming, so no reset is needed after.
  const [showCursor, setShowCursor] = useState(true);

  // Cursor blinking effect
  useEffect(() => {
    if (!isStreaming || message.isComplete) return;

    const blinkInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);

    return () => {
      clearInterval(blinkInterval);
      setShowCursor(true);
    };
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
        <div className="text-sm">
          {message.role === 'assistant'
            ? <MarkdownView content={message.content} />
            : <span className="whitespace-pre-wrap break-words">{message.content}</span>}
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

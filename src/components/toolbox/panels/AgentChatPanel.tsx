import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Send, Square, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAgent, type Agent } from '@/services/agent'
import { useAgentPromptStream } from '@/hooks/useAgentPromptStream'
import AgentAssistantExtras from '@/components/agent/AgentAssistantExtras'

interface AgentChatPanelProps {
  agentId: string
  onClose: () => void
}

export function AgentChatPanel({ agentId, onClose }: AgentChatPanelProps) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { messages, isStreaming, error, send, stop, clear } = useAgentPromptStream(agentId)

  useEffect(() => {
    getAgent(agentId).then(setAgent).catch(() => {})
  }, [agentId])

  useEffect(() => {
    if (messages.length === 0) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    textareaRef.current?.focus()
    await send(msg)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Back to agents"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {agent?.color && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: agent.color }}
          />
        )}
        <span className="text-sm font-medium flex-1 truncate">
          {agent?.label || agent?.name || agentId}
        </span>
        <button
          type="button"
          onClick={clear}
          className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Clear chat"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-10">
            {agent ? `Chat with ${agent.label || agent.name}` : 'Loading…'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'text-sm rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap break-words',
              msg.role === 'user'
                ? 'ml-auto bg-foreground text-background'
                : 'mr-auto bg-muted text-foreground',
            )}
          >
            <AgentAssistantExtras
              reasoning={msg.role === 'assistant' ? msg.reasoning : undefined}
              metadata={msg.role === 'assistant' ? msg.metadata : undefined}
              isStreaming={!msg.isComplete}
              compact
            />
            {msg.content || (!msg.isComplete && msg.role === 'assistant' ? '…' : '')}
          </div>
        ))}
        {error && (
          <div className="text-xs text-destructive text-center py-1">{error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Message…"
            rows={2}
            className="flex-1 resize-y text-sm px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-1 focus:ring-ring min-h-[38px] max-h-[120px]"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="flex items-center justify-center w-9 h-9 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity shrink-0"
              title="Stop"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex items-center justify-center w-9 h-9 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

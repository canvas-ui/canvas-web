import { useEffect, useRef, useState } from 'react'
import { Send, Square, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { M2Header } from '@/components/menu/shared/M2Header'
import { useMenu } from '@/components/shell/menu-context'
import { useAgentPromptStream } from '@/hooks/useAgentPromptStream'
import { getAgent, type Agent } from '@/services/agent'

export function AgentM2Chat() {
  const { state, closeM2 } = useMenu()
  const agentId = state.selectedEntityId || ''
  const [agent, setAgent] = useState<Agent | null>(null)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!agentId) return
    getAgent(agentId).then(setAgent).catch(() => {})
  }, [agentId])

  const { messages, isStreaming, error, send, stop, clear } = useAgentPromptStream(agentId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    await send(msg)
  }

  return (
    <div className="flex flex-col h-full">
      <M2Header
        title={agent?.label || agent?.name || agentId}
        onBack={closeM2}
        action={
          <button
            type="button"
            onClick={clear}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        }
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6">
            {agent ? `Chat with ${agent.label || agent.name}` : 'Loading agent…'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'text-xs rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-wrap break-words',
              msg.role === 'user'
                ? 'ml-auto bg-foreground text-background'
                : 'mr-auto bg-muted text-foreground',
              !msg.isComplete && msg.role === 'assistant' && 'opacity-80',
            )}
          >
            {msg.content || (!msg.isComplete && msg.role === 'assistant' ? '…' : '')}
          </div>
        ))}
        {error && (
          <div className="text-xs text-destructive text-center py-1">{error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-sidebar-border shrink-0">
        <div className="flex gap-1.5">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Message…"
            rows={1}
            className="flex-1 resize-none text-xs px-2 py-1.5 border border-input bg-background rounded-md focus:outline-none focus:ring-1 focus:ring-ring min-h-[30px] max-h-[80px]"
            style={{ height: Math.min(80, Math.max(30, (input.match(/\n/g)?.length ?? 0) * 18 + 30)) + 'px' }}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity shrink-0"
              title="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || !agent}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
              title="Send"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

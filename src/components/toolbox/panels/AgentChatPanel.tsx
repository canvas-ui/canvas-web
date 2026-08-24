import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Mic, Send, Square, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAgent, getAgentAccess, getVoiceStatus, setAgentAccess, type Agent, type AgentAccess } from '@/services/agent'
import { useToast } from '@/components/ui/use-toast'
import { useToolboxOptional } from '../use-toolbox'
import { useAgentPromptStream } from '@/hooks/useAgentPromptStream'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import AgentAssistantExtras from '@/components/agent/AgentAssistantExtras'

interface AgentChatPanelProps {
  agentId: string
  onClose: () => void
}

export function AgentChatPanel({ agentId, onClose }: AgentChatPanelProps) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [input, setInput] = useState('')
  const [voiceAvailable, setVoiceAvailable] = useState(false)
  const [access, setAccess] = useState<AgentAccess | null>(null)
  const [bindBusy, setBindBusy] = useState(false)
  // Token minted by a rebind — shown exactly once (server stores only the hash).
  const [mintedToken, setMintedToken] = useState<string | null>(null)
  const { showToast } = useToast()
  // Context hand-off: the toolbox knows which context the user is looking at.
  const toolbox = useToolboxOptional()
  const activeContextId = toolbox?.state.activeContextType === 'context' ? toolbox.state.activeContextId : null
  const activeContextPath = toolbox?.state.activeContextPath ?? null
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { messages, isStreaming, error, send, sendVoice, stop, clear } = useAgentPromptStream(agentId)
  const { isRecording, recorderError, start: startRecording, stop: stopRecording } = useVoiceRecorder()

  useEffect(() => {
    getAgent(agentId).then(setAgent).catch(() => {})
    getAgentAccess(agentId).then(setAccess).catch(() => setAccess(null))
  }, [agentId])

  useEffect(() => {
    // Mic button only when server-side STT is configured.
    getVoiceStatus()
      .then(status => setVoiceAvailable(Boolean(status.enabled && status.stt)))
      .catch(() => setVoiceAvailable(false))
  }, [])

  useEffect(() => {
    if (messages.length === 0) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const boundToActiveContext =
    access?.binding.type === 'context' && Boolean(activeContextId) && access?.binding.context === activeContextId

  const scopeLabel = !access
    ? 'no canvas access'
    : access.binding.type === 'global'
      ? 'scope: global'
      : access.binding.type === 'context'
        ? (boundToActiveContext ? 'scoped to this context' : 'context-bound')
        : `scope: ${access.binding.workspaceName || access.binding.workspace}${access.binding.type === 'path' ? `:${access.binding.path || '/'}` : ''}`

  const handleBindToContext = async () => {
    if (!activeContextId || bindBusy) return
    const label = activeContextId || activeContextPath
    if (!window.confirm(
      `Bind "${agent?.label || agent?.name || agentId}" to the current context (${label})? ` +
      'This mints a new canvas token and restarts the agent if it is running.'
    )) return
    setBindBusy(true)
    try {
      const result = await setAgentAccess(agentId, {
        binding: { type: 'context', context: activeContextId },
        permissions: ['read', 'write'],
      })
      setAccess(result.access)
      setMintedToken(result.token)
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Bind failed', variant: 'destructive' })
    } finally {
      setBindBusy(false)
    }
  }

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    textareaRef.current?.focus()
    await send(msg)
  }

  const handleMicClick = async () => {
    if (isRecording) {
      const clip = await stopRecording()
      if (clip) await sendVoice(clip)
    } else if (!isStreaming) {
      await startRecording()
    }
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
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {agent?.label || agent?.name || agentId}
          </div>
          <div className="text-[10px] leading-tight text-muted-foreground truncate" title={scopeLabel}>
            {scopeLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={clear}
          className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Clear chat"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Offer to scope the agent to the toolbox's context unless it already follows it */}
      {activeContextId && !boundToActiveContext && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40 text-xs shrink-0">
          <span className="flex-1 truncate text-muted-foreground" title={activeContextId || activeContextPath || undefined}>
            Toolbox context: {activeContextId || activeContextPath}
          </span>
          <button
            type="button"
            disabled={bindBusy}
            onClick={handleBindToContext}
            className="shrink-0 rounded border border-input px-2 py-1 hover:bg-accent disabled:opacity-50"
          >
            {bindBusy ? 'Binding…' : 'Bind to this context'}
          </button>
        </div>
      )}
      {mintedToken && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-warning/10 text-xs shrink-0">
          <span className="shrink-0 text-muted-foreground">Token (shown once):</span>
          <code className="flex-1 truncate font-mono">{mintedToken}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(mintedToken)}
            className="shrink-0 rounded border border-input px-2 py-1 hover:bg-accent"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => setMintedToken(null)}
            className="shrink-0 rounded px-1.5 py-1 hover:bg-accent"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

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
        {(error || recorderError) && (
          <div className="text-xs text-destructive text-center py-1">{error || recorderError}</div>
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
          {voiceAvailable && (
            <button
              type="button"
              onClick={handleMicClick}
              disabled={isStreaming && !isRecording}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-md transition-opacity shrink-0 disabled:opacity-40',
                isRecording
                  ? 'bg-destructive text-destructive-foreground hover:opacity-90 animate-pulse'
                  : 'bg-muted text-foreground hover:bg-accent',
              )}
              title={isRecording ? 'Stop recording and send' : 'Record a voice message'}
            >
              {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
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

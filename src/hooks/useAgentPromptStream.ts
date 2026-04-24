import { useState, useCallback, useRef, useEffect } from 'react'
import { api } from '@/lib/api'
import { API_URL } from '@/config/api'
import { getAgentSession, startAgent } from '@/services/agent'
import { extractAgentMessageReasoning } from '@/services/agent'
import { extractAgentMessageMetadata, type AgentResponseMetadata } from '@/services/agent'

export interface PromptMessage {
  role: 'user' | 'assistant'
  content: string
  isComplete: boolean
  reasoning?: string
  metadata?: AgentResponseMetadata
}

function extractMessageText(message: any): string {
  if (!message) return ''
  if (typeof message.errorMessage === 'string' && message.errorMessage.trim()) {
    return message.errorMessage.trim()
  }
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const text = content
    .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
    .map((block: any) => block.text)
    .join('\n')
  return text || ''
}

export function useAgentPromptStream(agentId: string) {
  const [messages, setMessages] = useState<PromptMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!agentId) {
      setMessages([])
      return
    }

    getAgentSession(agentId)
      .then((session) => {
        if (cancelled) return
        setMessages(session.messages.map((message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content,
          isComplete: true,
          ...(message.metadata?.reasoning ? { reasoning: message.metadata.reasoning } : {}),
          ...(message.metadata ? { metadata: message.metadata } : {}),
        })))
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })

    return () => {
      cancelled = true
    }
  }, [agentId])

  const send = useCallback(async (text: string) => {
    if (isStreaming || !text.trim() || !agentId) return
    setError(null)

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text, isComplete: true },
      { role: 'assistant', content: '', isComplete: false },
    ])
    setIsStreaming(true)

    try {
      await startAgent(agentId)
    } catch (startErr: any) {
      // 'Agent is not active' means it's already running — fine to ignore.
      // Any other error (model unknown, API unreachable, etc.) surfaces in the stream.
      if (!startErr?.message?.includes('not active') && !startErr?.message?.includes('already')) {
        setError(startErr?.message ?? 'Failed to start agent')
        setIsStreaming(false)
        return
      }
    }

    abortRef.current = new AbortController()
    let buffer = ''
    let assistantContent = ''
    let assistantReasoning = ''
    let assistantMetadata: AgentResponseMetadata | undefined

    try {
      await api.stream(
        `${API_URL}/agents/${agentId}/prompt/stream`,
        { message: text },
        {
          signal: abortRef.current.signal,
          onChunk: (chunk: string) => {
            buffer += chunk
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') return
              try {
                const ev = JSON.parse(raw)
                if (ev.type === 'chunk') {
                  assistantContent += ev.delta || ''
                  setMessages(prev => {
                    const copy = [...prev]
                    copy[copy.length - 1] = {
                      role: 'assistant',
                      content: assistantContent,
                      isComplete: false,
                      ...(assistantReasoning ? { reasoning: assistantReasoning } : {}),
                      ...(assistantMetadata ? { metadata: assistantMetadata } : {}),
                    }
                    return copy
                  })
                } else if (ev.type === 'thinking') {
                  assistantReasoning = `${assistantReasoning}${ev.delta || ''}`.trim()
                  setMessages(prev => {
                    const copy = [...prev]
                    const currentContent = copy[copy.length - 1]?.content || assistantContent
                    copy[copy.length - 1] = {
                      role: 'assistant',
                      content: currentContent,
                      isComplete: false,
                      ...(assistantReasoning ? { reasoning: assistantReasoning } : {}),
                      ...(assistantMetadata ? { metadata: assistantMetadata } : {}),
                    }
                    return copy
                  })
                } else if (ev.type === 'complete') {
                  const finalMessage = Array.isArray(ev.messages)
                    ? [...ev.messages].reverse().find((message: any) => message?.role === 'assistant')
                    : null
                  const finalContent = extractMessageText(finalMessage)
                  const finalReasoning = extractAgentMessageReasoning(finalMessage) || assistantReasoning
                  assistantMetadata = extractAgentMessageMetadata(finalMessage)

                  setMessages(prev => {
                    const copy = [...prev]
                    const currentContent = assistantContent || copy[copy.length - 1]?.content || ''
                    copy[copy.length - 1] = {
                      role: 'assistant',
                      content: finalContent || currentContent,
                      isComplete: true,
                      ...(finalReasoning ? { reasoning: finalReasoning } : {}),
                      ...(assistantMetadata ? { metadata: assistantMetadata } : {}),
                    }
                    return copy
                  })
                } else if (ev.type === 'error') {
                  setError(ev.error)
                }
              } catch { /* malformed line */ }
            }
          },
          onError: (err: Error) => {
            if (err.name !== 'AbortError') setError(err.message)
          },
          onComplete: () => {
            setMessages(prev => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              if (last && !last.isComplete) copy[copy.length - 1] = { ...last, isComplete: true }
              return copy
            })
            setIsStreaming(false)
          },
        }
      )
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError(err?.message ?? 'Stream failed')
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last && !last.isComplete) copy[copy.length - 1] = { ...last, isComplete: true }
        return copy
      })
      setIsStreaming(false)
    }
  }, [agentId, isStreaming])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, isStreaming, error, send, stop, clear }
}

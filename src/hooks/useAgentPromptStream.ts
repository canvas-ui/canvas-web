import type { AgentViewContext } from '@/lib/agent-view-context'
import { useState, useCallback, useRef, useEffect } from 'react'
import { api } from '@/lib/api'
import { API_URL } from '@/config/api'
import { getAgentSession, startAgent, transcribeAgentVoice } from '@/services/agent'
import { extractAgentMessageReasoning } from '@/services/agent'
import { extractAgentMessageMetadata, type AgentResponseMetadata, type RawAgentMessage } from '@/services/agent'

export interface PromptMessage {
  role: 'user' | 'assistant'
  content: string
  isComplete: boolean
  reasoning?: string
  metadata?: AgentResponseMetadata
}

function extractMessageText(message: RawAgentMessage | null | undefined): string {
  if (!message) return ''
  if (typeof message.errorMessage === 'string' && message.errorMessage.trim()) {
    return message.errorMessage.trim()
  }
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const text = content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n')
  return text || ''
}

export function useAgentPromptStream(agentId: string) {
  const [messages, setMessages] = useState<PromptMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Reset the log during render when the agent changes and there is no agent
  // to load a session for (prop-driven state reset, no effect needed).
  const [prevAgentId, setPrevAgentId] = useState(agentId)
  if (prevAgentId !== agentId) {
    setPrevAgentId(agentId)
    if (!agentId) setMessages([])
  }

  useEffect(() => {
    let cancelled = false

    if (!agentId) return

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

  // Streams one prompt and resolves with the final reply text, or null when
  // the turn failed or was stopped.
  const runPrompt = useCallback(async (text: string, viewContext?: AgentViewContext | null): Promise<string | null> => {
    setError(null)

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text, isComplete: true },
      { role: 'assistant', content: '', isComplete: false },
    ])
    setIsStreaming(true)

    try {
      await startAgent(agentId)
    } catch (startErr) {
      // 'Agent is not active' means it's already running — fine to ignore.
      // Any other error (model unknown, API unreachable, etc.) surfaces in the stream.
      const startMessage = startErr instanceof Error ? startErr.message : undefined
      if (!startMessage?.includes('not active') && !startMessage?.includes('already')) {
        setError(startMessage ?? 'Failed to start agent')
        setIsStreaming(false)
        return null
      }
    }

    abortRef.current = new AbortController()
    let buffer = ''
    let assistantContent = ''
    let assistantReasoning = ''
    let assistantMetadata: AgentResponseMetadata | undefined
    let reply: string | null = null

    try {
      await api.stream(
        `${API_URL}/agents/${agentId}/prompt/stream`,
        { message: text, viewContext },
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
                    ? ([...ev.messages] as RawAgentMessage[]).reverse().find((message) => message?.role === 'assistant')
                    : null
                  const finalContent = extractMessageText(finalMessage)
                  const finalReasoning = extractAgentMessageReasoning(finalMessage) || assistantReasoning
                  assistantMetadata = extractAgentMessageMetadata(finalMessage)

                  reply = finalContent || assistantContent || null
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
                  reply = null
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
    } catch (err) {
      const streamErr = err instanceof Error ? err : null
      if (streamErr?.name !== 'AbortError') setError(streamErr?.message ?? 'Stream failed')
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last && !last.isComplete) copy[copy.length - 1] = { ...last, isComplete: true }
        return copy
      })
      setIsStreaming(false)
      return null
    }
    return abortRef.current?.signal.aborted ? null : reply
  }, [agentId])

  const send = useCallback(async (text: string, viewContext?: AgentViewContext | null) => {
    if (isStreaming || !text.trim() || !agentId) return null
    return runPrompt(text, viewContext)
  }, [agentId, isStreaming, runPrompt])

  // Spoken turn: the clip is transcribed, then sent as an ordinary streamed
  // prompt. Resolves with the reply text for the caller to have spoken.
  const sendVoice = useCallback(async (audio: Blob, viewContext?: AgentViewContext | null) => {
    if (isStreaming || !agentId) return null
    setError(null)
    setIsStreaming(true)
    setMessages(prev => [...prev, { role: 'user', content: 'Transcribing…', isComplete: false }])
    const dropPlaceholder = () => setMessages(prev => {
      const last = prev[prev.length - 1]
      return last?.role === 'user' && !last.isComplete ? prev.slice(0, -1) : prev
    })

    let transcript = ''
    try {
      transcript = (await transcribeAgentVoice(agentId, audio)).trim()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed')
    }
    dropPlaceholder()
    if (!transcript) {
      setError(current => current ?? 'Nothing was heard, try again')
      setIsStreaming(false)
      return null
    }
    return runPrompt(transcript, viewContext)
  }, [agentId, isStreaming, runPrompt])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, isStreaming, error, send, sendVoice, stop, clear }
}

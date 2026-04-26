import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Cpu, Image as ImageIcon, MessageCircle, Play, Settings, Square, X } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import StreamingChatMessageComponent from '@/components/agent/StreamingChatMessage'
import { useAgentSessions } from '@/components/agent/agent-session-context'
import { useMenu } from '@/components/shell/menu-context'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-container'
import { useAgentChat } from '@/hooks/useAgentChat'
import { type Agent, type AgentImageContent, type ChatMessage, getAgent, getAgentStatus, startAgent, stopAgent } from '@/services/agent'

function useSessionGuard(agentId: string) {
  const { sessions, create } = useAgentSessions(agentId)
  const hasSession = (sessions?.sessions.length ?? 0) > 0

  const ensureSession = async () => {
    if (hasSession) return null
    return create({ mode: 'persistent' })
  }

  return { hasSession, ensureSession }
}

interface PendingImage extends AgentImageContent {
  id: string
}

async function fileToAgentImage(file: File): Promise<PendingImage> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const [, base64 = ''] = result.split(',', 2)
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })

  return {
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'image',
    data,
    mimeType: file.type || 'image/png',
    name: file.name,
  }
}

function normalizeSessionRouteId(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function AgentConversation({
  agentId,
  routeAgentId,
  initialMessages,
  llmProvider,
  sessionKey,
}: {
  agentId: string
  routeAgentId: string
  initialMessages?: ChatMessage[]
  llmProvider?: Agent['llmProvider']
  sessionKey: string
}) {
  const { showToast } = useToast()
  const { hasSession, ensureSession } = useSessionGuard(agentId)
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const [currentMessage, setCurrentMessage] = useState('')
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])

  const {
    allMessages,
    isStreaming,
    currentStreamingMessage,
    connectionStatus,
    error,
    sendMessage,
    clearMessages,
    stopStreaming,
  } = useAgentChat({
    agentId,
    initialMessages,
    historyKey: sessionKey,
    loadHistory: false,
    llmProvider,
    enableWebSocket: false,
    onError: (chatError) => {
      showToast({
        title: 'Chat Error',
        description: chatError.message,
        variant: 'destructive',
      })
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages, currentStreamingMessage])

  useEffect(() => {
    if (!isStreaming) {
      chatInputRef.current?.focus()
    }
  }, [isStreaming, sessionKey])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const message = currentMessage.trim()
    if (!message && pendingImages.length === 0) return

    setCurrentMessage('')
    try {
      // Auto-create a session transparently if this is a fresh agent with no sessions yet
      const sessionResult = await ensureSession()
      if (sessionResult?.current.sessionId) {
        navigate(`/agents/${encodeURIComponent(routeAgentId)}/${encodeURIComponent(sessionResult.current.sessionId)}`, { replace: true })
      }
      await sendMessage(message, {
        images: pendingImages.map(({ id: _id, ...image }) => image),
      })
      setPendingImages([])
    } catch (chatError) {
      showToast({
        title: 'Chat Error',
        description: chatError instanceof Error ? chatError.message : 'Failed to send message',
        variant: 'destructive',
      })
    }
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (files.length === 0) return

    try {
      const images = await Promise.all(files.map(fileToAgentImage))
      setPendingImages((prev) => [...prev, ...images])
    } catch (error) {
      showToast({
        title: 'Paste Error',
        description: error instanceof Error ? error.message : 'Failed to read pasted image',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Chat</h2>
          <p className="text-xs text-muted-foreground">Current session conversation</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{connectionStatus}</span>
          {allMessages.length > 0 && (
            <button
              type="button"
              onClick={clearMessages}
              disabled={isStreaming}
              className="text-destructive hover:underline disabled:opacity-50"
            >
              Clear visible chat
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {allMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-muted-foreground">
            <div>
              <MessageCircle className="mx-auto mb-4 h-10 w-10 opacity-40" />
              <p className="text-sm">{hasSession ? 'No messages yet.' : 'No session yet.'}</p>
              <p className="mt-1 text-xs">
                {hasSession
                  ? 'Send a message to start the conversation.'
                  : 'Type a message to auto-create a session, or pick one in the Sessions panel.'}
              </p>
            </div>
          </div>
        ) : (
          allMessages.map((message, index) => (
            <StreamingChatMessageComponent
              key={`${message.timestamp}-${index}`}
              message={message}
              isStreaming={isStreaming && message === currentStreamingMessage}
              connectionStatus={connectionStatus}
            />
          ))
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        {pendingImages.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingImages.map((image) => (
              <div key={image.id} className="group relative overflow-hidden rounded-md border bg-muted/20">
                <img
                  src={`data:${image.mimeType};base64,${image.data}`}
                  alt={image.name || 'Pasted image'}
                  className="h-16 w-16 object-cover"
                />
                <div className="max-w-16 truncate px-2 py-1 text-[10px] text-muted-foreground">
                  {image.name || image.mimeType}
                </div>
                <button
                  type="button"
                  onClick={() => setPendingImages((prev) => prev.filter((entry) => entry.id !== image.id))}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:text-foreground"
                  title="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex gap-2">
          <textarea
            ref={chatInputRef}
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            onPaste={handlePaste}
            placeholder={isStreaming ? 'Streaming in progress...' : hasSession ? 'Type a message...' : 'Type to start a new session…'}
            disabled={isStreaming}
            rows={2}
            className="flex min-h-10 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          {isStreaming ? (
            <Button type="button" variant="outline" onClick={stopStreaming}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!currentMessage.trim() && pendingImages.length === 0}>
              Send
            </Button>
          )}
        </form>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          Paste image files from clipboard directly into the input.
        </div>
      </div>
    </div>
  )
}

export default function AgentDetailPage() {
  const { agentId, sessionId } = useParams<{ agentId: string; sessionId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { selectEntity, openM2 } = useMenu()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectingSessionRef = useRef<string | null>(null)
  const { current, sessions, refresh, select } = useAgentSessions(agentId || '')

  const selectedSession = useMemo(() => {
    if (!sessions?.sessions) return null
    if (sessions.currentSessionId) {
      return sessions.sessions.find((session) => session.id === sessions.currentSessionId) || null
    }
    if (sessions.currentSessionPath) {
      return sessions.sessions.find((session) => session.path === sessions.currentSessionPath) || null
    }
    return sessions.sessions.find((session) => session.isCurrent) || null
  }, [sessions])

  const sessionViewKey = [
    current?.mode || 'persistent',
    current?.sessionId || current?.sessionFile || 'initial',
  ].join(':')

  useEffect(() => {
    if (!agentId) return

    const loadPageData = async () => {
      setIsLoading(true)
      try {
        const agentData = await getAgent(agentId)
        selectEntity(agentData.id)
        setAgent(agentData)
        const canonicalAgentId = agentData.name || agentData.id
        if (canonicalAgentId && decodeURIComponent(agentId) !== canonicalAgentId) {
          const nextPath = location.pathname.endsWith('/settings')
            ? `/agents/${encodeURIComponent(canonicalAgentId)}/settings`
            : sessionId
              ? `/agents/${encodeURIComponent(canonicalAgentId)}/${encodeURIComponent(sessionId)}`
              : `/agents/${encodeURIComponent(canonicalAgentId)}`
          navigate(nextPath, { replace: true })
        }
        await refresh()
        setError(null)
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load agent'
        setError(message)
        showToast({ title: 'Error', description: message, variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
    }

    loadPageData()
  }, [agentId, sessionId, location.pathname, navigate, refresh, selectEntity, showToast])

  useEffect(() => {
    if (!agentId || !sessionId || !sessions) return

    const targetSessionId = decodeURIComponent(sessionId)
    const targetSessionSlug = normalizeSessionRouteId(targetSessionId)
    const targetSession = sessions.sessions.find((session) => (
      session.id === targetSessionId
      || session.slug === targetSessionId
      || normalizeSessionRouteId(session.name) === targetSessionSlug
    ))
    const isAlreadySelected = Boolean(targetSession && (
      sessions.currentSessionId === targetSession.id
      || sessions.currentSessionPath === targetSession.path
      || current?.sessionId === targetSession.id
      || current?.sessionFile === targetSession.path
    ))
    const isCurrentRoute = current?.sessionId === targetSessionId
      || sessions.currentSessionId === targetSessionId
    if (current?.mode === 'persistent' && isAlreadySelected) {
      selectingSessionRef.current = null
      return
    }

    if (!targetSession) {
      if (current?.mode === 'persistent' && isCurrentRoute) {
        selectingSessionRef.current = null
      }
      return
    }

    if (selectingSessionRef.current === targetSession.id) return
    selectingSessionRef.current = targetSession.id
    select({ mode: 'persistent', sessionId: targetSession.id })
      .catch((selectError) => {
        showToast({
          title: 'Session Error',
          description: selectError instanceof Error ? selectError.message : 'Failed to select session',
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (selectingSessionRef.current === targetSession.id) {
          selectingSessionRef.current = null
        }
      })
  }, [agentId, sessionId, sessions, current?.mode, current?.sessionId, current?.sessionFile, select, showToast])

  useEffect(() => {
    if (!agentId) return

    const refreshStatus = async () => {
      try {
        const status = await getAgentStatus(agentId)
        setAgent((prev) => prev ? {
          ...prev,
          isActive: status.isActive,
          status: status.status as Agent['status'],
          lastAccessed: status.lastAccessed,
        } : null)
      } catch {
        // stale status is fine
      }
    }

    refreshStatus()
    const interval = setInterval(refreshStatus, 5000)
    return () => clearInterval(interval)
  }, [agentId])

  const handleStart = async () => {
    if (!agentId) return
    setIsStarting(true)
    try {
      const updatedAgent = await startAgent(agentId)
      setAgent(updatedAgent)
      showToast({ title: 'Started', description: `${updatedAgent.label || updatedAgent.name} is active` })
    } catch (startError) {
      showToast({
        title: 'Error',
        description: startError instanceof Error ? startError.message : 'Failed to start agent',
        variant: 'destructive',
      })
    } finally {
      setIsStarting(false)
    }
  }

  const handleStop = async () => {
    if (!agentId) return
    setIsStopping(true)
    try {
      const updatedAgent = await stopAgent(agentId)
      setAgent(updatedAgent)
      showToast({ title: 'Stopped', description: `${updatedAgent.label || updatedAgent.name} is inactive` })
    } catch (stopError) {
      showToast({
        title: 'Error',
        description: stopError instanceof Error ? stopError.message : 'Failed to stop agent',
        variant: 'destructive',
      })
    } finally {
      setIsStopping(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Bot className="mx-auto mb-3 h-8 w-8 animate-pulse" />
          <p>Loading agent...</p>
        </div>
      </div>
    )
  }

  if (!agent || error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-destructive">
          <Bot className="mx-auto mb-3 h-8 w-8" />
          <p>{error || 'Agent not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: agent.color || '#9ca3af' }}
            />
            <h1 className="truncate text-xl font-semibold">{agent.label || agent.name}</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {agent.status}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {agent.description || `${agent.llmProvider} / ${agent.model}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!agent.isActive ? (
            <Button onClick={handleStart} disabled={isStarting}>
              <Play className="mr-2 h-4 w-4" />
              {isStarting ? 'Starting...' : 'Start'}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleStop} disabled={isStopping}>
              <Square className="mr-2 h-4 w-4" />
              {isStopping ? 'Stopping...' : 'Stop'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              selectEntity(agent.id)
              openM2('settings', agent.id)
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <AgentConversation
          key={sessionViewKey}
          agentId={agent.id}
          routeAgentId={agent.name || agent.id}
          initialMessages={current?.messages || []}
          llmProvider={agent.llmProvider}
          sessionKey={sessionViewKey}
        />

        <div className="flex min-h-0 flex-col rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Contextual Information</h2>
            <p className="text-xs text-muted-foreground">Current session and runtime state.</p>
          </div>
          <div className="space-y-4 overflow-y-auto p-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Mode</div>
              <div className="mt-1">{current?.mode || sessions?.mode || 'persistent'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Selected Session</div>
              <div className="mt-1 break-all">
                {selectedSession?.name || (selectedSession?.isExperimental ? 'Experimental' : null) || current?.sessionId || 'Default session'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Known Sessions</div>
              <div className="mt-1">{sessions?.sessions.length || 0}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Thinking Level</div>
              <div className="mt-1">{current?.thinkingLevel || 'high'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Model</div>
              <div className="mt-1">{current?.model?.modelId || agent.model || 'Not set'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Session File</div>
              <div className="mt-1 break-all text-xs text-muted-foreground">
                {current?.sessionFile || 'In-memory / not persisted yet'}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <Cpu className="h-4 w-4" />
                Shape
              </div>
              <p>
                Session selection lives in M2. Main content stays focused on the active conversation and its context.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

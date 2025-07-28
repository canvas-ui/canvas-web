import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import {
  Send,
  Play,
  Square,
  Settings,
  Brain,
  Trash,
  Wrench,
  Cpu,
  MessageCircle,
  Clock,
  Database
} from 'lucide-react'
import {
  getAgent,
  startAgent,
  stopAgent,
  chatWithAgent,
  getAgentMemory,
  clearAgentMemory,
  getAgentMCPTools,
  callMCPTool,
  Agent,
  ChatMessage,
  MCPTool,
  AgentMemory
} from '@/services/agent'

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isChatting, setIsChatting] = useState(false)
  const [isStartingAgent, setIsStartingAgent] = useState(false)
  const [isStoppingAgent, setIsStoppingAgent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sidebar states
  const [activeTab, setActiveTab] = useState<'info' | 'tools' | 'memory'>('info')
  const [tools, setTools] = useState<MCPTool[]>([])
  const [memory, setMemory] = useState<AgentMemory[]>([])
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null)
  const [toolArgs, setToolArgs] = useState<Record<string, any>>({})
  const [isLoadingTools, setIsLoadingTools] = useState(false)
  const [isLoadingMemory, setIsLoadingMemory] = useState(false)
  const [isExecutingTool, setIsExecutingTool] = useState(false)

  const { showToast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Focus chat input when agent becomes active
  useEffect(() => {
    if (agent?.isActive && chatInputRef.current) {
      chatInputRef.current.focus()
    }
  }, [agent?.isActive])

  // Fetch agent details
  useEffect(() => {
    if (!agentId) return

    const fetchAgent = async () => {
      setIsLoading(true)
      try {
        const agentData = await getAgent(agentId)
        setAgent(agentData)
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to fetch agent ${agentId}`
        setError(message)
        showToast({
          title: 'Error',
          description: message,
          variant: 'destructive'
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchAgent()
  }, [agentId])

  // Load tools when agent is active and tools tab is selected
  useEffect(() => {
    if (agent?.isActive && activeTab === 'tools' && !isLoadingTools) {
      loadTools()
    }
  }, [agent?.isActive, activeTab])

  // Load memory when memory tab is selected
  useEffect(() => {
    if (agent?.isActive && activeTab === 'memory' && !isLoadingMemory) {
      loadMemory()
    }
  }, [agent?.isActive, activeTab])

  const loadTools = async () => {
    if (!agent?.isActive) return

    setIsLoadingTools(true)
    try {
      const toolsData = await getAgentMCPTools(agent.id)
      setTools(toolsData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load MCP tools'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsLoadingTools(false)
    }
  }

  const loadMemory = async () => {
    if (!agent?.isActive) return

    setIsLoadingMemory(true)
    try {
      const memoryData = await getAgentMemory(agent.id)
      setMemory(memoryData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load agent memory'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsLoadingMemory(false)
    }
  }

  const handleStartAgent = async () => {
    if (!agent) return

    setIsStartingAgent(true)
    try {
      const updatedAgent = await startAgent(agent.name)
      setAgent(updatedAgent)
      showToast({
        title: 'Success',
        description: 'Agent started successfully'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start agent'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsStartingAgent(false)
    }
  }

  const handleStopAgent = async () => {
    if (!agent) return

    setIsStoppingAgent(true)
    try {
      await stopAgent(agent.name)
      setAgent(prev => prev ? { ...prev, status: 'inactive', isActive: false } : null)
      setMessages([])
      showToast({
        title: 'Success',
        description: 'Agent stopped successfully'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop agent'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsStoppingAgent(false)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentMessage.trim() || !agent?.isActive || isChatting) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: currentMessage,
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setCurrentMessage('')
    setIsChatting(true)

    try {
      const response = await chatWithAgent(agent.id, {
        message: currentMessage,
        context: messages.slice(-10), // Last 10 messages for context
        mcpContext: true
      })

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
        metadata: response.metadata
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })

      // Add error message to chat
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${message}`,
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsChatting(false)
    }
  }

  const handleExecuteTool = async () => {
    if (!selectedTool || !agent?.isActive || isExecutingTool) return

    setIsExecutingTool(true)
    try {
      const result = await callMCPTool(agent.id, selectedTool.name, toolArgs, selectedTool.source)

      // Add tool execution to chat
      const toolMessage: ChatMessage = {
        role: 'assistant',
        content: `Tool "${selectedTool.name}" executed:\n${result.content.map(c => c.text || JSON.stringify(c)).join('\n')}`,
        timestamp: new Date().toISOString(),
        metadata: {
          toolCalls: [{ tool: selectedTool.name, args: toolArgs, result }]
        }
      }

      setMessages(prev => [...prev, toolMessage])
      setSelectedTool(null)
      setToolArgs({})

      showToast({
        title: 'Success',
        description: `Tool "${selectedTool.name}" executed successfully`
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to execute tool'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsExecutingTool(false)
    }
  }

  const handleClearMemory = async () => {
    if (!agent?.isActive || !confirm('Are you sure you want to clear all agent memory?')) return

    try {
      await clearAgentMemory(agent.id)
      setMemory([])
      showToast({
        title: 'Success',
        description: 'Agent memory cleared successfully'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear memory'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const renderToolArgumentInput = (argName: string, schema: any) => {
    const value = toolArgs[argName] || ''

    const handleChange = (newValue: any) => {
      setToolArgs(prev => ({ ...prev, [argName]: newValue }))
    }

    if (schema.type === 'boolean') {
      return (
        <div key={argName} className="space-y-2">
          <label className="text-sm font-medium">{argName}</label>
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => handleChange(e.target.checked)}
            className="rounded"
          />
          {schema.description && (
            <p className="text-xs text-muted-foreground">{schema.description}</p>
          )}
        </div>
      )
    }

    if (schema.enum) {
      return (
        <div key={argName} className="space-y-2">
          <label className="text-sm font-medium">{argName}</label>
          <select
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
          >
            <option value="">Select...</option>
            {schema.enum.map((option: string) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {schema.description && (
            <p className="text-xs text-muted-foreground">{schema.description}</p>
          )}
        </div>
      )
    }

    return (
      <div key={argName} className="space-y-2">
        <label className="text-sm font-medium">{argName}</label>
        <Input
          type={schema.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => handleChange(schema.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
          placeholder={schema.description || `Enter ${argName}`}
        />
        {schema.description && (
          <p className="text-xs text-muted-foreground">{schema.description}</p>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading agent...</p>
        </div>
      </div>
    )
  }

  if (error && !agent) {
    return (
      <div className="text-center space-y-4">
        <div className="text-destructive">Error: {error}</div>
      </div>
    )
  }

  if (!agent) {
    return <div className="text-center">Agent not found.</div>
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col border rounded-lg">
        {/* Agent Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full border-2 flex items-center justify-center"
              style={{ backgroundColor: agent.color || '#6366f1', borderColor: agent.color || '#6366f1' }}
            >
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{agent.label || agent.name}</h1>
              <p className="text-sm text-muted-foreground">
                {agent.llmProvider} • {agent.model} •
                <span className={`ml-1 ${agent.isActive ? 'text-green-600' : 'text-yellow-600'}`}>
                  {agent.status}
                </span>
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {!agent.isActive ? (
              <Button
                onClick={handleStartAgent}
                disabled={isStartingAgent}
                size="sm"
              >
                <Play className="mr-2 h-4 w-4" />
                {isStartingAgent ? 'Starting...' : 'Start'}
              </Button>
            ) : (
              <Button
                onClick={handleStopAgent}
                disabled={isStoppingAgent}
                variant="outline"
                size="sm"
              >
                <Square className="mr-2 h-4 w-4" />
                {isStoppingAgent ? 'Stopping...' : 'Stop'}
              </Button>
            )}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!agent.isActive ? (
            <div className="text-center text-muted-foreground py-8">
              <Cpu className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Agent is not active. Start the agent to begin chatting.</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No messages yet. Start a conversation with your agent!</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] p-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                  <div className="text-xs mt-2 opacity-70">
                    {new Date(message.timestamp).toLocaleTimeString()}
                    {message.metadata && (
                      <span className="ml-2">• {message.metadata.model}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {isChatting && (
            <div className="flex justify-start">
              <div className="bg-muted p-3 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                  Agent is thinking...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              ref={chatInputRef}
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder={agent.isActive ? "Type a message..." : "Start the agent to chat"}
              disabled={!agent.isActive || isChatting}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={!agent.isActive || !currentMessage.trim() || isChatting}
              size="sm"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 border rounded-lg">
        {/* Sidebar Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 p-3 text-sm font-medium border-r ${
              activeTab === 'info' ? 'bg-muted' : 'hover:bg-muted/50'
            }`}
          >
            <Settings className="h-4 w-4 mx-auto mb-1" />
            Info
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex-1 p-3 text-sm font-medium border-r ${
              activeTab === 'tools' ? 'bg-muted' : 'hover:bg-muted/50'
            }`}
            disabled={!agent.isActive}
          >
            <Wrench className="h-4 w-4 mx-auto mb-1" />
            Tools
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`flex-1 p-3 text-sm font-medium ${
              activeTab === 'memory' ? 'bg-muted' : 'hover:bg-muted/50'
            }`}
            disabled={!agent.isActive}
          >
            <Database className="h-4 w-4 mx-auto mb-1" />
            Memory
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="p-4 h-[calc(100%-57px)] overflow-y-auto">
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-3">Agent Details</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Name:</span>
                    <span className="ml-2 font-mono">{agent.name}</span>
                  </div>
                  <div>
                    <span className="font-medium">Label:</span>
                    <span className="ml-2">{agent.label || 'None'}</span>
                  </div>
                  <div>
                    <span className="font-medium">Provider:</span>
                    <span className="ml-2 capitalize">{agent.llmProvider}</span>
                  </div>
                  <div>
                    <span className="font-medium">Model:</span>
                    <span className="ml-2 font-mono text-xs">{agent.model}</span>
                  </div>
                  <div>
                    <span className="font-medium">Status:</span>
                    <span className="ml-2">{agent.status}</span>
                  </div>
                  <div>
                    <span className="font-medium">Created:</span>
                    <span className="ml-2">{new Date(agent.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {agent.description && (
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">{agent.description}</p>
                </div>
              )}

              {agent.config.mcp.servers.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">MCP Servers</h4>
                  <div className="space-y-2">
                    {agent.config.mcp.servers.map((server, index) => (
                      <div key={index} className="p-2 bg-muted rounded text-sm">
                        <div className="font-medium">{server.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {server.command} {server.args.join(' ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">MCP Tools</h3>
                <Button onClick={loadTools} size="sm" variant="outline" disabled={isLoadingTools}>
                  {isLoadingTools ? 'Loading...' : 'Refresh'}
                </Button>
              </div>

              {selectedTool ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{selectedTool.title || selectedTool.name}</h4>
                    <Button onClick={() => setSelectedTool(null)} size="sm" variant="ghost">
                      ×
                    </Button>
                  </div>

                  <p className="text-sm text-muted-foreground">{selectedTool.description}</p>

                  <div className="space-y-3">
                    {selectedTool.inputSchema && typeof selectedTool.inputSchema === 'object' && selectedTool.inputSchema.properties ? (
                      Object.entries(selectedTool.inputSchema.properties).map(([argName, schema]) =>
                        renderToolArgumentInput(argName, schema)
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground">No arguments required</p>
                    )}
                  </div>

                  <Button
                    onClick={handleExecuteTool}
                    disabled={isExecutingTool}
                    className="w-full"
                  >
                    {isExecutingTool ? 'Executing...' : 'Execute Tool'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {isLoadingTools ? (
                    <div className="text-center text-muted-foreground">Loading tools...</div>
                  ) : tools.length === 0 ? (
                    <div className="text-center text-muted-foreground">No tools available</div>
                  ) : (
                    tools.map((tool) => (
                      <button
                        key={`${tool.source}-${tool.name}`}
                        onClick={() => setSelectedTool(tool)}
                        className="w-full p-3 text-left border rounded hover:bg-muted/50 transition-colors"
                      >
                        <div className="font-medium text-sm">{tool.title || tool.name}</div>
                        <div className="text-xs text-muted-foreground">{tool.description}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Source: {tool.source}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Agent Memory</h3>
                <div className="flex gap-2">
                  <Button onClick={loadMemory} size="sm" variant="outline" disabled={isLoadingMemory}>
                    {isLoadingMemory ? 'Loading...' : 'Refresh'}
                  </Button>
                  <Button onClick={handleClearMemory} size="sm" variant="outline">
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {isLoadingMemory ? (
                  <div className="text-center text-muted-foreground">Loading memory...</div>
                ) : memory.length === 0 ? (
                  <div className="text-center text-muted-foreground">No memory entries</div>
                ) : (
                  memory.slice(0, 20).map((entry) => (
                    <div key={entry.id} className="p-3 border rounded text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-3 w-3" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {entry.user_message && (
                        <div className="mb-1">
                          <span className="font-medium text-xs">User:</span>
                          <div className="text-xs">{entry.user_message}</div>
                        </div>
                      )}
                      {entry.agent_response && (
                        <div>
                          <span className="font-medium text-xs">Agent:</span>
                          <div className="text-xs">{entry.agent_response}</div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

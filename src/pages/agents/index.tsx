import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast-container"
import { Plus } from "lucide-react"
import { AgentCard } from "@/components/ui/agent-card"
import { useNavigate } from "react-router-dom"
import { useSocket } from "@/hooks/useSocket"
import {
  listAgents,
  createAgent,
  startAgent,
  stopAgent,
  Agent,
  CreateAgentData,
} from "@/services/agent"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newAgentName, setNewAgentName] = useState("")
  const [newAgentDescription, setNewAgentDescription] = useState("")
  const [newAgentColor, setNewAgentColor] = useState(generateNiceRandomHexColor())
  const [newAgentLabel, setNewAgentLabel] = useState("")
  const [newAgentProvider, setNewAgentProvider] = useState<'anthropic' | 'openai' | 'ollama'>('anthropic')
  const [newAgentModel, setNewAgentModel] = useState("")
  const [newAgentConnectorConfig, setNewAgentConnectorConfig] = useState({
    apiKey: "",
    host: "",
    maxTokens: 4096,
    temperature: 0.7
  })
  const [isCreating, setIsCreating] = useState(false)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const socket = useSocket()

  // Default models for reference
  const defaultModels = {
    anthropic: 'claude-3-5-sonnet-20241022',
    openai: 'gpt-4o',
    ollama: 'qwen2.5-coder:latest'
  }

  useEffect(() => {
    // Set default model when provider changes
    setNewAgentModel(defaultModels[newAgentProvider])
    // Reset connector config when provider changes
    setNewAgentConnectorConfig({
      apiKey: "",
      host: newAgentProvider === 'ollama' ? 'http://localhost:11434' : "",
      maxTokens: 4096,
      temperature: 0.7
    })
  }, [newAgentProvider])

  useEffect(() => {
    const loadAgents = async () => {
      try {
        setIsLoading(true)
        const agentsData = await listAgents()
        setAgents(agentsData)
        setError(null)
      } catch (err) {
        console.error('Agent fetch error:', err);
        let errorMessage = 'Failed to fetch agents';

        if (err instanceof Error) {
          errorMessage = err.message;
        } else if (typeof err === 'object' && err !== null) {
          const errorObj = err as any;
          errorMessage = errorObj.message ||
                       errorObj.error ||
                       errorObj.payload?.message ||
                       errorObj.payload?.error ||
                       errorObj.statusText ||
                       'Failed to fetch agents';
        }

        setError(errorMessage)
        showToast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive'
        })
      } finally {
        setIsLoading(false)
      }
    }
    loadAgents()

    if (socket) {
      socket.emit('subscribe', { topic: 'agent' })

      socket.on('agent:status:changed', (data: { agentId: string; status: string; isActive: boolean }) => {
        setAgents(prev => prev.map(agent =>
          agent.id === data.agentId ? { ...agent, status: data.status as any, isActive: data.isActive } : agent
        ))
      })

      socket.on('agent:created', (data: { agent: Agent }) => {
        setAgents(prev => [...prev, data.agent])
      })

      socket.on('agent:deleted', (data: { agentId: string }) => {
        setAgents(prev => prev.filter(agent => agent.id !== data.agentId))
      })
    }

    return () => {
      if (socket) {
        socket.emit('unsubscribe', { topic: 'agent' })
        socket.off('agent:status:changed')
        socket.off('agent:created')
        socket.off('agent:deleted')
      }
    }
  }, [socket])

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAgentName.trim()) return

    setIsCreating(true)
    try {
      const agentData: CreateAgentData = {
        name: newAgentName,
        label: newAgentLabel || newAgentName,
        description: newAgentDescription || undefined,
        color: newAgentColor,
        llmProvider: newAgentProvider,
        model: newAgentModel,
        config: {
          type: newAgentProvider,
          model: newAgentModel
        },
        connectors: {
          [newAgentProvider]: {
            ...newAgentConnectorConfig,
            // Clean up empty values
            ...(newAgentConnectorConfig.apiKey ? { apiKey: newAgentConnectorConfig.apiKey } : {}),
            ...(newAgentConnectorConfig.host ? { host: newAgentConnectorConfig.host } : {}),
            maxTokens: newAgentConnectorConfig.maxTokens,
            temperature: newAgentConnectorConfig.temperature
          }
        },
        mcp: {
          enabled: true,
          servers: [
            // Include default weather MCP server
            {
              name: 'weather',
              command: 'node',
              args: ['src/managers/agent/mcp-servers/weather.js']
            }
          ]
        }
      }

      const newAgent = await createAgent(agentData)
      setAgents(prev => [...prev, newAgent])
      setNewAgentName("")
      setNewAgentDescription("")
      setNewAgentColor(generateNiceRandomHexColor())
      setNewAgentLabel("")
      setNewAgentConnectorConfig({
        apiKey: "",
        host: newAgentProvider === 'ollama' ? 'http://localhost:11434' : "",
        maxTokens: 4096,
        temperature: 0.7
      })
      showToast({
        title: 'Success',
        description: `Agent '${newAgent.label || newAgent.name}' created.`
      })
    } catch (err) {
      console.error('Agent creation error:', err);
      let errorMessage = 'Failed to create agent';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const errorObj = err as any;
        errorMessage = errorObj.message ||
                     errorObj.error ||
                     errorObj.payload?.message ||
                     errorObj.payload?.error ||
                     errorObj.statusText ||
                     'Failed to create agent';
      }

      showToast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleStartAgent = async (agentName: string) => {
    try {
      const updatedAgent = await startAgent(agentName)
      setAgents(prev => prev.map(agent => agent.name === updatedAgent.name ? updatedAgent : agent))
      showToast({
        title: 'Success',
        description: `Agent '${updatedAgent.label || updatedAgent.name}' started.`
      })
    } catch (err) {
      console.error('Agent start error:', err);
      let errorMessage = 'Failed to start agent';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const errorObj = err as any;
        errorMessage = errorObj.message ||
                     errorObj.error ||
                     errorObj.payload?.message ||
                     errorObj.payload?.error ||
                     errorObj.statusText ||
                     'Failed to start agent';
      }

      showToast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    }
  }

  const handleStopAgent = async (agentName: string) => {
    try {
      await stopAgent(agentName)
      // Update agent status to inactive
      setAgents(prev => prev.map(agent =>
        agent.name === agentName ? { ...agent, status: 'inactive', isActive: false } : agent
      ))
      showToast({
        title: 'Success',
        description: `Agent '${agentName}' stopped.`
      })
    } catch (err) {
      console.error('Agent stop error:', err);
      let errorMessage = 'Failed to stop agent';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const errorObj = err as any;
        errorMessage = errorObj.message ||
                     errorObj.error ||
                     errorObj.payload?.message ||
                     errorObj.payload?.error ||
                     errorObj.statusText ||
                     'Failed to stop agent';
      }

      showToast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    }
  }

  const handleEnterAgent = (agentName: string) => {
    navigate(`/agents/${agentName}`)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">AI Agents</h1>
        <p className="text-muted-foreground mt-2">Create and manage your AI agents with multiple LLM providers</p>
      </div>

      {/* Create New Agent Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Create New Agent</h2>
        <form onSubmit={handleCreateAgent} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              placeholder="Agent Name (e.g., 'my-assistant')"
              disabled={isCreating}
            />
            <Input
              value={newAgentLabel}
              onChange={(e) => setNewAgentLabel(e.target.value)}
              placeholder="Agent Label (display name, optional)"
              disabled={isCreating}
            />
          </div>
          <Input
            value={newAgentDescription}
            onChange={(e) => setNewAgentDescription(e.target.value)}
            placeholder="Description (optional)"
            disabled={isCreating}
          />

          {/* LLM Provider and Model Selection */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="agent-provider" className="text-sm font-medium">LLM Provider</label>
              <select
                id="agent-provider"
                value={newAgentProvider}
                onChange={(e) => setNewAgentProvider(e.target.value as 'anthropic' | 'openai' | 'ollama')}
                className="w-full mt-1 px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isCreating}
              >
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI GPT</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
            </div>
            <div>
              <label htmlFor="agent-model" className="text-sm font-medium">Model</label>
              <Input
                id="agent-model"
                value={newAgentModel}
                onChange={(e) => setNewAgentModel(e.target.value)}
                placeholder="Model name (e.g., 'gpt-4o')"
                disabled={isCreating}
              />
            </div>
          </div>

          {/* Connector Configuration */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="api-key" className="text-sm font-medium">API Key (Optional)</label>
              <Input
                id="api-key"
                type="password"
                value={newAgentConnectorConfig.apiKey}
                onChange={(e) => setNewAgentConnectorConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Enter your API key"
                disabled={isCreating}
              />
            </div>
            <div>
              <label htmlFor="host" className="text-sm font-medium">Host (Optional)</label>
              <Input
                id="host"
                value={newAgentConnectorConfig.host}
                onChange={(e) => setNewAgentConnectorConfig(prev => ({ ...prev, host: e.target.value }))}
                placeholder="Enter your host (e.g., http://localhost:11434)"
                disabled={isCreating}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="agent-color" className="text-sm font-medium">Agent Color</label>
            <Input
              id="agent-color"
              type="color"
              value={newAgentColor}
              onChange={(e) => setNewAgentColor(e.target.value)}
              className="h-10 w-16 p-1"
              disabled={isCreating}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNewAgentColor(generateNiceRandomHexColor())}
              disabled={isCreating}
            >
              Randomize
            </Button>
          </div>
          <Button type="submit" disabled={isCreating || !newAgentName.trim()}>
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Button>
        </form>
      </div>

      {/* Your Agents Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Agents</h2>

        {isLoading && <p className="text-center text-muted-foreground">Loading agents...</p>}

        {error && (
          <div className="text-center text-destructive">
            <p>{error}</p>
          </div>
        )}

        {!isLoading && !error && agents.length === 0 && (
          <p className="text-center text-muted-foreground">No agents found</p>
        )}

        {agents.length > 0 && (
          <div className="grid gap-4">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onStart={handleStartAgent}
                onStop={handleStopAgent}
                onEnter={handleEnterAgent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Color Utility Functions
const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const generateRandomHsl = (): { h: number, s: number, l: number } => {
  const h = randomInt(0, 360);
  const s = randomInt(42, 98);
  const l = randomInt(40, 90);
  return { h, s, l };
};

const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;

  let c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs((h / 60) % 2 - 1)),
    m = l - c / 2,
    r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  const toHex = (val: number): string => {
    const hex = val.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const generateNiceRandomHexColor = (): string => {
  const { h, s, l } = generateRandomHsl();
  return hslToHex(h, s, l);
};

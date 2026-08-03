import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { M2Header } from '@/components/menu/shared/M2Header'
import { useMenu } from '@/components/shell/menu-context'
import { generateNiceRandomHexColor } from '@/utils/color'
import {
  createAgent,
  deleteAgent,
  getAgent,
  installAgentSkill,
  listAgentSkills,
  removeAgentSkill,
  updateAgent,
  type Agent,
  type AgentSkill,
  type CreateAgentData,
} from '@/services/agent'
import { useLocation, useNavigate } from 'react-router-dom'

type SettingsTab = 'identity' | 'provider' | 'models' | 'tools' | 'memory' | 'integrations'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'provider', label: 'Provider' },
  { id: 'models', label: 'Models' },
  { id: 'tools', label: 'Tools' },
  { id: 'memory', label: 'Memory' },
  { id: 'integrations', label: 'Integrations' },
]

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o',
  ollama: 'qwen2.5-coder:latest',
  'lm-studio': '',
  vllm: '',
  custom: '',
}

const DEFAULT_PROVIDER_BASE_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434/v1',
  'lm-studio': 'http://localhost:1234/v1',
  vllm: 'http://localhost:8000/v1',
  custom: '',
}

function getDefaultProviderBaseUrl(provider: string) {
  return DEFAULT_PROVIDER_BASE_URLS[provider] || ''
}

function buildSystemPrompt(role: string, identity: string, instructions: string) {
  const sections = [
    role.trim() ? `## Role\n${role.trim()}` : '',
    identity.trim() ? `## Identity\n${identity.trim()}` : '',
    instructions.trim() ? `## Instructions\n${instructions.trim()}` : '',
  ].filter(Boolean)

  return sections.join('\n\n')
}

export function AgentM2Settings() {
  const { state, closeM2 } = useMenu()
  const entityId = state.selectedEntityId
  const isCreate = !entityId
  const { showToast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<SettingsTab>('identity')
  const [agent, setAgent] = useState<Agent | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Identity fields
  const [idName, setIdName] = useState('')
  const [idLabel, setIdLabel] = useState('')
  const [idDescription, setIdDescription] = useState('')
  const [idColor, setIdColor] = useState(generateNiceRandomHexColor())
  const [idRole, setIdRole] = useState('')
  const [idIdentity, setIdIdentity] = useState('')
  const [idInstructions, setIdInstructions] = useState('')
  const [idSystemPrompt, setIdSystemPrompt] = useState('')

  // Provider fields
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'ollama' | 'lm-studio' | 'vllm' | 'custom'>('anthropic')
  const [providerApiKey, setProviderApiKey] = useState('')
  const [providerHost, setProviderHost] = useState('')

  // Model fields (main model only; others are placeholders)
  const [mainModel, setMainModel] = useState('')
  const [mainTemp, setMainTemp] = useState(0.7)
  const [mainMaxTokens, setMainMaxTokens] = useState(4096)
  const [mainTopP, setMainTopP] = useState(1.0)

  // Skill fields
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [skillContent, setSkillContent] = useState('')
  const [skillSource, setSkillSource] = useState('')
  const [isSkillSaving, setIsSkillSaving] = useState(false)
  const [deletingSkill, setDeletingSkill] = useState<string | null>(null)

  useEffect(() => {
    if (isCreate) return
    if (!entityId) return
    getAgent(entityId).then(async a => {
      const identity = a.config?.identity || {}
      setAgent(a)
      setIdName(a.name || '')
      setIdLabel(a.label || '')
      setIdDescription(a.description || '')
      setIdColor(a.color || generateNiceRandomHexColor())
      setIdRole(identity.role || '')
      setIdIdentity(identity.identity || '')
      setIdInstructions(identity.instructions || '')
      setIdSystemPrompt(a.config?.prompts?.system || '')
      setProvider(a.llmProvider as any || 'anthropic')
      setProviderApiKey(a.config?.apiKey || '')
      setProviderHost(a.config?.baseUrl || getDefaultProviderBaseUrl(a.llmProvider))
      setMainModel(a.model || DEFAULT_MODELS[a.llmProvider as keyof typeof DEFAULT_MODELS] || '')
      const conn = a.config?.connectors?.[a.llmProvider]
      if (conn) {
        setMainTemp(conn.temperature ?? 0.7)
        setMainMaxTokens(conn.maxTokens ?? 4096)
        setMainTopP(conn.topP ?? 1.0)
      }
      setSkills(await listAgentSkills(entityId))
    }).catch(() => showToast({ title: 'Error', description: 'Failed to load agent', variant: 'destructive' }))
  }, [entityId])

  const buildPayload = (): Partial<CreateAgentData> => {
    const compiledSystemPrompt = buildSystemPrompt(idRole, idIdentity, idInstructions)

    return {
      name: idName.trim(),
      label: idLabel.trim(),
      description: idDescription.trim() || undefined,
      color: idColor,
      llmProvider: provider,
      model: mainModel,
      apiKey: providerApiKey || undefined,
      baseUrl: providerHost || undefined,
      config: {
        type: provider,
        model: mainModel,
        identity: {
          role: idRole.trim() || undefined,
          identity: idIdentity.trim() || undefined,
          instructions: idInstructions.trim() || undefined,
        },
        prompts: (idSystemPrompt.trim() || compiledSystemPrompt) ? {
          system: idSystemPrompt.trim() || compiledSystemPrompt,
        } : undefined,
        connectors: {
          [provider]: {
            temperature: mainTemp,
            maxTokens: mainMaxTokens,
            topP: mainTopP,
          },
        },
      },
    }
  }

  const buildCreatePayload = (): CreateAgentData => ({
    name: idName.trim(),
    ...buildPayload() as any,
  })

  const handleSave = async () => {
    if (!entityId) return
    setIsSaving(true)
    try {
      const updatedAgent = await updateAgent(entityId, buildPayload())
      setAgent(updatedAgent)
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Saved', description: 'Agent updated' })
      if (updatedAgent.name && updatedAgent.name !== agent?.name && location.pathname.startsWith('/agents/')) {
        navigate(`/agents/${encodeURIComponent(updatedAgent.name)}/settings`, { replace: true })
      }
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreate = async () => {
    if (!idName.trim()) return
    setIsSaving(true)
    try {
      await createAgent(buildCreatePayload())
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Created', description: `Agent "${idLabel || idName}" created` })
      closeM2()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Create failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!entityId) return
    if (!window.confirm(`Delete agent "${agent?.label || agent?.name}"? This cannot be undone.`)) return
    setIsDeleting(true)
    try {
      await deleteAgent(entityId)
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Deleted', description: 'Agent removed' })
      closeM2()
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const resetSkillForm = () => {
    setSkillName('')
    setSkillDescription('')
    setSkillContent('')
    setSkillSource('')
  }

  const handleEditSkill = (skill: AgentSkill) => {
    setSkillName(skill.name)
    setSkillDescription(skill.description || '')
    setSkillContent(skill.content || '')
    setSkillSource(skill.source || '')
  }

  const handleInstallSkill = async () => {
    if (!entityId || (!skillSource.trim() && !skillContent.trim())) return
    setIsSkillSaving(true)
    try {
      const nextSkills = await installAgentSkill(entityId, skillSource.trim()
        ? { source: skillSource.trim() }
        : {
          name: skillName,
          description: skillDescription,
          content: skillContent,
        })
      setSkills(nextSkills)
      resetSkillForm()
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Installed', description: 'Skill saved' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Skill install failed', variant: 'destructive' })
    } finally {
      setIsSkillSaving(false)
    }
  }

  const handleRemoveSkill = async (name: string) => {
    if (!entityId) return
    setDeletingSkill(name)
    try {
      const nextSkills = await removeAgentSkill(entityId, name)
      setSkills(nextSkills)
      if (skillName === name || skillSource === name) resetSkillForm()
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Removed', description: `Skill "${name}" removed` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Skill remove failed', variant: 'destructive' })
    } finally {
      setDeletingSkill(null)
    }
  }

  const handleBack = () => {
    const routeAgentId = agent?.name || entityId
    if (routeAgentId && location.pathname.endsWith('/settings')) {
      navigate(`/agents/${encodeURIComponent(routeAgentId)}`)
      return
    }
    closeM2()
  }

  return (
    <div className="flex flex-col h-full">
      <M2Header
        title={isCreate ? 'New Agent' : (agent?.label || agent?.name || entityId || 'Agent')}
        onBack={handleBack}
      />

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-border shrink-0 scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-colors shrink-0',
              tab === t.id
                ? 'text-foreground border-b-2 border-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'identity' && (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={idName} onChange={e => setIdName(e.target.value)} placeholder="lucy" className="mt-1 h-8 text-sm" />
              {!isCreate && (
                <div className="mt-1 text-[10px] text-muted-foreground">ID: <span className="font-mono">{agent?.id || entityId}</span></div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Label</label>
              <Input value={idLabel} onChange={e => setIdLabel(e.target.value)} placeholder="Display name" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input value={idDescription} onChange={e => setIdDescription(e.target.value)} placeholder="Short description" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <div className="mt-1 flex gap-2">
                <Input type="color" value={idColor} onChange={e => setIdColor(e.target.value)} className="h-8 w-14 p-1" />
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIdColor(generateNiceRandomHexColor())}>Random</Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Input value={idRole} onChange={e => setIdRole(e.target.value)} placeholder="e.g. Software Engineer" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Identity</label>
              <textarea
                value={idIdentity}
                onChange={e => setIdIdentity(e.target.value)}
                placeholder="Who this agent is…"
                className="mt-1 w-full px-2 py-1.5 border border-input bg-background rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-ring min-h-[60px] resize-y"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Instructions</label>
              <textarea
                value={idInstructions}
                onChange={e => setIdInstructions(e.target.value)}
                placeholder="Behavioral instructions…"
                className="mt-1 w-full px-2 py-1.5 border border-input bg-background rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-ring min-h-[60px] resize-y"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">System Prompt</label>
              <p className="text-[10px] text-muted-foreground mb-1">Compiled from Role + Identity + Instructions. Override manually.</p>
              <textarea
                value={idSystemPrompt}
                onChange={e => setIdSystemPrompt(e.target.value)}
                placeholder="System prompt sent to the LLM…"
                className="w-full px-2 py-1.5 border border-input bg-background rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-y font-mono"
              />
            </div>
          </div>
        )}

        {tab === 'provider' && (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Provider</label>
              <select
                value={provider}
                onChange={e => {
                  const p = e.target.value as typeof provider
                  setProvider(p)
                  setMainModel(DEFAULT_MODELS[p] || '')
                  setProviderHost(getDefaultProviderBaseUrl(p))
                }}
                className="mt-1 w-full h-8 px-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI GPT</option>
                <option value="ollama">Ollama (Local)</option>
                <option value="lm-studio">LM Studio (Local)</option>
                <option value="vllm">vLLM (Local)</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                API Key{['ollama', 'lm-studio', 'vllm'].includes(provider) && ' (any value works for local providers)'}
              </label>
              <Input
                type="password"
                value={providerApiKey}
                onChange={e => setProviderApiKey(e.target.value)}
                placeholder={provider === 'ollama' ? 'ollama' : provider === 'lm-studio' ? 'lm-studio' : 'sk-…'}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Host / Base URL</label>
              <Input
                value={providerHost}
                onChange={e => setProviderHost(e.target.value)}
                placeholder={
                  getDefaultProviderBaseUrl(provider) || 'https://api.example.com'
                }
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>
        )}

        {tab === 'models' && (
          <div className="p-4 space-y-4">
            <div>
              <div className="text-xs font-semibold mb-2">Main Model</div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Model</label>
                  <Input value={mainModel} onChange={e => setMainModel(e.target.value)} placeholder="Model name" className="mt-1 h-8 text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Temp</label>
                    <Input type="number" min={0} max={2} step={0.1} value={mainTemp} onChange={e => setMainTemp(parseFloat(e.target.value) || 0.7)} className="mt-1 h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Max Tokens</label>
                    <Input type="number" min={1} max={200000} value={mainMaxTokens} onChange={e => setMainMaxTokens(parseInt(e.target.value) || 4096)} className="mt-1 h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Top P</label>
                    <Input type="number" min={0} max={1} step={0.1} value={mainTopP} onChange={e => setMainTopP(parseFloat(e.target.value) || 1.0)} className="mt-1 h-8 text-xs" />
                  </div>
                </div>
              </div>
            </div>
            {['Governance', 'Memory Management', 'Subagent / Tool Use'].map(label => (
              <div key={label} className="border border-dashed border-border rounded-md p-3">
                <div className="text-xs font-semibold text-muted-foreground">{label} Model</div>
                <div className="text-[10px] text-muted-foreground mt-1">Coming soon</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'tools' && (
          <div className="p-4 space-y-3">
            <div>
              <div className="text-xs font-semibold">Skills</div>
              <div className="mt-2 space-y-2">
                {skills.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No skills installed</div>
                ) : (
                  skills.map(skill => (
                    <div key={skill.name} className="border border-border rounded-md p-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{skill.name}</div>
                          <div className="text-muted-foreground truncate">
                            {skill.package ? skill.source : (skill.description || 'No description')}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => handleEditSkill(skill)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={deletingSkill === (skill.source || skill.name)}
                            onClick={() => handleRemoveSkill(skill.source || skill.name)}
                          >
                            {deletingSkill === (skill.source || skill.name) ? 'Removing…' : 'Remove'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {!isCreate && (
                <div className="mt-3 space-y-2 rounded-md border border-border p-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Package Source</label>
                    <Input
                      value={skillSource}
                      onChange={e => setSkillSource(e.target.value)}
                      placeholder="npm:@foo/pi-tools or git:github.com/badlogic/pi-doom"
                      className="mt-1 h-8 text-sm"
                    />
                    <div className="mt-1 text-[10px] text-muted-foreground">Use this for whole pi packages. Leave empty to save inline SKILL.md content.</div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input value={skillName} onChange={e => setSkillName(e.target.value)} placeholder="skill-name, or read from frontmatter" className="mt-1 h-8 text-sm" disabled={Boolean(skillSource.trim())} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <Input value={skillDescription} onChange={e => setSkillDescription(e.target.value)} placeholder="What this skill helps with" className="mt-1 h-8 text-sm" disabled={Boolean(skillSource.trim())} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">SKILL.md Content</label>
                    <textarea
                      value={skillContent}
                      onChange={e => setSkillContent(e.target.value)}
                      placeholder="# Skill instructions…"
                      disabled={Boolean(skillSource.trim())}
                      className="mt-1 w-full px-2 py-1.5 border border-input bg-background rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-ring min-h-[120px] resize-y font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={isSkillSaving || (!skillSource.trim() && !skillContent.trim())}
                      onClick={handleInstallSkill}
                    >
                      {isSkillSaving ? 'Saving…' : 'Install / Update Skill'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={resetSkillForm}>
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs font-semibold">MCP Servers</div>
            {(agent?.config?.mcp?.servers || []).length === 0 ? (
              <div className="text-xs text-muted-foreground">No MCP servers configured</div>
            ) : (
              (agent?.config?.mcp?.servers || []).map((s, i) => (
                <div key={i} className="border border-border rounded-md p-2 text-xs">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-muted-foreground font-mono">{s.command} {(s.args || []).join(' ')}</div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'memory' && (
          <div className="p-4">
            <div className="border border-dashed border-border rounded-md p-4 text-center">
              <div className="text-xs font-medium text-muted-foreground">Memory Engine</div>
              <div className="text-[10px] text-muted-foreground mt-1">Loop-based memory management. Settings coming soon.</div>
            </div>
          </div>
        )}

        {tab === 'integrations' && (
          <div className="p-4">
            <div className="border border-dashed border-border rounded-md p-4 text-center">
              <div className="text-xs font-medium text-muted-foreground">Integrations</div>
              <div className="text-[10px] text-muted-foreground mt-1">IMAP, chat, SQL, REST API accounts. Coming soon.</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-3 border-t border-border shrink-0 space-y-2">
        <Button
          type="button"
          className="w-full h-8 text-sm"
          disabled={isSaving || (isCreate && !idName.trim())}
          onClick={isCreate ? handleCreate : handleSave}
        >
          {isSaving ? (isCreate ? 'Creating…' : 'Saving…') : (isCreate ? 'Create Agent' : 'Save Changes')}
        </Button>
        {!isCreate && (
          <Button type="button" variant="destructive" className="w-full h-8 text-sm" disabled={isDeleting} onClick={handleDelete}>
            {isDeleting ? 'Deleting…' : 'Delete Agent'}
          </Button>
        )}
      </div>
    </div>
  )
}

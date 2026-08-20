import { useIsMobile } from '@/hooks/use-mobile'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/common/page-header'
import { useToast } from '@/components/ui/use-toast'
import { useMenu } from '@/components/shell/use-menu'
import { generateNiceRandomHexColor } from '@/utils/color'
import {
  AGENT_SETTINGS_SECTIONS,
  resolveAgentSettingsTab,
  type AgentSettingsTab,
} from '@/lib/settings-sections'
import {
  deleteAgent,
  getAgent,
  getAgentAccess,
  installAgentSkill,
  listAgentSkills,
  removeAgentSkill,
  revokeAgentAccess,
  rotateAgentAccessToken,
  setAgentAccess,
  updateAgent,
  type Agent,
  type AgentAccess,
  type AgentBinding,
  type AgentSkill,
  type CreateAgentData,
} from '@/services/agent'
import { listContexts } from '@/services/context'
import { listWorkspaces } from '@/services/workspace'

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
  return [
    role.trim() ? `## Role\n${role.trim()}` : '',
    identity.trim() ? `## Identity\n${identity.trim()}` : '',
    instructions.trim() ? `## Instructions\n${instructions.trim()}` : '',
  ].filter(Boolean).join('\n\n')
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="mb-1 mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className={hint ? undefined : 'mt-1'}>{children}</div>
    </div>
  )
}

const TEXTAREA_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y'

const SELECT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

// Agent settings, shaped exactly like workspace settings: the section list is
// in M2, one section renders here, and the page owns the save action.
export default function AgentSettingsPage() {
  const { agentId, tab } = useParams<{ agentId: string; tab?: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { selectEntity, openM2Drawer } = useMenu()
  const isMobile = useIsMobile()

  const activeTab: AgentSettingsTab = resolveAgentSettingsTab(tab)
  useEffect(() => {
    if (tab !== activeTab && agentId) {
      navigate(`/agents/${encodeURIComponent(agentId)}/settings/${activeTab}`, { replace: true })
    }
  }, [tab, activeTab, agentId, navigate])

  const [agent, setAgent] = useState<Agent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Identity
  const [idName, setIdName] = useState('')
  const [idLabel, setIdLabel] = useState('')
  const [idDescription, setIdDescription] = useState('')
  const [idColor, setIdColor] = useState(generateNiceRandomHexColor())
  const [idRole, setIdRole] = useState('')
  const [idIdentity, setIdIdentity] = useState('')
  const [idInstructions, setIdInstructions] = useState('')
  const [idSystemPrompt, setIdSystemPrompt] = useState('')

  // Provider
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'ollama' | 'lm-studio' | 'vllm' | 'custom'>('anthropic')
  const [providerApiKey, setProviderApiKey] = useState('')
  const [providerHost, setProviderHost] = useState('')

  // Models
  const [mainModel, setMainModel] = useState('')
  const [mainTemp, setMainTemp] = useState(0.7)
  const [mainMaxTokens, setMainMaxTokens] = useState(4096)
  const [mainTopP, setMainTopP] = useState(1.0)

  // Skills
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [skillContent, setSkillContent] = useState('')
  const [skillSource, setSkillSource] = useState('')
  const [isSkillSaving, setIsSkillSaving] = useState(false)
  const [deletingSkill, setDeletingSkill] = useState<string | null>(null)

  // Access / ACL — manages its own writes (bind/rotate/revoke apply
  // immediately), like skills, so it stays outside the Save Changes payload.
  const [access, setAccess] = useState<AgentAccess | null>(null)
  // Derived rather than set in the effect (react-hooks/set-state-in-effect).
  const [accessLoadedFor, setAccessLoadedFor] = useState<string | null>(null)
  const [accessBusy, setAccessBusy] = useState(false)
  // Token minted by bind/rotate — the server stores only the hash, so this is
  // the single chance to copy it.
  const [mintedToken, setMintedToken] = useState<string | null>(null)
  const [bindType, setBindType] = useState<AgentBinding['type']>('context')
  const [bindWorkspace, setBindWorkspace] = useState('')
  const [bindPath, setBindPath] = useState('/')
  const [bindContext, setBindContext] = useState('')
  const [permRead, setPermRead] = useState(true)
  const [permWrite, setPermWrite] = useState(false)
  const [workspaceOptions, setWorkspaceOptions] = useState<Awaited<ReturnType<typeof listWorkspaces>>>([])
  const [contextOptions, setContextOptions] = useState<Awaited<ReturnType<typeof listContexts>>>([])

  // Switching agents while settings are open resets to a loading state during
  // render, so the previous agent's values never show under the new name.
  const [loadingFor, setLoadingFor] = useState(agentId)
  if (loadingFor !== agentId) {
    setLoadingFor(agentId)
    setIsLoading(true)
    setAgent(null)
  }

  useEffect(() => {
    if (!agentId) return
    let cancelled = false
    getAgent(agentId).then(async a => {
      if (cancelled) return
      const identity = a.config?.identity || {}
      setAgent(a)
      selectEntity(a.id)
      setIdName(a.name || '')
      setIdLabel(a.label || '')
      setIdDescription(a.description || '')
      setIdColor(a.color || generateNiceRandomHexColor())
      setIdRole(identity.role || '')
      setIdIdentity(identity.identity || '')
      setIdInstructions(identity.instructions || '')
      setIdSystemPrompt(a.config?.prompts?.system || '')
      setProvider((a.llmProvider as typeof provider) || 'anthropic')
      setProviderApiKey(a.config?.apiKey || '')
      setProviderHost(a.config?.baseUrl || getDefaultProviderBaseUrl(a.llmProvider))
      setMainModel(a.model || DEFAULT_MODELS[a.llmProvider as keyof typeof DEFAULT_MODELS] || '')
      const conn = a.config?.connectors?.[a.llmProvider]
      if (conn) {
        setMainTemp(conn.temperature ?? 0.7)
        setMainMaxTokens(conn.maxTokens ?? 4096)
        setMainTopP(conn.topP ?? 1.0)
      }
      setError(null)
      try {
        setSkills(await listAgentSkills(a.id))
      } catch {
        setSkills([])
      }
    }).catch(err => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : 'Failed to load agent')
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [agentId, selectEntity])

  // Load the binding + picker options lazily when the Access tab opens.
  useEffect(() => {
    if (activeTab !== 'access' || !agent?.id) return
    const forAgentId = agent.id
    let cancelled = false
    Promise.all([
      getAgentAccess(agent.id).catch(() => null),
      listWorkspaces().catch(() => []),
      listContexts().catch(() => []),
    ]).then(([acc, ws, ctxs]) => {
      if (cancelled) return
      setAccess(acc)
      setWorkspaceOptions(ws)
      setContextOptions(ctxs)
      if (acc) {
        setBindType(acc.binding.type)
        setBindWorkspace(acc.binding.workspace || '')
        setBindPath(acc.binding.path || '/')
        setBindContext(acc.binding.context || '')
        setPermRead(acc.permissions.includes('read'))
        setPermWrite(acc.permissions.includes('write'))
      }
      setAccessLoadedFor(forAgentId)
    })
    return () => { cancelled = true }
  }, [activeTab, agent?.id])

  const buildPayload = (): Partial<CreateAgentData> => {
    const compiled = buildSystemPrompt(idRole, idIdentity, idInstructions)
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
        prompts: (idSystemPrompt.trim() || compiled) ? { system: idSystemPrompt.trim() || compiled } : undefined,
        connectors: {
          [provider]: { temperature: mainTemp, maxTokens: mainMaxTokens, topP: mainTopP },
        },
      },
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agent) return
    setIsSaving(true)
    try {
      const updated = await updateAgent(agent.id, buildPayload())
      setAgent(updated)
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Saved', description: 'Agent updated' })
      if (updated.name && updated.name !== agent.name) {
        navigate(`/agents/${encodeURIComponent(updated.name)}/settings/${activeTab}`, { replace: true })
      }
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!agent) return
    if (!window.confirm(`Delete agent "${agent.label || agent.name}"? This cannot be undone.`)) return
    setIsDeleting(true)
    try {
      await deleteAgent(agent.id)
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Deleted', description: 'Agent removed' })
      navigate('/agents')
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

  const handleInstallSkill = async () => {
    if (!agent || (!skillSource.trim() && !skillContent.trim())) return
    setIsSkillSaving(true)
    try {
      const next = await installAgentSkill(agent.id, skillSource.trim()
        ? { source: skillSource.trim() }
        : { name: skillName, description: skillDescription, content: skillContent })
      setSkills(next)
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
    if (!agent) return
    setDeletingSkill(name)
    try {
      const next = await removeAgentSkill(agent.id, name)
      setSkills(next)
      if (skillName === name || skillSource === name) resetSkillForm()
      window.dispatchEvent(new CustomEvent('agents:refresh'))
      showToast({ title: 'Removed', description: `Skill "${name}" removed` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Skill remove failed', variant: 'destructive' })
    } finally {
      setDeletingSkill(null)
    }
  }

  const buildBindingSpec = (): AgentBinding | null => {
    if (bindType === 'global') return { type: 'global' }
    if (bindType === 'context') return bindContext ? { type: 'context', context: bindContext } : null
    if (!bindWorkspace) return null
    return bindType === 'path'
      ? { type: 'path', workspace: bindWorkspace, path: bindPath.trim() || '/' }
      : { type: 'workspace', workspace: bindWorkspace }
  }

  const handleBind = async () => {
    if (!agent || accessBusy) return
    const binding = buildBindingSpec()
    const permissions: Array<'read' | 'write'> = []
    if (permRead) permissions.push('read')
    if (permWrite) permissions.push('write')
    if (!binding || permissions.length === 0) {
      showToast({ title: 'Invalid binding', description: 'Pick a scope target and at least one permission', variant: 'destructive' })
      return
    }
    if (binding.type === 'global'
      && !window.confirm(`Global scope lets this agent ${permWrite ? 'read and write' : 'read'} ALL your workspaces. Continue?`)) return
    setAccessBusy(true)
    try {
      const result = await setAgentAccess(agent.id, { binding, permissions })
      setAccess(result.access)
      setMintedToken(result.token)
      showToast({ title: 'Bound', description: 'Access bound — copy the token now, it is not shown again' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Bind failed', variant: 'destructive' })
    } finally {
      setAccessBusy(false)
    }
  }

  const handleRotateToken = async () => {
    if (!agent || accessBusy) return
    setAccessBusy(true)
    try {
      const result = await rotateAgentAccessToken(agent.id)
      setAccess(result.access)
      setMintedToken(result.token)
      showToast({ title: 'Rotated', description: 'New token minted — the previous one no longer works' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Rotate failed', variant: 'destructive' })
    } finally {
      setAccessBusy(false)
    }
  }

  const handleRevokeAccess = async () => {
    if (!agent || accessBusy) return
    if (!window.confirm("Revoke this agent's canvas access? Its token stops working immediately.")) return
    setAccessBusy(true)
    try {
      await revokeAgentAccess(agent.id)
      setAccess(null)
      setMintedToken(null)
      showToast({ title: 'Revoked', description: 'Agent access removed' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Revoke failed', variant: 'destructive' })
    } finally {
      setAccessBusy(false)
    }
  }

  const describeBinding = (binding: AgentBinding) => {
    if (binding.type === 'global') return 'Global — all workspaces'
    if (binding.type === 'context') {
      const ctx = contextOptions.find(c => c.id === binding.context)
      return `Context ${ctx ? `${ctx.id} (${ctx.url})` : binding.context} — follows the context live`
    }
    const ws = binding.workspaceName || binding.workspace
    return binding.type === 'path'
      ? `Workspace ${ws}, path ${binding.path || '/'}`
      : `Workspace ${ws} (whole tree)`
  }

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  if (!agent || error) return <div className="p-6 text-sm text-destructive">{error || 'Agent not found'}</div>

  const section = AGENT_SETTINGS_SECTIONS.find(sec => sec.id === activeTab)!
  const routeAgentId = encodeURIComponent(agent.name || agent.id)
  // Only the sections that hold form fields save; the rest are read-only or
  // manage their own writes (skills install immediately).
  const savable = activeTab === 'identity' || activeTab === 'provider' || activeTab === 'models'

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl p-6 pb-12 max-md:px-4 max-md:pb-rail-stack">
        <PageHeader
          compact
          className="mb-6 border-b pb-4"
          title={`${section.label} - ${agent.label || agent.name}`}
          description={section.description}
          backTo={`/agents/${routeAgentId}`}
        // Mobile has no room for the M2 panel beside the content, so Back
        // reopens it at the section list rather than leaving settings — the
        // step the tab strip used to stand in for. On desktop M2 is already
        // visible, so Back means "leave settings".
          onBack={isMobile ? () => openM2Drawer('agents', 'settings', agent.id) : undefined}
        />

        <form onSubmit={handleSave} className="space-y-6">
          {activeTab === 'identity' && (
            <>
              <section className="space-y-4 rounded-lg border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Name" hint={`ID: ${agent.id}`}>
                    <Input value={idName} onChange={e => setIdName(e.target.value)} placeholder="lucy" />
                  </Field>
                  <Field label="Label">
                    <Input value={idLabel} onChange={e => setIdLabel(e.target.value)} placeholder="Display name" />
                  </Field>
                </div>
                <Field label="Description">
                  <Input value={idDescription} onChange={e => setIdDescription(e.target.value)} placeholder="Short description" />
                </Field>
                <Field label="Color">
                  <div className="flex items-center gap-2">
                    <Input type="color" value={idColor} onChange={e => setIdColor(e.target.value)} className="h-10 w-16 p-1" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setIdColor(generateNiceRandomHexColor())}>
                      Randomize
                    </Button>
                  </div>
                </Field>
              </section>

              <section className="space-y-4 rounded-lg border p-4">
                <h2 className="text-sm font-semibold">Persona</h2>
                <Field label="Role">
                  <Input value={idRole} onChange={e => setIdRole(e.target.value)} placeholder="e.g. Software Engineer" />
                </Field>
                <Field label="Identity">
                  <textarea
                    value={idIdentity}
                    onChange={e => setIdIdentity(e.target.value)}
                    placeholder="Who this agent is…"
                    className={`${TEXTAREA_CLASS} min-h-[80px]`}
                  />
                </Field>
                <Field label="Instructions">
                  <textarea
                    value={idInstructions}
                    onChange={e => setIdInstructions(e.target.value)}
                    placeholder="Behavioral instructions…"
                    className={`${TEXTAREA_CLASS} min-h-[80px]`}
                  />
                </Field>
                <Field label="System Prompt" hint="Compiled from Role + Identity + Instructions. Override manually.">
                  <textarea
                    value={idSystemPrompt}
                    onChange={e => setIdSystemPrompt(e.target.value)}
                    placeholder="System prompt sent to the LLM…"
                    className={`${TEXTAREA_CLASS} min-h-[140px] font-mono text-xs`}
                  />
                </Field>
              </section>

              <section className="rounded-lg border border-destructive/30 p-4">
                <h2 className="mb-3 text-sm font-semibold text-destructive">Danger Zone</h2>
                <Button type="button" variant="destructive" disabled={isDeleting} onClick={handleDelete}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isDeleting ? 'Deleting...' : 'Delete Agent'}
                </Button>
              </section>
            </>
          )}

          {activeTab === 'provider' && (
            <section className="space-y-4 rounded-lg border p-4">
              <Field label="Provider">
                <select
                  value={provider}
                  onChange={e => {
                    const p = e.target.value as typeof provider
                    setProvider(p)
                    setMainModel(DEFAULT_MODELS[p] || '')
                    setProviderHost(getDefaultProviderBaseUrl(p))
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="lm-studio">LM Studio (Local)</option>
                  <option value="vllm">vLLM (Local)</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              <Field
                label="API Key"
                hint={['ollama', 'lm-studio', 'vllm'].includes(provider) ? 'Any value works for local providers.' : undefined}
              >
                <Input
                  type="password"
                  value={providerApiKey}
                  onChange={e => setProviderApiKey(e.target.value)}
                  placeholder={provider === 'ollama' ? 'ollama' : provider === 'lm-studio' ? 'lm-studio' : 'sk-…'}
                />
              </Field>
              <Field label="Host / Base URL">
                <Input
                  value={providerHost}
                  onChange={e => setProviderHost(e.target.value)}
                  placeholder={getDefaultProviderBaseUrl(provider) || 'https://api.example.com'}
                />
              </Field>
            </section>
          )}

          {activeTab === 'models' && (
            <>
              <section className="space-y-4 rounded-lg border p-4">
                <h2 className="text-sm font-semibold">Main Model</h2>
                <Field label="Model">
                  <Input value={mainModel} onChange={e => setMainModel(e.target.value)} placeholder="Model name" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Temperature">
                    <Input type="number" min={0} max={2} step={0.1} value={mainTemp} onChange={e => setMainTemp(parseFloat(e.target.value) || 0.7)} />
                  </Field>
                  <Field label="Max Tokens">
                    <Input type="number" min={1} max={200000} value={mainMaxTokens} onChange={e => setMainMaxTokens(parseInt(e.target.value) || 4096)} />
                  </Field>
                  <Field label="Top P">
                    <Input type="number" min={0} max={1} step={0.1} value={mainTopP} onChange={e => setMainTopP(parseFloat(e.target.value) || 1.0)} />
                  </Field>
                </div>
              </section>
              {['Governance', 'Memory Management', 'Subagent / Tool Use'].map(label => (
                <section key={label} className="rounded-lg border border-dashed p-4">
                  <h2 className="text-sm font-semibold text-muted-foreground">{label} Model</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Coming soon</p>
                </section>
              ))}
            </>
          )}

          {activeTab === 'tools' && (
            <>
              <section className="space-y-3 rounded-lg border p-4">
                <div>
                  <h2 className="text-sm font-semibold">Skills</h2>
                  <p className="text-xs text-muted-foreground">Installed skills are saved immediately, independent of Save Changes.</p>
                </div>
                {skills.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No skills installed.</div>
                ) : skills.map(skill => (
                  <div key={skill.name} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{skill.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {skill.package ? skill.source : (skill.description || 'No description')}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSkillName(skill.name)
                          setSkillDescription(skill.description || '')
                          setSkillContent(skill.content || '')
                          setSkillSource(skill.source || '')
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deletingSkill === (skill.source || skill.name)}
                        onClick={() => handleRemoveSkill(skill.source || skill.name)}
                      >
                        {deletingSkill === (skill.source || skill.name) ? 'Removing…' : 'Remove'}
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="space-y-4 rounded-md border p-4">
                  <Field label="Package Source" hint="Use this for whole pi packages. Leave empty to save inline SKILL.md content.">
                    <Input
                      value={skillSource}
                      onChange={e => setSkillSource(e.target.value)}
                      placeholder="npm:@foo/pi-tools or git:github.com/badlogic/pi-doom"
                    />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Name">
                      <Input value={skillName} onChange={e => setSkillName(e.target.value)} placeholder="skill-name, or read from frontmatter" disabled={Boolean(skillSource.trim())} />
                    </Field>
                    <Field label="Description">
                      <Input value={skillDescription} onChange={e => setSkillDescription(e.target.value)} placeholder="What this skill helps with" disabled={Boolean(skillSource.trim())} />
                    </Field>
                  </div>
                  <Field label="SKILL.md Content">
                    <textarea
                      value={skillContent}
                      onChange={e => setSkillContent(e.target.value)}
                      placeholder="# Skill instructions…"
                      disabled={Boolean(skillSource.trim())}
                      className={`${TEXTAREA_CLASS} min-h-[160px] font-mono text-xs`}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={isSkillSaving || (!skillSource.trim() && !skillContent.trim())}
                      onClick={handleInstallSkill}
                    >
                      {isSkillSaving ? 'Saving…' : 'Install / Update Skill'}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetSkillForm}>Clear</Button>
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border p-4">
                <h2 className="text-sm font-semibold">MCP Servers</h2>
                {(agent.config?.mcp?.servers || []).length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No MCP servers configured.</div>
                ) : (agent.config?.mcp?.servers || []).map((server, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="text-sm font-medium">{server.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{server.command} {(server.args || []).join(' ')}</div>
                  </div>
                ))}
              </section>
            </>
          )}

          {activeTab === 'access' && (
            <>
              <section className="space-y-3 rounded-lg border p-4">
                <div>
                  <h2 className="text-sm font-semibold">Canvas Access</h2>
                  <p className="text-xs text-muted-foreground">
                    The agent talks to canvas through its own scoped token; the server clamps every
                    request to the binding. Bind, rotate and revoke apply immediately.
                  </p>
                </div>
                {accessLoadedFor !== agent.id ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Loading…</div>
                ) : access ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="text-sm font-medium">{describeBinding(access.binding)}</div>
                    <div className="text-xs text-muted-foreground">
                      Permissions: {access.permissions.join(', ') || 'none'}
                      {access.boundAt ? ` · bound ${new Date(access.boundAt).toLocaleString()}` : ''}
                      {access.rotatedAt ? ` · token rotated ${new Date(access.rotatedAt).toLocaleString()}` : ''}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button type="button" variant="outline" size="sm" disabled={accessBusy} onClick={handleRotateToken}>
                        Rotate Token
                      </Button>
                      <Button type="button" variant="destructive" size="sm" disabled={accessBusy} onClick={handleRevokeAccess}>
                        Revoke Access
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Unbound — this agent has no canvas access.
                  </div>
                )}
                {mintedToken && (
                  <div className="space-y-2 rounded-md border border-warning/50 bg-warning/10 p-3">
                    <div className="text-xs font-medium">Agent token — shown once, store it now</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">{mintedToken}</code>
                      <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(mintedToken)}>
                        Copy
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setMintedToken(null)}>
                        Dismiss
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      In-process agents receive it automatically (canvas.env); external runtimes
                      (agentd) take it as CANVAS_TOKEN.
                    </p>
                  </div>
                )}
              </section>

              <section className="space-y-4 rounded-lg border p-4">
                <h2 className="text-sm font-semibold">{access ? 'Rebind' : 'Bind'}</h2>
                <Field label="Scope" hint="Context bindings follow the context live; global spans all workspaces.">
                  <select value={bindType} onChange={e => setBindType(e.target.value as AgentBinding['type'])} className={SELECT_CLASS}>
                    <option value="context">Context (follows live)</option>
                    <option value="workspace">Workspace</option>
                    <option value="path">Workspace path</option>
                    <option value="global">Global (all workspaces)</option>
                  </select>
                </Field>
                {bindType === 'context' && (
                  <Field label="Context">
                    <select value={bindContext} onChange={e => setBindContext(e.target.value)} className={SELECT_CLASS}>
                      <option value="">Select a context…</option>
                      {contextOptions.map(ctx => (
                        <option key={ctx.id} value={ctx.id}>{ctx.id} — {ctx.url}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {(bindType === 'workspace' || bindType === 'path') && (
                  <Field label="Workspace">
                    <select value={bindWorkspace} onChange={e => setBindWorkspace(e.target.value)} className={SELECT_CLASS}>
                      <option value="">Select a workspace…</option>
                      {workspaceOptions.map(ws => (
                        <option key={ws.id} value={ws.name || ws.id}>{ws.label || ws.name}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {bindType === 'path' && (
                  <Field label="Base path" hint="The agent is clamped to this subtree.">
                    <Input value={bindPath} onChange={e => setBindPath(e.target.value)} placeholder="/work/projects/foo" />
                  </Field>
                )}
                <Field label="Permissions">
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={permRead} onChange={e => setPermRead(e.target.checked)} /> read
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={permWrite} onChange={e => setPermWrite(e.target.checked)} /> write
                    </label>
                  </div>
                </Field>
                <Button type="button" disabled={accessBusy} onClick={handleBind}>
                  {accessBusy ? 'Working…' : access ? 'Rebind & Mint Token' : 'Bind & Mint Token'}
                </Button>
              </section>
            </>
          )}

          {activeTab === 'memory' && (
            <section className="rounded-lg border border-dashed p-6 text-center">
              <h2 className="text-sm font-semibold text-muted-foreground">Memory Engine</h2>
              <p className="mt-1 text-xs text-muted-foreground">Loop-based memory management. Settings coming soon.</p>
            </section>
          )}

          {activeTab === 'integrations' && (
            <section className="rounded-lg border border-dashed p-6 text-center">
              <h2 className="text-sm font-semibold text-muted-foreground">Integrations</h2>
              <p className="mt-1 text-xs text-muted-foreground">IMAP, chat, SQL and REST API accounts. Coming soon.</p>
            </section>
          )}

          {savable && (
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          )}
        </form>
      </div>
    </div>
  )
}

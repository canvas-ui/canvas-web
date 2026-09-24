import {
  Boxes,
  Brain,
  Cpu,
  Database,
  HardDrive,
  KeyRound,
  Link2,
  Monitor,
  Plug,
  RefreshCw,
  Server,
  Settings2,
  Users,
  Webhook,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export interface SettingsSection<Id extends string> {
  id: Id
  label: string
  description: string
  icon: LucideIcon
}

// ─── Workspaces ──────────────────────────────────────────────────────────────

export type WorkspaceSettingsTab =
  | 'general'
  | 'data'
  | 'db'
  | 'devices'
  | 'sync'
  | 'services'
  | 'shares'
  | 'hooks'

export const WORKSPACE_SETTINGS_SECTIONS: readonly SettingsSection<WorkspaceSettingsTab>[] = [
  { id: 'general', label: 'Workspace details', description: 'Rename, change appearance or remove this workspace', icon: Settings2 },
  { id: 'data', label: 'Files & storage', description: 'Connect folders and data sources, check disk usage or restore trash', icon: HardDrive },
  { id: 'db', label: 'Search & indexing', description: 'Rebuild indexes, tune search and choose embedding models', icon: Database },
  { id: 'devices', label: 'Devices', description: 'Link devices to this workspace', icon: Monitor },
  { id: 'sync', label: 'Synchronization', description: 'Manage device copies and resolve sync conflicts', icon: RefreshCw },
  { id: 'services', label: 'Connected services', description: 'Configure Git, WebDAV, IMAP and other connectors', icon: Server },
  { id: 'shares', label: 'Sharing & permissions', description: 'Create public links and manage workspace access', icon: Link2 },
  { id: 'hooks', label: 'Automation', description: 'Run hooks in response to workspace events', icon: Webhook },
]

// Tabs that used to stand on their own. Embeddings are part of the index, and
// trash is deleted-document storage, so both folded into their owning section.
const LEGACY_WORKSPACE_TABS: Record<string, WorkspaceSettingsTab> = {
  embedding: 'db',
  trash: 'data',
}

export function resolveWorkspaceSettingsTab(tab: string | undefined): WorkspaceSettingsTab {
  if (!tab) return 'general'
  if (LEGACY_WORKSPACE_TABS[tab]) return LEGACY_WORKSPACE_TABS[tab]
  return WORKSPACE_SETTINGS_SECTIONS.some(s => s.id === tab) ? (tab as WorkspaceSettingsTab) : 'general'
}

// ─── Contexts ────────────────────────────────────────────────────────────────

// Contexts have far fewer knobs than workspaces or agents, but they use the
// same M2-nav-plus-one-pane shape so every settings surface reads alike.
export type ContextSettingsTab = 'general' | 'location' | 'shares'

export const CONTEXT_SETTINGS_SECTIONS: readonly SettingsSection<ContextSettingsTab>[] = [
  { id: 'general', label: 'Context details', description: 'Change the name, description or color, or remove this context', icon: Settings2 },
  { id: 'location', label: 'Tree & path', description: 'Choose the workspace, tree and path this context opens', icon: Link2 },
  { id: 'shares', label: 'Sharing & permissions', description: 'Choose who can access this context', icon: Users },
]

export function resolveContextSettingsTab(tab: string | undefined): ContextSettingsTab {
  if (!tab) return 'general'
  return CONTEXT_SETTINGS_SECTIONS.some(s => s.id === tab) ? (tab as ContextSettingsTab) : 'general'
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export type AgentSettingsTab =
  | 'identity'
  | 'provider'
  | 'models'
  | 'tools'
  | 'access'
  | 'memory'
  | 'integrations'

export const AGENT_SETTINGS_SECTIONS: readonly SettingsSection<AgentSettingsTab>[] = [
  { id: 'identity', label: 'Identity & instructions', description: 'Set the agent’s name, role and instructions', icon: Settings2 },
  { id: 'provider', label: 'AI connection', description: 'Connect a chat model provider and manage its credentials', icon: Plug },
  { id: 'models', label: 'Chat model', description: 'Choose the model and tune how it responds', icon: Cpu },
  { id: 'tools', label: 'Tools & skills', description: 'Choose the skills and MCP tools the agent can use', icon: Wrench },
  { id: 'access', label: 'Access & permissions', description: 'Choose which Canvas content the agent can access', icon: KeyRound },
  { id: 'memory', label: 'Memory', description: 'Configure how the agent remembers information', icon: Brain },
  { id: 'integrations', label: 'Integrations', description: 'Connect mail, chat, databases and external APIs', icon: Boxes },
]

export function resolveAgentSettingsTab(tab: string | undefined): AgentSettingsTab {
  if (!tab) return 'identity'
  return AGENT_SETTINGS_SECTIONS.some(s => s.id === tab) ? (tab as AgentSettingsTab) : 'identity'
}

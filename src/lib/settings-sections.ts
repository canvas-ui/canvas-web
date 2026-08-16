import {
  Boxes,
  Brain,
  Cpu,
  Database,
  HardDrive,
  Link2,
  Monitor,
  Plug,
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
  | 'services'
  | 'shares'
  | 'hooks'

export const WORKSPACE_SETTINGS_SECTIONS: readonly SettingsSection<WorkspaceSettingsTab>[] = [
  { id: 'general', label: 'General', description: 'Label, icon, danger zone', icon: Settings2 },
  { id: 'data', label: 'Data Backends', description: 'Sources, disk usage, trash', icon: HardDrive },
  { id: 'db', label: 'Database', description: 'Index, search tuning, embeddings', icon: Database },
  { id: 'devices', label: 'Devices', description: 'Linked devices', icon: Monitor },
  { id: 'services', label: 'Services', description: 'Connectors, Git, WebDAV, IMAP', icon: Server },
  { id: 'shares', label: 'Shares / ACL', description: 'Public links and access', icon: Link2 },
  { id: 'hooks', label: 'Hooks', description: 'Event-driven automation', icon: Webhook },
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
  { id: 'general', label: 'General', description: 'Name, description, danger zone', icon: Settings2 },
  { id: 'location', label: 'Location', description: 'Context URL and base URL', icon: Link2 },
  { id: 'shares', label: 'Shares / ACL', description: 'Who else can see this context', icon: Users },
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
  | 'memory'
  | 'integrations'

export const AGENT_SETTINGS_SECTIONS: readonly SettingsSection<AgentSettingsTab>[] = [
  { id: 'identity', label: 'Identity', description: 'Name, role, system prompt', icon: Settings2 },
  { id: 'provider', label: 'Provider', description: 'LLM provider and credentials', icon: Plug },
  { id: 'models', label: 'Models', description: 'Model and sampling parameters', icon: Cpu },
  { id: 'tools', label: 'Tools', description: 'Skills and MCP servers', icon: Wrench },
  { id: 'memory', label: 'Memory', description: 'Memory engine', icon: Brain },
  { id: 'integrations', label: 'Integrations', description: 'Mail, chat, SQL, REST', icon: Boxes },
]

export function resolveAgentSettingsTab(tab: string | undefined): AgentSettingsTab {
  if (!tab) return 'identity'
  return AGENT_SETTINGS_SECTIONS.some(s => s.id === tab) ? (tab as AgentSettingsTab) : 'identity'
}

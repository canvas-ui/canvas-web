import type { AgentToolDefinition } from '@/services/agent'

export interface AgentToolRow extends AgentToolDefinition {
  /** What the tool does to its group's subject, e.g. "find" for canvas_document_find. */
  action: string
  /** First sentence of the description. */
  summary: string
}

export interface AgentToolGroup {
  label: string
  tools: AgentToolRow[]
}

const CANVAS_GROUP_LABELS: Record<string, string> = {
  context: 'Scope',
  document: 'Documents',
  path: 'Folders',
  tree: 'Trees',
  layer: 'Layers',
  schema: 'Schemas',
  feature: 'Features and tags',
  message: 'Messages',
  notification: 'Notifications',
  workspace: 'Workspaces',
}

function firstSentence(text: string | undefined): string {
  const match = /^(.*?[.!?])(\s|$)/s.exec((text || '').trim())
  return (match ? match[1] : (text || '').trim()).replace(/\s+/g, ' ')
}

/**
 * Group an agent's tools for reading: Canvas tools are named
 * canvas_<subject>_<action> and group by subject, everything else by source.
 */
export function groupAgentTools(tools: AgentToolDefinition[]): AgentToolGroup[] {
  const groups = new Map<string, AgentToolRow[]>()
  for (const tool of tools) {
    const [, subject, action] = /^canvas_([a-z]+)(?:_(.+))?$/.exec(tool.name) || []
    const label = subject
      ? CANVAS_GROUP_LABELS[subject] || subject
      : tool.source === 'coding' ? 'Files and shell' : tool.source
    const row = { ...tool, action: (action || tool.name).replace(/_/g, ' '), summary: firstSentence(tool.description) }
    groups.set(label, [...(groups.get(label) || []), row])
  }
  return [...groups].map(([label, rows]) => ({ label, tools: rows }))
}

function parseToolsConfig(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** Canvas tools are on unless config.tools.canvas.enabled is false. */
export function canvasToolsEnabledIn(toolsJson: string): boolean {
  const canvas = parseToolsConfig(toolsJson)?.canvas as { enabled?: boolean } | undefined
  return canvas?.enabled !== false
}

export function withCanvasToolsEnabled(toolsJson: string, enabled: boolean): string {
  const config = parseToolsConfig(toolsJson) || {}
  const canvas = (config.canvas && typeof config.canvas === 'object' ? config.canvas : {}) as Record<string, unknown>
  return JSON.stringify({ ...config, canvas: { ...canvas, enabled } }, null, 2)
}

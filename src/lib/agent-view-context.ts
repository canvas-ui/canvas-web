import { buildContextBinding, type ToolboxFilters, type GeoSelection } from '../types/workspace'

/** A snapshot of the content query, not an agent authorization binding. */
export interface AgentViewContext {
  workspace: string | null
  treeNameOrId: string | null
  treeType?: string
  path: string | null
  contextId?: string | null
  scope: 'path' | 'workspace' | 'context' | 'layer'
  layerId?: string | null
  unfiledOnly?: boolean
  query: ReturnType<typeof buildContextBinding>
  timezone: string
}

export function buildAgentViewContext(
  location: Omit<AgentViewContext, 'query' | 'timezone'>,
  filters: ToolboxFilters,
  geoSelection: GeoSelection | null,
  queries: string[],
): AgentViewContext {
  return structuredClone({ ...location, query: buildContextBinding(filters, geoSelection, queries), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
}

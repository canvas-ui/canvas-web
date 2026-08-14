import { API_URL } from '@/config/api'
import { api } from '@/lib/api'

// Per-user web UI state, persisted server-side as <userHome>/<email>/config/webui.json.
// Unlike canvas metadata.ui (shared by everyone viewing that canvas) this is the
// user's own, and follows them across devices - which localStorage never did.

export interface PinnedCanvas {
  /** Stable pin id; the canvas address can change under it. */
  id: string
  workspaceName: string
  treeName: string
  path: string
  /** Tree node id at pin time - advisory, the path is what gets resolved. */
  layerId?: string
  /** Snapshot for labelling a tile whose canvas no longer resolves. */
  label?: string
}

export interface WebuiConfig {
  home?: {
    pinnedCanvases?: PinnedCanvas[]
  }
  [key: string]: unknown
}

export async function getWebuiConfig(): Promise<WebuiConfig> {
  const res = await api.get<WebuiConfig>(`${API_URL}/users/me/config/webui`)
  return res ?? {}
}

export async function putWebuiConfig(config: WebuiConfig): Promise<WebuiConfig> {
  const res = await api.put<WebuiConfig>(`${API_URL}/users/me/config/webui`, config)
  return res ?? config
}

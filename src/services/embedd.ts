import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

/**
 * Embedding configuration — providers, per-space backends, routing.
 *
 * Config resolves in layers, lowest precedence first:
 *
 *   built-in  ←  server embedd.json  ←  user default  ←  WORKSPACE (wins)
 *
 * The workspace layer lives in that workspace's own `workspace.json`
 * (`services.embedd`), so it travels with a tar'd workspace rather than being
 * pinned to the server that happened to create it.
 *
 * Switching a model is non-destructive by construction: a new model embeds into
 * its OWN Lance table with its own "already embedded" ledger, so the previous
 * model's vectors are untouched and reverting is a config write rather than a
 * re-embed. The cost is that the new table starts EMPTY — which is why
 * `movedSpaces` on a save matters enough to prompt on.
 *
 * API keys are write-only throughout. A GET reports `apiKeySet: true` and never
 * the value, and a PUT that OMITS the key keeps the stored one. Sending an empty
 * string instead of omitting the field blanks the secret — see `stripUnsetKeys`.
 */

/** Provider implementations the server knows how to build. */
export const EMBEDD_PROVIDER_TYPES = ['onnx', 'ollama', 'clip', 'openai'] as const
export type EmbeddProviderType = (typeof EMBEDD_PROVIDER_TYPES)[number]

/** Provider ids that exist without being declared, and can only be merged over. */
export const BUILTIN_PROVIDER_IDS = ['onnx', 'ollama', 'clip'] as const

export interface EmbeddProviderSpec {
  type?: EmbeddProviderType
  /** OpenAI-compatible endpoint (`openai` type). Fetched BY THE SERVER. */
  baseUrl?: string
  /** Ollama host (`ollama` type). */
  host?: string
  cacheDir?: string
  /** Write-only. Absent on every GET; omit on PUT to keep the stored value. */
  apiKey?: string
  /** GET-only marker: a key is stored, but its value is never returned. */
  apiKeySet?: boolean
  /** GET-only: names of stored custom headers, never their values. */
  headerNames?: string[]
  [key: string]: unknown
}

/** Which provider+model fills one modality. `dim` sizes the Lance table. */
export interface EmbeddSpaceSpec {
  provider?: string
  model?: string
  dim?: number
  chunk?: boolean
  maxLength?: number
  dimensions?: number
  annIndex?: boolean
}

export interface EmbeddRule {
  space: string
  match?: Record<string, unknown>
}

export interface EmbeddConfig {
  providers?: Record<string, EmbeddProviderSpec>
  spaces?: Record<string, EmbeddSpaceSpec>
  /** Routing. Structural — a layer that declares rules replaces them wholesale. */
  rules?: EmbeddRule[]
  /** Server defaults only: host allowlist for the SSRF endpoint guard. */
  allowHosts?: string[]
}

/** A space as actually resolved, including the Lance table it is bound to. */
export interface ResolvedSpace {
  model: string
  dim: number
  bitmapKey?: string
  seenKey?: string
  table?: string
  annIndex?: boolean
}

export interface WorkspaceEmbeddConfig {
  /** This workspace's own overrides — what round-trips back on a PUT. */
  workspace: EmbeddConfig
  /** What it actually embeds with once the layers resolve. */
  effective: EmbeddConfig
  /** What it falls back to, so fields can be marked inherited. */
  inherited: EmbeddConfig
  spaces: Record<string, ResolvedSpace>
  /** Set when the stored config no longer resolves and defaults stand in. */
  invalid?: string
}

export interface WorkspaceEmbeddSaveResult {
  workspace: EmbeddConfig
  effective: EmbeddConfig
  spaces: Record<string, ResolvedSpace>
  /** Spaces whose model/dim changed — their new table is EMPTY until refilled. */
  movedSpaces: string[]
  /** Which Lance table each space now points at. */
  tables: Record<string, string> | null
  /** False when the live swap could not be applied (inactive workspace). */
  applied: boolean
}

export interface EmbeddReindexResult {
  enqueued: number
  spaces: Record<string, number>
  scope?: string
  scopedDocs?: number
  ingestDisabled?: boolean
}

export interface VectorTable {
  name: string
  /** False = superseded. Only these can be reclaimed; the live one is refused. */
  active: boolean
  space?: string
  model?: string | null
  dim?: number
}

export interface VectorTableList {
  tables: VectorTable[]
  /** Set when LanceDB could not be opened at all. */
  error?: string
}

export interface UserEmbeddConfig {
  effective: EmbeddConfig
  /** Just this user's overrides. */
  user: EmbeddConfig
  serverDefaults: EmbeddConfig
  invalid?: string
}

export interface UserEmbeddSaveResult {
  user: EmbeddConfig
  effective: EmbeddConfig
  /** Workspaces sitting on this layer. */
  workspaces: string[]
  /** Space configs latch at workspace start, so running ones keep their tables. */
  restartRequired: boolean
}

export interface ServerEmbeddDefaults {
  serverDefaults: EmbeddConfig
  configPath: string
  allowHosts: string[]
}

export interface EmbeddTestResult {
  ok: boolean
  /** Round-tripped from a real embedding call — compare against the configured dim. */
  dim: number
  latencyMs: number
  modality: string
}

const workspaceEmbedd = (workspaceId: string) =>
  `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/embedd`

/**
 * Drop `apiKey` for every provider whose key the form did not touch.
 *
 * The distinction is load-bearing: an ABSENT key means "keep what is stored",
 * an empty string means "blank it". A form that always sends the field would
 * silently destroy a secret it was never allowed to read.
 */
export function stripUnsetKeys(config: EmbeddConfig, touched: Set<string>): EmbeddConfig {
  const providers: Record<string, EmbeddProviderSpec> = {}
  for (const [id, spec] of Object.entries(config.providers || {})) {
    const clean: EmbeddProviderSpec = { ...spec }
    // apiKeySet/headerNames are GET-only echoes; never send them back.
    delete clean.apiKeySet
    delete clean.headerNames
    // Only a key that was actually typed is sent. Anything else is omitted, so
    // the server carries the stored value forward.
    if (touched.has(id) && spec.apiKey) { clean.apiKey = spec.apiKey } else { delete clean.apiKey }
    providers[id] = clean
  }
  return { ...config, providers }
}

// ── Workspace layer (the primary surface) ───────────────────────────────────

export async function getWorkspaceEmbeddConfig(workspaceId: string): Promise<WorkspaceEmbeddConfig> {
  const res = await api.get<{ payload: WorkspaceEmbeddConfig }>(`${workspaceEmbedd(workspaceId)}/config`)
  return res.payload
}

/**
 * Applied LIVE — the route quiesces the queue, swaps the vector spaces and
 * resumes, so no restart is needed. Check `movedSpaces` on the result: a
 * non-empty list means those spaces now point at an empty table and dense
 * search is thin until `reindexWorkspaceEmbeddings` refills them.
 */
export async function saveWorkspaceEmbeddConfig(
  workspaceId: string,
  config: EmbeddConfig,
): Promise<WorkspaceEmbeddSaveResult> {
  const res = await api.put<{ payload: WorkspaceEmbeddSaveResult }>(`${workspaceEmbedd(workspaceId)}/config`, config)
  return res.payload
}

/**
 * Fill the current model's space.
 *
 * `scope` (`ctx://…` / `dir://…`) restricts the run to a subtree so a candidate
 * model can be tried on one project first. MVP caveat worth surfacing in the
 * UI: `reindex: true` combined with a scope clears the WHOLE space — a partial
 * clear is not expressible in the bitmap ledger — so scoped runs are for
 * incrementally FILLING a new model, not for re-doing part of an old one.
 */
export async function reindexWorkspaceEmbeddings(
  workspaceId: string,
  options: { space?: string; reindex?: boolean; scope?: string } = {},
): Promise<EmbeddReindexResult> {
  const body: Record<string, unknown> = {}
  // The route declares additionalProperties:false, so only send what is set.
  if (options.space) { body.space = options.space }
  if (options.reindex !== undefined) { body.reindex = options.reindex }
  if (options.scope) { body.scope = options.scope }
  const res = await api.post<{ payload: EmbeddReindexResult }>(`${workspaceEmbedd(workspaceId)}/reindex`, body)
  return res.payload
}

export async function listWorkspaceVectorTables(workspaceId: string): Promise<VectorTableList> {
  const res = await api.get<{ payload: VectorTableList }>(`${workspaceEmbedd(workspaceId)}/vector-tables`)
  return res.payload
}

/** Irreversible. The server refuses a space's live table, so only superseded
 *  models can be reclaimed — but once dropped, reverting to that model costs a
 *  full re-embed. */
export async function dropWorkspaceVectorTable(
  workspaceId: string,
  table: string,
): Promise<{ dropped: boolean; name?: string; error?: string }> {
  const res = await api.delete<{ payload: { dropped: boolean; name?: string; error?: string } }>(
    `${workspaceEmbedd(workspaceId)}/vector-tables/${encodeURIComponent(table)}`,
  )
  return res.payload
}

// ── User layer (defaults new workspaces inherit) ────────────────────────────

export async function getUserEmbeddConfig(): Promise<UserEmbeddConfig> {
  const res = await api.get<{ payload: UserEmbeddConfig }>(`${API_ROUTES.embedd}/config`)
  return res.payload
}

export async function saveUserEmbeddConfig(config: EmbeddConfig): Promise<UserEmbeddSaveResult> {
  const res = await api.put<{ payload: UserEmbeddSaveResult }>(`${API_ROUTES.embedd}/config`, config)
  return res.payload
}

// ── Server layer (admin) ────────────────────────────────────────────────────

/** Readable by any authenticated user — the UI shows what you inherit. */
export async function getServerEmbeddDefaults(): Promise<ServerEmbeddDefaults> {
  const res = await api.get<{ payload: ServerEmbeddDefaults }>(`${API_ROUTES.embedd}/defaults`)
  return res.payload
}

/** Admin-only; a non-admin gets 403. */
export async function saveServerEmbeddDefaults(
  config: EmbeddConfig,
): Promise<{ serverDefaults: EmbeddConfig; configPath: string; restartRequired: boolean }> {
  const res = await api.put<{ payload: { serverDefaults: EmbeddConfig; configPath: string; restartRequired: boolean } }>(
    `${API_ROUTES.embedd}/defaults`,
    config,
  )
  return res.payload
}

// ── Connectivity check ──────────────────────────────────────────────────────

/**
 * Round-trips one real embedding call, so a pass means the MODEL answered — not
 * merely that the host is up. The returned `dim` is what the backend actually
 * produces; a mismatch against the configured `dim` is the single most likely
 * misconfiguration, so callers should surface both.
 */
export async function testEmbeddBackend(
  provider: EmbeddProviderSpec,
  model?: string,
  modality = 'text',
): Promise<EmbeddTestResult> {
  const spec: EmbeddProviderSpec = { ...provider }
  delete spec.apiKeySet
  delete spec.headerNames
  const res = await api.post<{ payload: EmbeddTestResult }>(`${API_ROUTES.embedd}/test`, {
    provider: spec,
    ...(model ? { model } : {}),
    modality,
  })
  return res.payload
}

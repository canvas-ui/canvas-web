import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

/**
 * Embedding configuration — providers, per-space backends, routing.
 *
 * Config resolves in layers, lowest precedence first:
 *
 *   built-in  ←  server inferd.json  ←  user default  ←  WORKSPACE (wins)
 *
 * The workspace layer lives in that workspace's own `workspace.json`
 * (`services.inferd`), so it travels with a tar'd workspace rather than being
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
export const INFERD_PROVIDER_TYPES = ['onnx', 'ollama', 'clip', 'blip', 'openai'] as const
export type InferdProviderType = (typeof INFERD_PROVIDER_TYPES)[number]

/** Provider ids that exist without being declared, and can only be merged over. */
export const BUILTIN_PROVIDER_IDS = ['onnx', 'ollama', 'clip', 'blip'] as const

export interface InferdProviderSpec {
  type?: InferdProviderType
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
export interface InferdSpaceSpec {
  provider?: string
  model?: string
  dim?: number
  chunk?: boolean
  maxLength?: number
  dimensions?: number
  annIndex?: boolean
}

export interface InferdRule {
  space: string
  match?: Record<string, unknown>
}

export interface InferdConfig {
  providers?: Record<string, InferdProviderSpec>
  spaces?: Record<string, InferdSpaceSpec>
  /** Routing. Structural — a layer that declares rules replaces them wholesale. */
  rules?: InferdRule[]
  /**
   * Per-modality summary generation (the "describe" capability): captions for
   * images first, audio/text later. Local default is BLIP via the `blip`
   * provider (disabled until enabled). Merges key-wise per modality.
   */
  summarize?: Record<string, InferdSummarizeSpec>
  /** Server defaults only: host allowlist for the SSRF endpoint guard. */
  allowHosts?: string[]
}

export interface InferdSummarizeSpec {
  enabled?: boolean
  provider?: string
  model?: string
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

export interface WorkspaceInferdConfig {
  /** This workspace's own overrides — what round-trips back on a PUT. */
  workspace: InferdConfig
  /** What it actually embeds with once the layers resolve. */
  effective: InferdConfig
  /** What it falls back to, so fields can be marked inherited. */
  inherited: InferdConfig
  spaces: Record<string, ResolvedSpace>
  /** Set when the stored config no longer resolves and defaults stand in. */
  invalid?: string
}

export interface WorkspaceInferdSaveResult {
  workspace: InferdConfig
  effective: InferdConfig
  spaces: Record<string, ResolvedSpace>
  /** Spaces whose model/dim changed — their new table is EMPTY until refilled. */
  movedSpaces: string[]
  /** Which Lance table each space now points at. */
  tables: Record<string, string> | null
  /** False when the live swap could not be applied (inactive workspace). */
  applied: boolean
}

export interface InferdReindexResult {
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

export interface UserInferdConfig {
  effective: InferdConfig
  /** Just this user's overrides. */
  user: InferdConfig
  serverDefaults: InferdConfig
  invalid?: string
}

export interface UserInferdSaveResult {
  user: InferdConfig
  effective: InferdConfig
  /** Workspaces sitting on this layer. */
  workspaces: string[]
  /** Space configs latch at workspace start, so running ones keep their tables. */
  restartRequired: boolean
}

export interface ServerInferdDefaults {
  serverDefaults: InferdConfig
  configPath: string
  allowHosts: string[]
}

export interface InferdTestResult {
  ok: boolean
  /** Round-tripped from a real embedding call — compare against the configured dim. */
  dim: number
  latencyMs: number
  modality: string
}

const workspaceInferd = (workspaceId: string) =>
  `${API_ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/inferd`

/**
 * Drop `apiKey` for every provider whose key the form did not touch.
 *
 * The distinction is load-bearing: an ABSENT key means "keep what is stored",
 * an empty string means "blank it". A form that always sends the field would
 * silently destroy a secret it was never allowed to read.
 */
export function stripUnsetKeys(config: InferdConfig, touched: Set<string>): InferdConfig {
  const providers: Record<string, InferdProviderSpec> = {}
  for (const [id, spec] of Object.entries(config.providers || {})) {
    const clean: InferdProviderSpec = { ...spec }
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

/** Live queue state for one workspace — pending/draining/paused. */
export interface WorkspaceInferdQueue {
  pending: number
  draining: boolean
  paused?: boolean
  ingestDisabled?: boolean
}

export interface ImageSummaryStatus {
  running: boolean
  total: number
  described: number
  skipped: number
  failed: number
  errors?: Array<{ id: number | string; error: string }>
  /**
   * The run stopped early because the model worker died and inferd refused to
   * respawn it (OOM being the usual cause). Distinct from "everything failed":
   * the images after the crash were never attempted, and starting a new run
   * re-arms the breaker.
   */
  aborted?: boolean
  abortedReason?: string | null
  force?: boolean
  startedAt?: string | null
  finishedAt?: string | null
}

export interface WorkspaceInferdStatus {
  queue: WorkspaceInferdQueue | null
  summarize: ImageSummaryStatus
}

/** Cheap in-memory readout; null queue when the workspace has no queue yet. */
export async function getWorkspaceInferdStatus(workspaceId: string): Promise<WorkspaceInferdStatus> {
  const res = await api.get<{ payload: WorkspaceInferdStatus }>(`${workspaceInferd(workspaceId)}/status`)
  return res.payload
}

/** Start captioning images into metadata.summary (async; poll status.summarize). */
export async function startWorkspaceImageSummaries(
  workspaceId: string,
  options: { force?: boolean } = {},
): Promise<ImageSummaryStatus> {
  const body: Record<string, unknown> = {}
  if (options.force !== undefined) { body.force = options.force }
  const res = await api.post<{ payload: ImageSummaryStatus }>(
    `${workspaceInferd(workspaceId)}/summarize/images`,
    body,
  )
  return res.payload
}

export async function getWorkspaceInferdConfig(workspaceId: string): Promise<WorkspaceInferdConfig> {
  const res = await api.get<{ payload: WorkspaceInferdConfig }>(`${workspaceInferd(workspaceId)}/config`)
  return res.payload
}

/**
 * Applied LIVE — the route quiesces the queue, swaps the vector spaces and
 * resumes, so no restart is needed. Check `movedSpaces` on the result: a
 * non-empty list means those spaces now point at an empty table and dense
 * search is thin until `reindexWorkspaceEmbeddings` refills them.
 */
export async function saveWorkspaceInferdConfig(
  workspaceId: string,
  config: InferdConfig,
): Promise<WorkspaceInferdSaveResult> {
  const res = await api.put<{ payload: WorkspaceInferdSaveResult }>(`${workspaceInferd(workspaceId)}/config`, config)
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
): Promise<InferdReindexResult> {
  const body: Record<string, unknown> = {}
  // The route declares additionalProperties:false, so only send what is set.
  if (options.space) { body.space = options.space }
  if (options.reindex !== undefined) { body.reindex = options.reindex }
  if (options.scope) { body.scope = options.scope }
  const res = await api.post<{ payload: InferdReindexResult }>(`${workspaceInferd(workspaceId)}/reindex`, body)
  return res.payload
}

export async function listWorkspaceVectorTables(workspaceId: string): Promise<VectorTableList> {
  const res = await api.get<{ payload: VectorTableList }>(`${workspaceInferd(workspaceId)}/vector-tables`)
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
    `${workspaceInferd(workspaceId)}/vector-tables/${encodeURIComponent(table)}`,
  )
  return res.payload
}

// ── User layer (defaults new workspaces inherit) ────────────────────────────

export async function getUserInferdConfig(): Promise<UserInferdConfig> {
  const res = await api.get<{ payload: UserInferdConfig }>(`${API_ROUTES.inferd}/config`)
  return res.payload
}

export async function saveUserInferdConfig(config: InferdConfig): Promise<UserInferdSaveResult> {
  const res = await api.put<{ payload: UserInferdSaveResult }>(`${API_ROUTES.inferd}/config`, config)
  return res.payload
}

// ── Server layer (admin) ────────────────────────────────────────────────────

/** Readable by any authenticated user — the UI shows what you inherit. */
export async function getServerInferdDefaults(): Promise<ServerInferdDefaults> {
  const res = await api.get<{ payload: ServerInferdDefaults }>(`${API_ROUTES.inferd}/defaults`)
  return res.payload
}

/** Admin-only; a non-admin gets 403. */
export async function saveServerInferdDefaults(
  config: InferdConfig,
): Promise<{ serverDefaults: InferdConfig; configPath: string; restartRequired: boolean }> {
  const res = await api.put<{ payload: { serverDefaults: InferdConfig; configPath: string; restartRequired: boolean } }>(
    `${API_ROUTES.inferd}/defaults`,
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
/**
 * Ask whether the backend's model is already in the server's local cache —
 * i.e. whether the next test/embed call will answer straight away or first
 * download weights (minutes, for a cold CLIP model). `null` = unknowable
 * (remote providers download nothing; local ones without a cache dir).
 * Pure filesystem check server-side: no model load, no outbound request.
 */
export async function probeInferdModelCache(
  provider: InferdProviderSpec,
  model?: string,
): Promise<boolean | null> {
  const spec: InferdProviderSpec = { ...provider }
  delete spec.apiKeySet
  delete spec.headerNames
  const res = await api.post<{ payload: { cached: boolean | null } }>(`${API_ROUTES.inferd}/test`, {
    provider: spec,
    ...(model ? { model } : {}),
    probe: true,
  })
  return res.payload.cached ?? null
}

export async function testInferdBackend(
  provider: InferdProviderSpec,
  model?: string,
  modality = 'text',
): Promise<InferdTestResult> {
  const spec: InferdProviderSpec = { ...provider }
  delete spec.apiKeySet
  delete spec.headerNames
  const res = await api.post<{ payload: InferdTestResult }>(`${API_ROUTES.inferd}/test`, {
    provider: spec,
    ...(model ? { model } : {}),
    modality,
  })
  return res.payload
}

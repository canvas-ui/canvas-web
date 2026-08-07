import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Plus, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast-container'
import {
  BUILTIN_PROVIDER_IDS,
  EMBEDD_PROVIDER_TYPES,
  probeEmbeddModelCache,
  stripUnsetKeys,
  testEmbeddBackend,
  type EmbeddConfig,
  type EmbeddProviderSpec,
  type EmbeddSpaceSpec,
  type ResolvedSpace,
} from '@/services/embedd'

/**
 * Editor for one layer of the embedding config.
 *
 * The same component drives all three surfaces — workspace, user defaults and
 * server defaults — because they edit the same shape and differ only in what
 * they inherit from. `value` is the layer being EDITED (overrides only, which is
 * what gets PUT back); `effective` is what actually runs after layering, and
 * `inherited` is what a field falls back to when its override is cleared.
 *
 * ── Shape of the UI ──────────────────────────────────────────────────────────
 * The config is a routing chain: content of some modality lands in a SPACE, the
 * space names a BACKEND and a model, and that pair decides which vector table
 * the vectors physically go to. So a space is one row read left to right along
 * that chain, collapsed to its summary until opened — current state is the rule,
 * form fields the exception. Backends are an inventory below, referenced by the
 * rows above rather than competing with them.
 *
 * Three rules the server enforces that this component has to respect:
 *
 *   - Spaces are DATA. `text` and `image` are not special — whatever the router
 *     reports in `effective.spaces` gets a row, so an audio or spatial space
 *     slots in with no change here.
 *   - API keys are write-only. A GET never returns one, so the field is only
 *     sent when actually typed into; see `stripUnsetKeys`.
 *   - Each provider type reads its OWN connection field. Showing the others is
 *     how a user ends up typing a key that is silently ignored.
 */

const selectClass = 'h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring'

/** Machine keys (space names) — set as keys rather than prose. */
const KEY_LABEL = 'font-semibold uppercase tracking-[0.08em]'

/**
 * Which options each provider type actually reads. Mirrors the server's
 * provider classes: showing a field the backend ignores is how a user ends up
 * typing an API key that is silently dropped, or a base URL on a provider that
 * only ever looks at `host`.
 */
const PROVIDER_SHAPE: Record<string, {
  url?: { key: 'baseUrl' | 'host'; label: string; placeholder: string; hint: string }
  apiKey?: string
  cacheDir?: string
  note?: string
  /** Where this backend runs, for the collapsed row. */
  where: (spec: EmbeddProviderSpec) => string
}> = {
  openai: {
    url: {
      key: 'baseUrl',
      label: 'Base URL',
      placeholder: 'http://gpu.local:8000/v1',
      hint: 'OpenAI-compatible embeddings endpoint. A trailing /v1 is optional — both http://host:8000 and http://host:8000/v1 work. Use this type for anything fronting Ollama with an OpenAI-compatible API.',
    },
    apiKey: 'Sent as `Authorization: Bearer …`. Leave empty for servers that do not check it.',
    where: spec => (spec.baseUrl as string) || 'no endpoint set',
  },
  ollama: {
    url: {
      key: 'host',
      label: 'Host',
      placeholder: 'http://127.0.0.1:11434',
      hint: 'The Ollama daemon root. This speaks Ollama\'s native /api/embed, so do NOT append /v1 — for an OpenAI-compatible proxy, switch the type to openai instead.',
    },
    apiKey: 'Sent as `Authorization: Bearer …`. Only needed when Ollama sits behind an authenticating proxy.',
    where: spec => (spec.host as string) || 'http://127.0.0.1:11434',
  },
  onnx: {
    cacheDir: 'Where downloaded weights are cached on the server. Empty uses the server default.',
    note: 'Runs in-process on the server. No endpoint and no credentials.',
    where: () => 'in-process',
  },
  clip: {
    cacheDir: 'Where downloaded weights are cached on the server. Empty uses the server default.',
    note: 'Runs in-process on the server. No endpoint and no credentials.',
    where: () => 'in-process',
  },
}

/** Keys a row hides for the selected type, so a leftover can be pointed at. */
const ALL_CONNECTION_KEYS = ['baseUrl', 'host', 'apiKey', 'cacheDir'] as const

/**
 * The server fetches this URL, so it must be absolute — a bare path like `/v1`
 * is the classic mistake and used to come back as an opaque 400 from the
 * endpoint guard. Catch it in the field, where it can be explained.
 */
function urlProblem(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') { return null }
  let parsed: URL
  try { parsed = new URL(value.trim()) }
  catch { return 'Must be an absolute URL including the scheme, e.g. http://127.0.0.1:11434' }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Unsupported scheme '${parsed.protocol.replace(':', '')}' — use http or https.`
  }
  return null
}

/** Section heading. Micro-type, because the rows below carry the weight. */
function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-2">
      <h3 className={cn('text-[11px] text-muted-foreground', KEY_LABEL)}>{title}</h3>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

/** Marks whether a field is carrying an override or falling through to a lower layer. */
function InheritanceBadge({ overridden, source }: { overridden: boolean; source?: string }) {
  if (overridden) {
    return (
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary" title="Set on this layer — it wins over anything inherited">
        overridden
      </span>
    )
  }
  return (
    <span
      className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
      title={source ? `Inherited: ${source}` : 'Inherited from a lower config layer'}
    >
      inherited
    </span>
  )
}

/**
 * One override-able field. Empty input = no override, so the placeholder shows
 * the inherited value that would apply instead — the field is never blank-
 * looking when something is actually in force.
 */
function OverrideField({
  label,
  value,
  inheritedValue,
  onChange,
  type = 'text',
  placeholder,
  disabled,
  hint,
  error,
  mono,
}: {
  label: string
  value: string | number | undefined
  inheritedValue: string | number | undefined
  onChange: (next: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  disabled?: boolean
  hint?: string
  error?: string
  mono?: boolean
}) {
  const overridden = value !== undefined && value !== ''
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium">{label}</label>
        <InheritanceBadge overridden={overridden} source={inheritedValue === undefined ? undefined : String(inheritedValue)} />
        {overridden && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] text-muted-foreground underline hover:text-foreground"
            title="Clear the override and fall back to the inherited value"
          >
            reset
          </button>
        )}
      </div>
      <Input
        type={type}
        value={value ?? ''}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? (inheritedValue !== undefined ? String(inheritedValue) : '—')}
        className={cn('h-8 text-sm', mono && 'font-mono', error && 'border-destructive focus-visible:ring-destructive')}
      />
      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Small labelled toggle used for the space flags. */
function FlagToggle({
  label,
  checked,
  overridden,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  overridden: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" disabled={disabled} checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
      <InheritanceBadge overridden={overridden} />
    </label>
  )
}

/** Row disclosure control — one affordance, used by both row kinds. */
function RowToggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
    </button>
  )
}

type SpaceState = 'live' | 'needs-fill' | 'unresolved' | 'inherited'

const RAIL: Record<SpaceState, string> = {
  live: 'bg-success',
  'needs-fill': 'bg-warning',
  unresolved: 'bg-destructive',
  inherited: 'bg-border',
}

export function EmbeddConfigEditor({
  value,
  effective,
  inherited,
  resolvedSpaces,
  invalid,
  attention,
  onFill,
  saving = false,
  disabled = false,
  saveLabel = 'Save',
  onSave,
}: {
  value: EmbeddConfig
  effective: EmbeddConfig
  inherited: EmbeddConfig
  /** Workspace layer only: which vector table each space is currently bound to. */
  resolvedSpaces?: Record<string, ResolvedSpace>
  /** Server-reported reason the stored config stopped resolving. */
  invalid?: string
  /** Spaces whose table just went empty — their row offers to fill them. */
  attention?: string[]
  /** Workspace layer only: fill one space, straight from its row. */
  onFill?: (space: string) => void
  saving?: boolean
  disabled?: boolean
  saveLabel?: string
  onSave: (config: EmbeddConfig) => Promise<void> | void
}) {
  const { showToast } = useToast()
  const [draft, setDraft] = useState<EmbeddConfig>(() => structuredClone(value))
  // Provider ids whose API key was actually typed into. Only these send the
  // field; every other provider omits it so the stored secret survives.
  const [touchedKeys, setTouchedKeys] = useState<Set<string>>(new Set())
  const [testing, setTesting] = useState<string | null>(null)
  // The tested model was not in the server's cache, so the in-flight test is
  // dominated by a weights download — label the wait honestly.
  const [downloading, setDownloading] = useState(false)
  const [newProviderId, setNewProviderId] = useState('')
  const [newSpaceName, setNewSpaceName] = useState('')
  // One row open at a time: these rows are summaries first, and a page of
  // simultaneously-expanded forms is the wall this replaced.
  const [openRow, setOpenRow] = useState<string | null>(null)

  // Space list comes from what actually resolves, never a hardcoded pair — a new
  // modality appears here the moment the server reports it.
  const spaceNames = useMemo(() => {
    const names = new Set([
      ...Object.keys(effective.spaces || {}),
      ...Object.keys(draft.spaces || {}),
    ])
    return [...names].sort()
  }, [effective.spaces, draft.spaces])

  const providerIds = useMemo(() => {
    const ids = new Set([
      ...Object.keys(effective.providers || {}),
      ...Object.keys(draft.providers || {}),
    ])
    return [...ids].sort()
  }, [effective.providers, draft.providers])

  const setSpaceField = (space: string, key: keyof EmbeddSpaceSpec, raw: string) => {
    setDraft(prev => {
      const spaces = { ...(prev.spaces || {}) }
      const current: EmbeddSpaceSpec = { ...(spaces[space] || {}) }
      if (raw === '') {
        delete current[key]
      } else if (key === 'dim' || key === 'maxLength' || key === 'dimensions') {
        const n = Number(raw)
        // Leave a half-typed number alone rather than coercing it to NaN.
        if (Number.isNaN(n)) { return prev }
        current[key] = n as never
      } else {
        current[key] = raw as never
      }
      if (Object.keys(current).length === 0) { delete spaces[space] } else { spaces[space] = current }
      return { ...prev, spaces }
    })
  }

  const setSpaceFlag = (space: string, key: 'chunk' | 'annIndex', next: boolean | undefined) => {
    setDraft(prev => {
      const spaces = { ...(prev.spaces || {}) }
      const current: EmbeddSpaceSpec = { ...(spaces[space] || {}) }
      if (next === undefined) { delete current[key] } else { current[key] = next }
      if (Object.keys(current).length === 0) { delete spaces[space] } else { spaces[space] = current }
      return { ...prev, spaces }
    })
  }

  const setProviderField = (id: string, key: string, raw: string) => {
    if (key === 'apiKey') {
      // Emptying the box means "leave the stored key alone", NOT "blank it" —
      // so the provider goes back to untouched and the field is omitted on save.
      // Sending '' here would destroy a secret the form was never allowed to
      // read, which is the one unrecoverable mistake this editor could make.
      setTouchedKeys(prev => {
        const next = new Set(prev)
        if (raw === '') { next.delete(id) } else { next.add(id) }
        return next
      })
    }
    setDraft(prev => {
      const providers = { ...(prev.providers || {}) }
      const current: EmbeddProviderSpec = { ...(providers[id] || {}) }
      if (raw === '') { delete current[key] } else { current[key] = raw }
      if (Object.keys(current).length === 0) { delete providers[id] } else { providers[id] = current }
      return { ...prev, providers }
    })
  }

  const removeProvider = (id: string) => {
    setDraft(prev => {
      const providers = { ...(prev.providers || {}) }
      delete providers[id]
      return { ...prev, providers }
    })
    setTouchedKeys(prev => { const next = new Set(prev); next.delete(id); return next })
  }

  /**
   * Declare a space this layer does not have yet. Needed on the server-defaults
   * surface, which starts from an empty file and has no resolved layer to
   * enumerate spaces from — and it is how a new modality gets introduced at all.
   */
  const addSpace = () => {
    const name = newSpaceName.trim()
    if (!name) { return }
    if (spaceNames.includes(name)) {
      showToast({ title: 'Space exists', description: `'${name}' already has a row below.`, variant: 'destructive' })
      return
    }
    setDraft(prev => ({ ...prev, spaces: { ...(prev.spaces || {}), [name]: {} } }))
    setNewSpaceName('')
    setOpenRow(`space:${name}`)
  }

  const addProvider = () => {
    const id = newProviderId.trim()
    if (!id) { return }
    if (providerIds.includes(id)) {
      showToast({ title: 'Backend exists', description: `'${id}' is already declared — open it below to edit.`, variant: 'destructive' })
      return
    }
    setDraft(prev => ({ ...prev, providers: { ...(prev.providers || {}), [id]: { type: 'openai' } } }))
    setNewProviderId('')
    setOpenRow(`provider:${id}`)
  }

  /**
   * Resolve a provider spec for a connectivity test: the draft override layered
   * over what currently runs, so testing an edit exercises the edited values
   * without needing them saved first.
   */
  const resolveProvider = (id: string): EmbeddProviderSpec => ({
    ...(effective.providers?.[id] || {}),
    ...(draft.providers?.[id] || {}),
  })

  const runTest = async (space: string) => {
    const providerId = draft.spaces?.[space]?.provider ?? effective.spaces?.[space]?.provider
    const model = draft.spaces?.[space]?.model ?? effective.spaces?.[space]?.model
    if (!providerId) {
      showToast({ title: 'No backend', description: `Space '${space}' has no backend to test.`, variant: 'destructive' })
      return
    }
    const spec = resolveProvider(providerId)
    const urlKey = spec.type ? PROVIDER_SHAPE[spec.type as string]?.url?.key : undefined
    const specProblem = urlKey ? urlProblem(spec[urlKey]) : null
    if (specProblem) {
      showToast({ title: `Backend '${providerId}'`, description: specProblem, variant: 'destructive' })
      return
    }
    setTesting(space)
    try {
      // Cheap filesystem probe first: a cold local model means the test call is
      // really a weights download (minutes for CLIP) — say so instead of
      // sitting on an indistinct "Testing…".
      try {
        const cached = await probeEmbeddModelCache(spec, model)
        if (cached === false) {
          setDownloading(true)
          showToast({
            title: 'Downloading model',
            description: `'${model ?? 'the configured model'}' is not in the server's cache yet — downloading now. A first test can take a few minutes; the model is then cached for good.`,
          })
        }
      } catch {
        // Probe is best-effort — an older server without it just tests directly.
      }
      const result = await testEmbeddBackend(spec, model, space)
      const configuredDim = draft.spaces?.[space]?.dim ?? effective.spaces?.[space]?.dim
      // A dim mismatch is the most likely misconfiguration, and it fails at
      // write time rather than here. The backend just told us the real value,
      // so fill it in rather than making the user copy a number from a toast.
      const mismatch = result.dim > 0 && configuredDim !== undefined && result.dim !== configuredDim
      if (mismatch || (result.dim > 0 && configuredDim === undefined)) {
        setSpaceField(space, 'dim', String(result.dim))
      }
      showToast({
        title: mismatch ? 'Backend answered — dimensions corrected' : 'Backend answered',
        description: mismatch
          ? `Returned ${result.dim}-d but '${space}' was set to ${configuredDim}-d. Dimensions updated to ${result.dim} — save to apply. (${result.latencyMs} ms)`
          : `${result.dim}-d in ${result.latencyMs} ms`,
      })
    } catch (err) {
      // A rejected endpoint comes back as a 400 naming the offending provider;
      // show it verbatim rather than flattening it to "failed".
      showToast({
        title: 'Test failed',
        description: err instanceof Error ? err.message : 'Backend unreachable',
        variant: 'destructive',
      })
    } finally {
      setTesting(null)
      setDownloading(false)
    }
  }

  /**
   * Every URL override that would not survive the server's endpoint guard.
   * Checking here means the user sees the problem next to the field instead of
   * a 400 that names a provider id and nothing else.
   */
  const urlProblems = useMemo(() => {
    const out: string[] = []
    for (const [id, spec] of Object.entries(draft.providers || {})) {
      const type = (spec.type ?? effective.providers?.[id]?.type) as string | undefined
      const key = type ? PROVIDER_SHAPE[type]?.url?.key : undefined
      if (!key) { continue }
      const problem = urlProblem(spec[key])
      if (problem) { out.push(`${id}: ${problem}`) }
    }
    return out
  }, [draft.providers, effective.providers])

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(value) || touchedKeys.size > 0,
    [draft, value, touchedKeys],
  )

  const submit = async () => {
    if (urlProblems.length > 0) {
      showToast({ title: 'Fix the endpoint first', description: urlProblems.join(' · '), variant: 'destructive' })
      return
    }
    await onSave(stripUnsetKeys(draft, touchedKeys))
    setTouchedKeys(new Set())
  }

  const toggleRow = (key: string) => setOpenRow(prev => (prev === key ? null : key))

  return (
    <div className="space-y-6">
      {invalid && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive-subtle p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Stored config does not resolve — defaults are standing in</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{invalid}</p>
          </div>
        </div>
      )}

      {/* ── Spaces ─────────────────────────────────────────────────────────── */}
      <section>
        <SectionHead
          title="Spaces"
          hint="What each kind of content is embedded with. Changing a model sends that space to its own vector table, so the previous model stays intact and reverting is instant."
        />

        {spaceNames.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">No spaces on this layer</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              A space needs a backend, a model and a dimension count. Add one below to start embedding.
            </p>
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border">
            {spaceNames.map(space => {
              const override = draft.spaces?.[space] || {}
              const running = effective.spaces?.[space] || {}
              const fallback = inherited.spaces?.[space] || {}
              const resolved = resolvedSpaces?.[space]
              const rowKey = `space:${space}`
              const open = openRow === rowKey

              const model = override.model ?? running.model
              const providerId = override.provider ?? running.provider
              const dim = override.dim ?? running.dim
              const chunk = override.chunk ?? running.chunk ?? false
              const needsFill = attention?.includes(space) ?? false
              const state: SpaceState = invalid
                ? 'unresolved'
                : needsFill
                  ? 'needs-fill'
                  : resolved?.table
                    ? 'live'
                    : 'inherited'

              return (
                <div key={space} className="relative">
                  {/* The rail is the row's only colour: state at a glance down
                      the left edge, with no badge competing for the eye. */}
                  <span className={cn('absolute inset-y-0 left-0 w-[3px]', RAIL[state])} aria-hidden />

                  <div className="flex items-start gap-3 py-3 pl-4 pr-3">
                    <div className="min-w-0 flex-1">
                      {/* The chain: space → model → backend → table. */}
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className={cn('text-[11px]', KEY_LABEL)}>{space}</span>
                        <span className="truncate font-mono text-sm">{model || 'no model set'}</span>
                        {providerId && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            via {providerId}
                          </span>
                        )}
                        {dim !== undefined && (
                          <span className="text-xs tabular-nums text-muted-foreground">{dim}-d</span>
                        )}
                        {chunk && <span className="text-xs text-muted-foreground">chunked</span>}
                      </div>

                      {resolved?.table && (
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title="Vector table currently backing this space">
                          └─ {resolved.table}
                        </p>
                      )}

                      {needsFill && (
                        <p className="mt-1 text-[11px] text-warning">
                          New table, nothing embedded in it yet — dense search stays thin for this space until it is
                          filled. Reverting the model is still instant.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {needsFill && onFill && (
                        <Button type="button" size="sm" variant="outline" onClick={() => onFill(space)}>
                          Fill
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled || testing !== null}
                        onClick={() => runTest(space)}
                        title="Round-trip a real embedding call against this backend and report the dimensions it returns"
                      >
                        <Zap className="mr-1.5 h-3.5 w-3.5" />
                        {testing === space ? (downloading ? 'Downloading…' : 'Testing…') : 'Test'}
                      </Button>
                      <RowToggle open={open} onClick={() => toggleRow(rowKey)} label={`Edit ${space}`} />
                    </div>
                  </div>

                  {open && (
                    <div className="border-t bg-muted/20 py-4 pl-4 pr-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium">Backend</label>
                            <InheritanceBadge overridden={override.provider !== undefined} source={fallback.provider} />
                          </div>
                          <select
                            className={selectClass}
                            disabled={disabled}
                            value={override.provider ?? ''}
                            onChange={e => setSpaceField(space, 'provider', e.target.value)}
                          >
                            <option value="">{running.provider ? `inherited — ${running.provider}` : 'inherited'}</option>
                            {providerIds.map(id => <option key={id} value={id}>{id}</option>)}
                          </select>
                        </div>

                        <OverrideField
                          label="Model"
                          mono
                          value={override.model}
                          inheritedValue={running.model}
                          onChange={raw => setSpaceField(space, 'model', raw)}
                          disabled={disabled}
                        />

                        <OverrideField
                          label="Dimensions"
                          type="number"
                          value={override.dim}
                          inheritedValue={running.dim}
                          onChange={raw => setSpaceField(space, 'dim', raw)}
                          disabled={disabled}
                          hint="Sizes the vector table. Test asks the backend and fills in what it really returns."
                        />

                        <OverrideField
                          label="Max length"
                          type="number"
                          value={override.maxLength}
                          inheritedValue={running.maxLength}
                          onChange={raw => setSpaceField(space, 'maxLength', raw)}
                          disabled={disabled}
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-4">
                        <FlagToggle
                          label="Chunk long inputs"
                          checked={chunk}
                          overridden={override.chunk !== undefined}
                          disabled={disabled}
                          onChange={next => setSpaceFlag(space, 'chunk', next)}
                        />
                        <FlagToggle
                          label="Build ANN index"
                          checked={override.annIndex ?? running.annIndex ?? true}
                          overridden={override.annIndex !== undefined}
                          disabled={disabled}
                          onChange={next => setSpaceFlag(space, 'annIndex', next)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!disabled && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={newSpaceName}
              onChange={e => setNewSpaceName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpace() } }}
              placeholder="new space name (e.g. audio)"
              className="h-8 max-w-xs text-sm"
            />
            <Button type="button" size="sm" variant="ghost" onClick={addSpace}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add space
            </Button>
          </div>
        )}
      </section>

      {/* ── Backends ───────────────────────────────────────────────────────── */}
      <section>
        <SectionHead
          title="Backends"
          hint="Where the models run, referenced by name from the spaces above. onnx, ollama and clip always exist — declaring one merges over its defaults."
        />

        <div className="divide-y overflow-hidden rounded-lg border">
          {providerIds.map(id => {
            const override = draft.providers?.[id] || {}
            const running = effective.providers?.[id] || {}
            const isBuiltin = (BUILTIN_PROVIDER_IDS as readonly string[]).includes(id)
            const declaredHere = draft.providers?.[id] !== undefined
            const rowKey = `provider:${id}`
            const open = openRow === rowKey

            const resolvedType = (override.type ?? running.type) as string | undefined
            const shape = resolvedType ? PROVIDER_SHAPE[resolvedType] : undefined
            const urlError = shape?.url ? urlProblem(override[shape.url.key]) : null
            const merged = { ...running, ...override }
            // Overrides on this layer that the resolved type ignores.
            const staleKeys = ALL_CONNECTION_KEYS.filter(key => {
              if (override[key] === undefined) { return false }
              if (key === shape?.url?.key) { return false }
              if (key === 'apiKey' && shape?.apiKey) { return false }
              if (key === 'cacheDir' && shape?.cacheDir) { return false }
              return true
            })

            // Which spaces break if this backend is wrong.
            const usedBy = spaceNames.filter(
              s => (draft.spaces?.[s]?.provider ?? effective.spaces?.[s]?.provider) === id,
            )

            return (
              <div key={id}>
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-mono text-sm font-semibold">{id}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {resolvedType ?? 'no type'}
                      </span>
                      {isBuiltin && <span className="text-[10px] text-muted-foreground">built-in</span>}
                      {merged.apiKeySet && !touchedKeys.has(id) && (
                        <span className="text-[10px] font-medium text-success">key set</span>
                      )}
                      {urlError && <span className="text-[10px] font-medium text-destructive">check endpoint</span>}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {shape ? shape.where(merged) : '—'}
                    </p>
                    {usedBy.length > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">used by {usedBy.join(', ')}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {declaredHere && !isBuiltin && !disabled && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeProvider(id)} title="Remove this override">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <RowToggle open={open} onClick={() => toggleRow(rowKey)} label={`Edit ${id}`} />
                  </div>
                </div>

                {open && (
                  <div className="border-t bg-muted/20 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium">Type</label>
                          <InheritanceBadge overridden={override.type !== undefined} source={running.type} />
                        </div>
                        <select
                          className={selectClass}
                          disabled={disabled}
                          value={override.type ?? ''}
                          onChange={e => setProviderField(id, 'type', e.target.value)}
                        >
                          <option value="">{running.type ? `inherited — ${running.type}` : 'inherited'}</option>
                          {EMBEDD_PROVIDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        {shape?.note && <p className="text-[11px] text-muted-foreground">{shape.note}</p>}
                      </div>

                      {shape?.url && (
                        <OverrideField
                          label={shape.url.label}
                          mono
                          value={override[shape.url.key] as string | undefined}
                          inheritedValue={running[shape.url.key] as string | undefined}
                          onChange={raw => setProviderField(id, shape.url!.key, raw)}
                          disabled={disabled}
                          placeholder={(running[shape.url.key] as string | undefined) ?? shape.url.placeholder}
                          hint={shape.url.hint}
                          error={urlError ?? undefined}
                        />
                      )}

                      {shape?.cacheDir && (
                        <OverrideField
                          label="Cache directory"
                          mono
                          value={override.cacheDir as string | undefined}
                          inheritedValue={running.cacheDir as string | undefined}
                          onChange={raw => setProviderField(id, 'cacheDir', raw)}
                          disabled={disabled}
                          placeholder={(running.cacheDir as string | undefined) ?? 'server default'}
                          hint={shape.cacheDir}
                        />
                      )}

                      {shape?.apiKey && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium">API key</label>
                            {touchedKeys.has(id) && (
                              <span className="rounded bg-warning-subtle px-1.5 py-0.5 text-[10px] font-medium text-warning">
                                will be written
                              </span>
                            )}
                          </div>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            disabled={disabled}
                            value={(override.apiKey as string) ?? ''}
                            onChange={e => setProviderField(id, 'apiKey', e.target.value)}
                            placeholder={running.apiKeySet ? '•••••••• (stored — leave empty to keep)' : 'unset'}
                            className="h-8 text-sm"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {shape.apiKey} Write-only: the stored key is never sent back, and leaving this empty keeps
                            whatever is stored.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* A value left behind by an earlier type. It is inert — the
                        server only reads the field its type uses — but saying so
                        beats leaving the user wondering where their setting went. */}
                    {staleKeys.length > 0 && !disabled && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
                        <span>
                          Not used by type <span className="font-mono">{resolvedType}</span>:{' '}
                          <span className="font-mono">{staleKeys.join(', ')}</span>
                        </span>
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          onClick={() => staleKeys.forEach(key => setProviderField(id, key, ''))}
                        >
                          clear
                        </button>
                      </div>
                    )}

                    {running.headerNames && running.headerNames.length > 0 && (
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        Stored custom headers: <span className="font-mono">{running.headerNames.join(', ')}</span> (values not shown)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!disabled && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={newProviderId}
              onChange={e => setNewProviderId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProvider() } }}
              placeholder="new backend name (e.g. gpu)"
              className="h-8 max-w-xs text-sm"
            />
            <Button type="button" size="sm" variant="ghost" onClick={addProvider}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add backend
            </Button>
          </div>
        )}
      </section>

      {!disabled && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="button" size="sm" onClick={submit} disabled={saving || !dirty || urlProblems.length > 0}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving || !dirty}
            onClick={() => { setDraft(structuredClone(value)); setTouchedKeys(new Set()) }}
          >
            Discard changes
          </Button>
          <span className="text-xs text-muted-foreground">
            {urlProblems.length > 0
              ? <span className="font-medium text-destructive">{urlProblems.length} endpoint {urlProblems.length === 1 ? 'needs' : 'need'} fixing</span>
              : dirty ? 'Unsaved changes' : 'Everything saved'}
          </span>
        </div>
      )}
    </div>
  )
}

export default EmbeddConfigEditor

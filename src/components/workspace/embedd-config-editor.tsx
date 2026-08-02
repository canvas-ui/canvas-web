import { useMemo, useState } from 'react'
import { AlertTriangle, Plus, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import {
  BUILTIN_PROVIDER_IDS,
  EMBEDD_PROVIDER_TYPES,
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
 * Two rules the server enforces that this component has to respect:
 *
 *   - Spaces are DATA. `text` and `image` are not special — whatever the router
 *     reports in `effective.spaces` gets a card, so an audio or spatial space
 *     slots in with no change here.
 *   - API keys are write-only. A GET never returns one, so the field is only
 *     sent when actually typed into; see `stripUnsetKeys`.
 */

const selectClass = 'h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring'

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
}: {
  label: string
  value: string | number | undefined
  inheritedValue: string | number | undefined
  onChange: (next: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  disabled?: boolean
  hint?: string
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
        className="h-8 text-sm"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function EmbeddConfigEditor({
  value,
  effective,
  inherited,
  resolvedSpaces,
  invalid,
  saving = false,
  disabled = false,
  saveLabel = 'Save',
  onSave,
}: {
  value: EmbeddConfig
  effective: EmbeddConfig
  inherited: EmbeddConfig
  /** Workspace layer only: which Lance table each space is currently bound to. */
  resolvedSpaces?: Record<string, ResolvedSpace>
  /** Server-reported reason the stored config stopped resolving. */
  invalid?: string
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
  const [newProviderId, setNewProviderId] = useState('')
  const [newSpaceName, setNewSpaceName] = useState('')

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
      showToast({ title: 'Space exists', description: `'${name}' already has a card below.`, variant: 'destructive' })
      return
    }
    setDraft(prev => ({ ...prev, spaces: { ...(prev.spaces || {}), [name]: {} } }))
    setNewSpaceName('')
  }

  const addProvider = () => {
    const id = newProviderId.trim()
    if (!id) { return }
    if (providerIds.includes(id)) {
      showToast({ title: 'Provider exists', description: `'${id}' is already declared — edit it below.`, variant: 'destructive' })
      return
    }
    setDraft(prev => ({ ...prev, providers: { ...(prev.providers || {}), [id]: { type: 'openai' } } }))
    setNewProviderId('')
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
      showToast({ title: 'No provider', description: `Space '${space}' has no provider to test.`, variant: 'destructive' })
      return
    }
    setTesting(space)
    try {
      const result = await testEmbeddBackend(resolveProvider(providerId), model, space)
      const configuredDim = draft.spaces?.[space]?.dim ?? effective.spaces?.[space]?.dim
      // A dim mismatch is the most likely misconfiguration, and it fails at
      // write time rather than here. The backend just told us the real value,
      // so fill it in rather than making the user copy a number from a toast.
      const mismatch = result.dim > 0 && configuredDim !== undefined && result.dim !== configuredDim
      if (mismatch || (result.dim > 0 && configuredDim === undefined)) {
        setSpaceField(space, 'dim', String(result.dim))
      }
      showToast({
        title: mismatch ? 'Backend answered — dim corrected' : 'Backend answered',
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
    }
  }

  const submit = async () => {
    await onSave(stripUnsetKeys(draft, touchedKeys))
    setTouchedKeys(new Set())
  }

  return (
    <div className="space-y-4">
      {invalid && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Stored config does not resolve — defaults are standing in</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{invalid}</p>
          </div>
        </div>
      )}

      {/* ── Spaces ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Spaces</h3>
          <p className="text-[11px] text-muted-foreground">
            One card per modality the router reports. Changing a model sends it to its own vector table, so the
            previous model stays intact and reverting is instant.
          </p>
        </div>

        {spaceNames.length === 0 && (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            No embedding spaces declared on this layer yet. Add one below — a space needs a provider, a model and a
            <span className="font-mono"> dim</span> to resolve.
          </div>
        )}

        {spaceNames.map(space => {
          const override = draft.spaces?.[space] || {}
          const running = effective.spaces?.[space] || {}
          const fallback = inherited.spaces?.[space] || {}
          const resolved = resolvedSpaces?.[space]
          return (
            <section key={space} className="rounded-lg border p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold capitalize">{space}</h4>
                  {resolved?.table && (
                    <span className="font-mono text-[10px] text-muted-foreground" title="Lance table currently backing this space">
                      {resolved.table}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || testing !== null}
                  onClick={() => runTest(space)}
                  title="Round-trip a real embedding call against this backend and report the dimension it returns"
                >
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  {testing === space ? 'Testing…' : 'Test connection'}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium">Provider</label>
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
                  hint="Sizes the vector table — Test connection asks the backend and fills this in with what it really returns."
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
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={override.chunk ?? running.chunk ?? false}
                    onChange={e => setSpaceFlag(space, 'chunk', e.target.checked)}
                  />
                  Chunk long inputs
                  <InheritanceBadge overridden={override.chunk !== undefined} />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={override.annIndex ?? running.annIndex ?? true}
                    onChange={e => setSpaceFlag(space, 'annIndex', e.target.checked)}
                  />
                  Build ANN index
                  <InheritanceBadge overridden={override.annIndex !== undefined} />
                </label>
              </div>
            </section>
          )
        })}

        {!disabled && (
          <div className="flex items-center gap-2">
            <Input
              value={newSpaceName}
              onChange={e => setNewSpaceName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpace() } }}
              placeholder="new space name (e.g. audio)"
              className="h-8 max-w-xs text-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={addSpace}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add space
            </Button>
          </div>
        )}
      </div>

      {/* ── Providers ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Providers</h3>
          <p className="text-[11px] text-muted-foreground">
            Connection details, referenced by id from a space. <span className="font-mono">onnx</span>,{' '}
            <span className="font-mono">ollama</span> and <span className="font-mono">clip</span> always exist —
            re-declaring one merges over its defaults.
          </p>
        </div>

        {providerIds.map(id => {
          const override = draft.providers?.[id] || {}
          const running = effective.providers?.[id] || {}
          const isBuiltin = (BUILTIN_PROVIDER_IDS as readonly string[]).includes(id)
          const declaredHere = draft.providers?.[id] !== undefined
          return (
            <section key={id} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-mono text-sm font-semibold">{id}</h4>
                  {isBuiltin && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title="Built-in provider — exists without being declared">
                      built-in
                    </span>
                  )}
                  {running.apiKeySet && !touchedKeys.has(id) && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600" title="A key is stored. It is never returned, and leaving the field empty keeps it.">
                      key set
                    </span>
                  )}
                </div>
                {declaredHere && !isBuiltin && !disabled && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeProvider(id)} title="Remove this override">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

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
                </div>

                <OverrideField
                  label="Base URL"
                  value={override.baseUrl}
                  inheritedValue={running.baseUrl}
                  onChange={raw => setProviderField(id, 'baseUrl', raw)}
                  disabled={disabled}
                  placeholder={running.baseUrl ?? 'http://gpu.local:8000/v1'}
                  hint={(override.type ?? running.type) === 'openai' ? 'OpenAI-compatible endpoint.' : undefined}
                />

                <OverrideField
                  label="Host"
                  value={override.host}
                  inheritedValue={running.host}
                  onChange={raw => setProviderField(id, 'host', raw)}
                  disabled={disabled}
                  placeholder={running.host ?? 'http://127.0.0.1:11434'}
                  hint={(override.type ?? running.type) === 'ollama' ? 'Ollama host.' : undefined}
                />

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium">API key</label>
                    {touchedKeys.has(id) && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
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
                    Write-only: the stored key is never sent back. Leave this empty to keep whatever is stored —
                    emptying it again after typing also leaves the stored key untouched.
                  </p>
                </div>
              </div>

              {running.headerNames && running.headerNames.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Stored custom headers: <span className="font-mono">{running.headerNames.join(', ')}</span> (values not shown)
                </p>
              )}
            </section>
          )
        })}

        {!disabled && (
          <div className="flex items-center gap-2">
            <Input
              value={newProviderId}
              onChange={e => setNewProviderId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProvider() } }}
              placeholder="new provider id (e.g. gpu)"
              className="h-8 max-w-xs text-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={addProvider}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add provider
            </Button>
          </div>
        )}
      </div>

      {!disabled && (
        <div className="flex items-center gap-2 border-t pt-4">
          <Button type="button" size="sm" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => { setDraft(structuredClone(value)); setTouchedKeys(new Set()) }}
          >
            Revert edits
          </Button>
        </div>
      )}
    </div>
  )
}

export default EmbeddConfigEditor

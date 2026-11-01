import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { AgentProviderModel } from '@/services/agent'

export function ModelPicker({ value, onChange, models, loading, error, refresh, disabled, id }: {
  value: string; onChange: (id: string, model?: AgentProviderModel) => void
  models: AgentProviderModel[]; loading: boolean; error: string; refresh: () => void; disabled?: boolean; id?: string
}) {
  const listId = useId()
  const selected = models.find(model => model.id === value)
  return <div className="space-y-2">
    <div className="flex gap-2">
      <Input id={id} aria-label="Model" list={listId} value={value} onChange={event => onChange(event.target.value, models.find(model => model.id === event.target.value))} placeholder="Choose or enter a model ID" disabled={disabled} />
      <Button type="button" variant="outline" disabled={disabled || loading} onClick={refresh}>Refresh models</Button>
    </div>
    <datalist id={listId}>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist>
    <p className="text-xs text-muted-foreground" role="status">{loading ? 'Loading models…' : error || (models.length ? `${models.length} models available` : 'Enter provider credentials to load available models. You can also enter a model ID.')}</p>
    {selected && <p className="text-xs text-muted-foreground">
      Context: {selected.contextWindow?.toLocaleString() ?? 'not reported'} · Max output: {selected.maxTokens?.toLocaleString() ?? 'not reported'} tokens
      {selected.limitsSource === 'runtime' ? ' (runtime catalogue)' : selected.limitsSource === 'provider' ? ' (provider)' : ''}
    </p>}
  </div>
}

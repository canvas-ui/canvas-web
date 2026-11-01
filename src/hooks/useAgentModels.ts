import { useEffect, useState } from 'react'
import { discoverAgentModels, type AgentProviderModel } from '@/services/agent'

export function useAgentModels(provider: string, apiKey: string, baseUrl: string, agentIdentifier?: string) {
  const [revision, setRevision] = useState(0)
  const key = JSON.stringify([provider, apiKey, baseUrl, agentIdentifier, revision])
  const [result, setResult] = useState<{ key: string; models: AgentProviderModel[]; loading: boolean; error: string }>({ key: '', models: [], loading: false, error: '' })
  const enabled = !!apiKey.trim() || !!agentIdentifier || ['ollama', 'lm-studio', 'vllm', 'custom'].includes(provider)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setResult({ key, models: [], loading: true, error: '' })
      discoverAgentModels({ provider, apiKey: apiKey.trim() || undefined, baseUrl: baseUrl.trim() || undefined, agentIdentifier }, controller.signal)
        .then(models => { if (!controller.signal.aborted) setResult({ key, models, loading: false, error: '' }) })
        .catch(error => { if (!controller.signal.aborted) setResult({ key, models: [], loading: false, error: error instanceof Error ? error.message : 'Unable to load models' }) })
    }, 700)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key, enabled, provider, apiKey, baseUrl, agentIdentifier])
  return { ...(result.key === key ? result : { models: [], loading: enabled, error: '' }), refresh: () => setRevision(value => value + 1) }
}

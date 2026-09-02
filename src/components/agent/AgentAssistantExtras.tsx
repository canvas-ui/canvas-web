import { type AgentResponseMetadata } from '@/services/agent'
import { MarkdownView } from '@/components/common/markdown-view'

interface AgentAssistantExtrasProps {
  reasoning?: string
  metadata?: AgentResponseMetadata
  isStreaming?: boolean
  compact?: boolean
}

function formatTokenUsage(metadata?: AgentResponseMetadata): string | null {
  const usage = metadata?.usage
  if (!usage) return null

  const total = usage.totalTokens
  const input = usage.input
  const output = usage.output

  if (typeof total === 'number' && typeof input === 'number' && typeof output === 'number') {
    return `${total} tok (${input} in / ${output} out)`
  }
  if (typeof total === 'number') return `${total} tok`
  return null
}

function formatCost(metadata?: AgentResponseMetadata): string | null {
  const total = metadata?.usage?.cost?.total
  if (typeof total !== 'number') return null
  return `$${total.toFixed(total < 0.01 ? 6 : 4)}`
}

export function AgentAssistantExtras({
  reasoning,
  metadata,
  isStreaming = false,
  compact = false,
}: AgentAssistantExtrasProps) {
  const model = metadata?.model
  const provider = metadata?.provider
  const tokenUsage = formatTokenUsage(metadata)
  const cost = formatCost(metadata)
  const metaParts = [provider, model, tokenUsage, cost].filter(Boolean)

  if (!reasoning && metaParts.length === 0) return null

  return (
    <>
      {reasoning && (
        <details
          open={isStreaming}
          className={`mb-2 rounded border border-border bg-background ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}
        >
          <summary className={`cursor-pointer font-medium text-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>
            Reasoning
          </summary>
          <MarkdownView
            content={reasoning}
            className={`mt-1 text-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}
          />
        </details>
      )}
      {metaParts.length > 0 && (
        <div className={`mt-2 text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {metaParts.join(' • ')}
        </div>
      )}
    </>
  )
}

export default AgentAssistantExtras

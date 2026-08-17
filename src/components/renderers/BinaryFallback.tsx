import type { RendererProps } from './types'

export function BinaryFallback({ document }: RendererProps) {
  const mime = String(document.metadata?.contentType || 'application/octet-stream')
  return (
    <p className="text-sm text-muted-foreground">
      No inline preview available for <span className="font-mono">{mime}</span>. Use Download.
    </p>
  )
}

import type { RendererProps } from './types'
import { resolveRenderer } from './resolve-renderer'

export function DocumentRenderer({ workspaceId, document, className }: RendererProps) {
  // resolveRenderer only ever returns module-level components (never creates
  // one), so identity is stable per document — the static-components rule
  // can't see that (suppressed at the JSX below).
  const Renderer = resolveRenderer(document)
  if (!Renderer) {
    return <pre className="overflow-auto p-2 text-xs">{JSON.stringify(document.data, null, 2)}</pre>
  }
  // eslint-disable-next-line react-hooks/static-components
  return <Renderer workspaceId={workspaceId} document={document} className={className} />
}

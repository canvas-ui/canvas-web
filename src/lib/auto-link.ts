import type { HookRule } from '../services/hooks'

export interface AutoLinkDestination {
  tree: 'context' | 'directory'
  path: string
}

export function buildAutoLinkRule(id: string, source: string, destinations: AutoLinkDestination[], recursive = false): HookRule {
  if (!source.startsWith('/') || !destinations.length) throw new Error('Choose a source folder and at least one destination.')
  const paths = new Map<string, AutoLinkDestination>()
  for (const target of destinations) {
    if (!['context', 'directory'].includes(target.tree) || !target.path.startsWith('/')) throw new Error('Choose a context or directory destination.')
    // Rule paths support interpolation. A folder name must never become a template.
    if (target.path.includes('{{')) throw new Error('Auto-Link destinations cannot contain {{ template markers.')
    paths.set(`${target.tree}:${target.path}`, target)
  }
  return {
    id,
    enabled: true,
    description: `Auto-Link backends:${source} → ${[...paths.keys()].join(', ')}`,
    // Backend placement may itself have been made by a storage rule. Linking
    // emits no events, so these rules can safely accept automated placements.
    cascade: true,
    when: { event: ['document.inserted', 'document.updated', 'document.linked'], ...(recursive ? { path: `backends:${source}` } : { pathExact: `backends:${source}` }) },
    then: [...paths.values()].map(target => ({
      action: 'link', paths: [`${target.tree === 'context' ? 'ctx' : 'dir'}:${target.path}`],
      ...(recursive ? { recursive: true } : {}),
    })),
  }
}

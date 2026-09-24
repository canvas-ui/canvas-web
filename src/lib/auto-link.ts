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

export type AutoLinkDirection = 'forward' | 'reverse' | 'both'

/** Related rules share an ID prefix; each remains independently manageable. */
export function buildAutoLinkRules(id: string, source: string, destinations: AutoLinkDestination[], recursive = false, direction: AutoLinkDirection = 'forward', mode: 'copy' | 'move' = 'copy', storage?: { address: string; key: string }): HookRule[] {
  const forward = buildAutoLinkRule(id, source, destinations, recursive)
  if (direction === 'forward') return [forward]
  const parts = source.split('/').filter(Boolean)
  if (parts.length < 2 || source.includes('{{') || parts.some(part => part === '.' || part === '..')) throw new Error('Choose a backend folder with a valid storage address.')
  if (!storage) throw new Error('Choose a writable backend folder.')
  const backend = storage.address
  const folder = storage.key
  const targets = [...new Map(destinations.map(target => [`${target.tree}:${target.path}`, target])).values()]
  const reverse: HookRule = {
    id: `${id}-reverse`, enabled: true,
    description: `Auto-Link ${targets.map(target => `${target.tree}:${target.path}`).join(', ')} → backends:${source} (${mode})`,
    // User insertions and explicit links only; automated placements must not
    // echo through another reverse rule and fan out across storage folders.
    cascade: false,
    when: { event: ['document.inserted', 'document.linked'],
      [recursive ? 'path' : 'pathExact']: targets.map(target => `${target.tree}:${target.path}`) },
    then: [{ action: 'store', to: backend, folder, mode, autoLink: true, onConflict: 'error', ...(recursive ? { recursive: true } : {}) }],
  }
  return direction === 'both' ? [forward, reverse] : [reverse]
}

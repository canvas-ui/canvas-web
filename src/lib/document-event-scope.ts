// What a workspace socket event touched, and whether a given document view
// can have changed because of it.
//
// Background: an ingest (IMAP sync, bulk upload) emits a steady stream of
// document/tree events. Treating every one as "something changed somewhere"
// dropped the whole workspace's document cache and refetched the open view
// several times a second, even when the writes landed under /imap/… and the
// user was looking at an unrelated context. Events do say where they landed
// — tree selectors ({ tree: <id>, path }), tree events (treeName +
// contextSpec), `changed` on link/unlink, or just document ids on
// content/relation updates. Anything we cannot place stays conservative:
// "unknown" matches every view, exactly like the old behaviour.

export type TreeKind = 'context' | 'directory'

export interface EventTarget {
  /** Tree name; null = the default tree of `kind` (or an id we could not resolve). */
  tree: string | null
  kind: TreeKind | null
  path: string
}

export interface EventScope {
  /** Tree placements the event touched. */
  targets: EventTarget[]
  /** Documents whose content changed (update events without placement). */
  ids: number[]
  /** Nothing placeable: treat as touching every view. */
  unknown: boolean
}

export interface ViewScope {
  tree: string
  kind: TreeKind
  path: string
  /** Whole-workspace scope views see every placement change. */
  wholeWorkspace?: boolean
}

type Selector = string | string[] | { tree?: unknown; treeId?: unknown; path?: unknown; paths?: unknown } | null | undefined

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function normalizePath(p: string): string {
  const trimmed = `/${p}`.replace(/\/+/g, '/').replace(/\/$/, '')
  return trimmed || '/'
}

function selectorTargets(selector: Selector, kind: TreeKind, treeNames: Map<string, string>): EventTarget[] {
  if (selector == null) return []
  if (Array.isArray(selector)) return selector.flatMap((s) => selectorTargets(s as Selector, kind, treeNames))
  if (typeof selector === 'string') return [{ tree: null, kind, path: normalizePath(selector) }]
  const rec = asRecord(selector)
  if (!rec) return []
  const rawTree = rec.tree ?? rec.treeId
  // Selectors carry the resolved tree id. Unresolvable (trees not loaded yet,
  // a tree created since) → null, which matches every tree of this kind.
  const tree = typeof rawTree === 'string' ? (treeNames.get(rawTree) ?? null) : null
  const paths = ([] as unknown[]).concat(rec.paths ?? rec.path ?? '/')
  return paths.filter((p): p is string => typeof p === 'string').map((path) => ({ tree, kind, path: normalizePath(path) }))
}

function eventIds(payload: Record<string, unknown>): number[] {
  const out: number[] = []
  const push = (v: unknown) => { const n = Number(v); if (Number.isSafeInteger(n) && n > 0) out.push(n) }
  if (Array.isArray(payload.ids)) payload.ids.forEach(push)
  if (Array.isArray(payload.documentIds)) payload.documentIds.forEach(push)
  if (payload.id != null) push(payload.id)
  if (payload.documentId != null) push(payload.documentId)
  return out
}

/** id → name lookup for selectors; names map to themselves too. */
export function treeNameLookup(trees: Array<{ id: string; name: string }>): Map<string, string> {
  const map = new Map<string, string>()
  for (const t of trees) { map.set(t.id, t.name); map.set(t.name, t.name) }
  return map
}

/**
 * Place a socket event. `treeNames` (see treeNameLookup) resolves the tree ids
 * selectors carry; without it they match any tree of their kind.
 */
export function documentEventScope(eventName: string, raw: unknown, treeNames: Map<string, string> = new Map()): EventScope {
  const payload = asRecord(raw)
  if (!payload) return { targets: [], ids: [], unknown: true }

  // tree.document.* and tree.layer.*: the tree names itself, contextSpec is the path.
  if (eventName.startsWith('tree.')) {
    const tree = typeof payload.treeName === 'string' ? payload.treeName : null
    const kind = payload.treeType === 'directory' || payload.treeType === 'context' ? payload.treeType as TreeKind : null
    const spec = payload.contextSpec ?? payload.path
    if (typeof spec === 'string') return { targets: [{ tree, kind, path: normalizePath(spec) }], ids: eventIds(payload), unknown: false }
    return { targets: [], ids: [], unknown: true }
  }

  const targets = [
    ...selectorTargets(payload.context as Selector, 'context', treeNames),
    ...selectorTargets(payload.directory as Selector, 'directory', treeNames),
  ]
  const changed = asRecord(payload.changed)
  if (changed) {
    targets.push(
      ...selectorTargets(changed.context as Selector, 'context', treeNames),
      ...selectorTargets(changed.directory as Selector, 'directory', treeNames),
    )
  }
  const ids = eventIds(payload)
  if (targets.length) return { targets, ids, unknown: false }
  // A content/relations update names only the document: it can change how
  // that document renders, not which view lists it.
  const placementFree = payload.reason === 'content' || payload.reason === 'relations'
  if (eventName.startsWith('document.updated') && placementFree && ids.length) return { targets: [], ids, unknown: false }
  // `context: null` + `directory: null` is still "no placement" — but an
  // insert/remove we cannot place might be anywhere.
  return { targets: [], ids, unknown: true }
}

/** Same subtree: either path contains the other (segment-wise). */
export function pathsOverlap(a: string, b: string): boolean {
  if (a === b || a === '/' || b === '/') return true
  return a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
}

function targetMatchesView(target: EventTarget, view: ViewScope): boolean {
  if (target.kind && target.kind !== view.kind) return false
  if (target.tree && target.tree !== view.tree) return false
  return pathsOverlap(target.path, view.path)
}

/**
 * Could `view` show different documents after this event? `listedIds` are
 * the documents the view currently shows (for placement-free updates).
 */
export function eventTouchesView(scope: EventScope, view: ViewScope, listedIds?: Iterable<number>): boolean {
  if (scope.unknown) return true
  if (scope.targets.length) {
    if (view.wholeWorkspace) return true
    if (scope.targets.some((t) => targetMatchesView(t, view))) return true
  }
  if (scope.ids.length && listedIds) {
    const listed = listedIds instanceof Set ? listedIds as Set<number> : new Set(listedIds)
    if (scope.ids.some((id) => listed.has(id))) return true
  }
  return false
}

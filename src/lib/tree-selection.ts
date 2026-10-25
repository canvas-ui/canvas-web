/** Inclusive range in visible tree order; collapsed and filtered rows are absent. */
export function selectTreeRange(paths: string[], anchor: string | null, target: string): Set<string> {
  const end = paths.indexOf(target)
  if (end < 0) return new Set()
  const start = anchor === null ? -1 : paths.indexOf(anchor)
  return new Set(start < 0 ? [target] : paths.slice(Math.min(start, end), Math.max(start, end) + 1))
}

/** Removing a selected parent also removes its descendants. */
export function topLevelTreeSelection(paths: Iterable<string>): string[] {
  const selection = [...paths]
  return selection.filter(path => !selection.some(parent => parent !== path && path.startsWith(`${parent}/`)))
}

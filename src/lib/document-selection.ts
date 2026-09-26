/** Inclusive range in rendered order; an absent/hidden anchor starts at the target. */
export function selectDocumentRange(order: number[], anchor: number | null, target: number, previous: ReadonlySet<number>, additive = false): Set<number> {
  const end = order.indexOf(target)
  if (end < 0) return new Set(previous)
  const start = anchor === null ? -1 : order.indexOf(anchor)
  const from = start < 0 ? end : start
  const next = additive ? new Set(previous) : new Set<number>()
  for (const id of order.slice(Math.min(from, end), Math.max(from, end) + 1)) next.add(id)
  return next
}

// Completion only touches a predicate being typed, never its value or free text.
export function relationSearchCompletion(query: string, predicates: readonly string[]) {
  const match = /(^|\s)(!?)@([a-z-]*)$/i.exec(query)
  if (!match) return null
  const prefix = match[3].toLowerCase()
  return {
    before: query.slice(0, match.index) + match[1] + match[2],
    predicates: predicates.filter(predicate => predicate.startsWith(prefix)),
  }
}

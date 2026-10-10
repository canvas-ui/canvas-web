/** Extract exact ID constraints before fuzzy filtering the remaining text. */
export function parseDocumentIdQuery(query: string): { text: string; ids: number[]; invalid: boolean } {
  const ids: number[] = []
  let invalid = false
  const text = query.replace(/"[^"]*"|(^|\s)@id:([^\s]*)/g, (match: string, lead: string, value: string | undefined) => {
    if (value === undefined) return match
    const bare = value.replace(/^#/, '')
    const id = Number(bare)
    if (!/^\d+$/.test(bare) || !Number.isInteger(id) || id <= 0 || id > 0xffffffff) invalid = true
    else ids.push(id)
    return lead
  }).trim()
  return { text, ids, invalid }
}

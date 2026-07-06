// Tags are stored on documents as `metadata.features` entries with a `tag/` prefix
// (an allowed bitmap prefix — see synapsd indexes/bitmaps/lib/keys.js). The server
// normalizes the key further (lowercase, spaces -> _), so we only need to trim and
// prefix here. Returns a deduped list of `tag/<value>` strings.
export function tagsToFeatures(tags: string[]): string[] {
  const seen = new Set<string>()
  for (const raw of tags) {
    const t = raw.trim()
    if (!t) continue
    seen.add(`tag/${t}`)
  }
  return Array.from(seen)
}

// Inverse: extract the plain tag values from a document's `metadata.features`.
export function featuresToTags(features: string[] | undefined): string[] {
  return (features || []).filter(f => f.startsWith('tag/')).map(f => f.slice(4))
}

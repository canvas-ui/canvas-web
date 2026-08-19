// Relations (typed doc<->doc edges) can be written from more than one surface at
// once — the object card's Synapses tab, the shared details modal opened from a
// relation row, the document list's "Link to… › Relations" tab — and any of them
// may be on screen together. A write from one has to invalidate the others, so
// they all listen for this broadcast rather than each polling. Same shape as the
// existing `workspace:documents:refresh` event.
export const RELATIONS_CHANGED = 'workspace:relations:refresh'

export function announceRelationsChanged() {
  window.dispatchEvent(new CustomEvent(RELATIONS_CHANGED))
}

// Stable color per timeline — the timeline analog of schema-meta's schema→hue
// registry. A timeline reads the same color everywhere it appears: the density
// rail's stacked bars, the "Apply to" toggles (which double as the legend),
// and any future timeline-map view.
//
// Every value returned here is a CSS expression built from theme tokens rather
// than a literal hex. These land in inline `style` attributes, where `var()`
// resolves normally — so the timeline legend re-colours itself when the theme
// or colour scheme changes, with no re-render and nothing subscribing to it.

// Named timelines get a fixed slot from the categorical data palette. Slots are
// chosen to match intuition where it exists (created→green, deleted→amber), but
// they are categories, not statuses — see src/theme/css/data-palette.css.
const FIXED_TIMELINE_COLORS: Record<string, string> = {
  'crud:created': 'var(--data-5)', // green
  'crud:updated': 'var(--data-8)', // blue
  'crud:deleted': 'var(--data-3)', // amber
  'content': 'var(--data-10)',     // violet
  'tasks': 'var(--data-1)',        // red
}

// Domain timelines (wikipedia, personal, ...) get a deterministic hashed hue so
// "wikipedia is always the same teal" across sessions without a registry.
function hashHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0
  }
  return ((h % 360) + 360) % 360
}

export function timelineColor(name: string): string {
  // Only the hue is derived from the name; lightness and chroma come from the
  // theme. A hashed timeline colour is therefore exactly as legible in dark
  // mode, and as contrast-safe under the high-contrast theme, as a fixed one —
  // which the old `hsl(h 65% 48%)` was not.
  return FIXED_TIMELINE_COLORS[name] ?? `oklch(var(--data-l) var(--data-c) ${hashHue(name)})`
}

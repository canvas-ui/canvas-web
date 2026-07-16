// Stable color per timeline — the timeline analog of schema-meta's schema→hue
// registry. A timeline reads the same color everywhere it appears: the density
// rail's stacked bars, the "Apply to" toggles (which double as the legend),
// and any future timeline-map view.

const FIXED_TIMELINE_COLORS: Record<string, string> = {
  'crud:created': '#22c55e', // green-500
  'crud:updated': '#3b82f6', // blue-500
  'crud:deleted': '#f59e0b', // amber-500
  'content': '#a855f7',      // purple-500
  'tasks': '#f43f5e',        // rose-500
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
  return FIXED_TIMELINE_COLORS[name] ?? `hsl(${hashHue(name)} 65% 48%)`
}

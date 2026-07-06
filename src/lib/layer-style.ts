/**
 * Per-layer visual styling (icon + color), stored entirely in
 * `metadata.ui = { icon, color }`. Icon is an Iconify name string
 * (e.g. "ph:folder-fill"). Icon SVGs are fetched on-demand by <Icon/> from
 * the Iconify API; the picker's name list is fetched once and cached below.
 */
import type { LayerMetadata } from '@/types/workspace'

// Lazily fetch Phosphor's full icon catalog (~9k names), keeping only the
// fill weight. Cached after the first call so the picker pays the cost once.
let fillIconsPromise: Promise<string[]> | null = null
export function loadPhosphorFillIcons(): Promise<string[]> {
  if (!fillIconsPromise) {
    fillIconsPromise = fetch('https://api.iconify.design/collection?prefix=ph')
      .then((r) => r.json())
      .then((data: { uncategorized?: string[]; categories?: Record<string, string[]> }) => {
        const names = [
          ...(data.uncategorized ?? []),
          ...Object.values(data.categories ?? {}).flat(),
        ]
        return names.filter((n) => n.endsWith('-fill')).map((n) => `ph:${n}`)
      })
      .catch(() => {
        fillIconsPromise = null // allow retry on next open after a failed fetch
        return []
      })
  }
  return fillIconsPromise
}

// Search the whole Iconify catalog (all collections) on demand. Keeps the
// bundle slim — only matching names are fetched, SVGs still lazy-load.
export async function searchIcons(query: string, limit = 120): Promise<string[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const r = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${limit}`)
    const data: { icons?: string[] } = await r.json()
    return Array.isArray(data.icons) ? data.icons : []
  } catch {
    return []
  }
}

export const DEFAULT_FOLDER_ICON = 'ph:folder-fill'
export const DEFAULT_CANVAS_ICON = 'ph:squares-four-fill'
export const DEFAULT_WORKSPACE_ICON = 'ph:stack-fill'

// A small, friendly swatch palette for layer colors.
export const LAYER_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#64748b', '#78716c',
]

export interface LayerStyle {
  icon?: string
  color?: string
}

// Well-known folder names get a sensible default icon + color when the user
// hasn't styled them explicitly. Keys are lowercased folder names.
export const FOLDER_NAME_DEFAULTS: Record<string, LayerStyle> = {
  'home': { icon: 'ph:house-fill', color: '#3b82f6' },
  'travel': { icon: 'ph:airplane-tilt-fill', color: '#06b6d4' },
  'work': { icon: 'ph:briefcase-fill', color: '#64748b' },
  'books': { icon: 'ph:books-fill', color: '#a855f7' },
  'workouts': { icon: 'ph:barbell-fill', color: '#22c55e' },
  'sport': { icon: 'ph:barbell-fill', color: '#22c55e' },
  'sports': { icon: 'ph:barbell-fill', color: '#22c55e' },
  'fitness': { icon: 'ph:barbell-fill', color: '#22c55e' },
  'beauty': { icon: 'ph:flower-lotus-fill', color: '#ec4899' },
  'recipes': { icon: 'ph:cooking-pot-fill', color: '#f97316' },
  'to watch': { icon: 'ph:monitor-play-fill', color: '#f43f5e' },
  'to read': { icon: 'ph:book-open-text-fill', color: '#8b5cf6' },
  'learning': { icon: 'ph:graduation-cap-fill', color: '#6366f1' },
  'tech': { icon: 'ph:cpu-fill', color: '#14b8a6' },
  'music': { icon: 'ph:music-notes-fill', color: '#eab308' },
  'finance': { icon: 'ph:piggy-bank-fill', color: '#84cc16' },
  'shopping': { icon: 'ph:shopping-cart-fill', color: '#f59e0b' },
  'ideas': { icon: 'ph:lightbulb-filament-fill', color: '#facc15' },
}

type StyledNode = { metadata?: LayerMetadata; color?: string | null }

type NamedStyledNode = StyledNode & { name?: string; label?: string }

/**
 * Read the effective icon/color for a node (color field is a legacy fallback;
 * well-known folder names fall back to FOLDER_NAME_DEFAULTS).
 */
export function getLayerStyle(node: NamedStyledNode): LayerStyle {
  const ui = (node.metadata?.ui ?? {}) as LayerStyle
  const named = FOLDER_NAME_DEFAULTS[String(node.label ?? node.name ?? '').trim().toLowerCase()]
  return {
    icon: typeof ui.icon === 'string' ? ui.icon : named?.icon,
    color: typeof ui.color === 'string' ? ui.color : (node.color ?? named?.color),
  }
}

/**
 * Merge a style change into existing metadata and return the FULL metadata
 * object — the backend replaces `metadata` wholesale (Object.assign), so we
 * must send everything we want to keep.
 */
export function mergeLayerStyle(metadata: LayerMetadata | undefined, change: LayerStyle): LayerMetadata {
  const md = { ...(metadata ?? {}) } as Record<string, unknown>
  const ui = { ...((md.ui as Record<string, unknown>) ?? {}) }
  if ('icon' in change) { if (change.icon) ui.icon = change.icon; else delete ui.icon }
  if ('color' in change) { if (change.color) ui.color = change.color; else delete ui.color }
  md.ui = ui
  return md as LayerMetadata
}

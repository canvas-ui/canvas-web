/**
 * Theme registry — the single source of truth for which themes exist.
 *
 * A theme is registered here and defined in ./css/themes/<id>.css. Nothing
 * else in the app enumerates themes, so a picker built from this list can
 * never drift from what the CSS actually supports.
 *
 * Adding a theme:
 *   1. create ./css/themes/<id>.css
 *   2. @import it from ./css/index.css
 *   3. add an entry here and the id to ThemeId in ./types.ts
 */

import type { Density, SchemePreference, ThemeId, ThemeMeta, ThemePreferences } from './types'

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'canvas',
    name: 'Canvas',
    description: 'Black and white with a teal accent. Sheets of paper on a grey desk.',
    swatches: ['oklch(1 0 0)', 'oklch(0 0 0)', 'oklch(0.704 0.135 183)'],
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Cool arctic blues, lower contrast, softer corners.',
    swatches: ['oklch(0.976 0.006 251)', 'oklch(0.588 0.056 244)', 'oklch(0.686 0.062 213)'],
  },
  {
    id: 'contrast',
    name: 'High Contrast',
    description: 'WCAG AAA text contrast, square corners, hard borders, no shadows.',
    swatches: ['oklch(1 0 0)', 'oklch(0 0 0)', 'oklch(0.32 0.16 258)'],
  },
  {
    id: 'frost',
    name: 'Frosted Glass',
    description: 'Translucent, blurred surfaces over a soft backdrop. Best with a wallpaper.',
    swatches: ['oklch(0.92 0.008 250)', 'oklch(0.31 0.025 255)', 'oklch(0.55 0.05 250)'],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Monospaced and dense. Tighter rows and chrome for large displays.',
    swatches: ['oklch(0.17 0.006 152)', 'oklch(0.8 0.19 148)', 'oklch(0.75 0.12 220)'],
  },
] as const

export const THEME_IDS = THEMES.map((t) => t.id)

export const SCHEME_OPTIONS: readonly { id: SchemePreference; name: string }[] = [
  { id: 'system', name: 'System' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
] as const

export const DENSITY_OPTIONS: readonly { id: Density; name: string; description: string }[] = [
  { id: 'auto', name: 'Auto', description: 'Match the pointer: touch on phones, mouse on desktop' },
  { id: 'compact', name: 'Compact', description: 'Maximum rows per screen' },
  { id: 'comfortable', name: 'Comfortable', description: 'Balanced for mouse use' },
  { id: 'touch', name: 'Touch', description: 'Large targets for finger input' },
] as const

// Light is the default scheme, not 'system': Canvas is a document surface and
// its light theme is the designed-for-first one. Users who want dark (or want
// to follow the OS) opt in via appearance settings — that choice is stored and
// wins over this default from then on.
export const DEFAULT_PREFERENCES: ThemePreferences = {
  theme: 'canvas',
  scheme: 'light',
  density: 'auto',
}

/** localStorage key. Namespaced so it never collides with app state. */
export const THEME_STORAGE_KEY = 'canvas.ui.theme'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as string[]).includes(value)
}

export function isSchemePreference(value: unknown): value is SchemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function isDensity(value: unknown): value is Density {
  return value === 'auto' || value === 'compact' || value === 'comfortable' || value === 'touch'
}

/**
 * Coerce untrusted input into a valid preference set.
 *
 * Stored preferences are untrusted: the key is user-editable, and it outlives
 * the code that wrote it — a theme removed in a later release will still be in
 * someone's localStorage. Each field falls back independently so one stale
 * value doesn't discard the rest.
 */
export function normalizePreferences(input: unknown): ThemePreferences {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  return {
    theme: isThemeId(raw.theme) ? raw.theme : DEFAULT_PREFERENCES.theme,
    scheme: isSchemePreference(raw.scheme) ? raw.scheme : DEFAULT_PREFERENCES.scheme,
    density: isDensity(raw.density) ? raw.density : DEFAULT_PREFERENCES.density,
  }
}

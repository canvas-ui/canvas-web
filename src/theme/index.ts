/**
 * Canvas theme system — public API.
 *
 * Import from '@/theme', never from a file inside it. The internal layout is
 * free to change; this surface is the contract, and it is what a second host
 * (Tauri, a browser extension, Storybook) consumes.
 *
 * Two entry points, depending on the host:
 *
 *   React      wrap the tree in <ThemeProvider>, read state with useTheme()
 *   Anything   call applyTheme(prefs) directly — it only needs a DOM
 *
 * The CSS half is imported separately (see ./css/index.css), because a host
 * with its own Tailwind build needs to include it in that build rather than
 * receive it through a JS import.
 */

export { ThemeProvider } from './theme-provider'
export { ThemeContext } from './theme-context'
export { useTheme } from './use-theme'

export {
  applyTheme,
  applyThemeWithoutTransition,
  clearStoredPreferences,
  getSystemSchemeServerSnapshot,
  getSystemSchemeSnapshot,
  prefersDark,
  readStoredPreferences,
  resolveScheme,
  subscribeSystemScheme,
  watchSystemScheme,
  writeStoredPreferences,
} from './apply-theme'

export {
  DEFAULT_PREFERENCES,
  DENSITY_OPTIONS,
  SCHEME_OPTIONS,
  THEMES,
  THEME_IDS,
  THEME_STORAGE_KEY,
  isDensity,
  isSchemePreference,
  isThemeId,
  normalizePreferences,
} from './registry'

export type {
  ColorScheme,
  Density,
  SchemePreference,
  ThemeContextValue,
  ThemeId,
  ThemeMeta,
  ThemePreferences,
  ThemeState,
  ThemeStorage,
} from './types'

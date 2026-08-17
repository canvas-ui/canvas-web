/**
 * Theme system types.
 *
 * Kept free of React and DOM types so a non-React host (a Tauri sidecar, a
 * build script generating a theme preview) can import them without pulling in
 * the rest of the app.
 */

/** A named palette. Must match a `[data-theme='…']` block in ./css/themes/. */
export type ThemeId = 'canvas' | 'nord' | 'contrast' | 'terminal' | 'frost'

/** A resolved light/dark scheme — never 'system'; that is a preference. */
export type ColorScheme = 'light' | 'dark'

/**
 * What the user asked for. 'system' defers to the OS, which is the default
 * because an app that ignores the OS setting is the thing users complain
 * about first.
 */
export type SchemePreference = ColorScheme | 'system'

/**
 * Information density. 'auto' lets the CSS decide from pointer type — coarse
 * pointers get touch-sized targets — so the app is usable on a phone without
 * the user ever opening settings.
 */
export type Density = 'auto' | 'compact' | 'comfortable' | 'touch'

/** The full persisted preference set. */
export interface ThemePreferences {
  theme: ThemeId
  scheme: SchemePreference
  density: Density
}

/** Preferences plus everything derived from them. */
export interface ThemeState extends ThemePreferences {
  /** `scheme` with 'system' resolved against the OS. What the CSS sees. */
  resolvedScheme: ColorScheme
}

export interface ThemeContextValue extends ThemeState {
  setTheme: (theme: ThemeId) => void
  setScheme: (scheme: SchemePreference) => void
  setDensity: (density: Density) => void
  /** Convenience for a toolbar button: light ⇄ dark, leaving 'system' behind. */
  toggleScheme: () => void
  /** Restore defaults and forget the stored preference. */
  reset: () => void
}

/** Display metadata for building a theme picker. */
export interface ThemeMeta {
  id: ThemeId
  name: string
  description: string
  /** Representative swatches, for a preview chip. Presentation only. */
  swatches: readonly string[]
}

/**
 * Storage seam.
 *
 * The web build passes `localStorage`. A Tauri host can pass an adapter backed
 * by its own store so theme choice survives a reinstall and is shared with the
 * native shell, without this module importing anything Tauri-specific.
 */
export interface ThemeStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { ThemeContext } from './theme-context'
import {
  applyThemeWithoutTransition,
  clearStoredPreferences,
  getSystemSchemeServerSnapshot,
  getSystemSchemeSnapshot,
  readStoredPreferences,
  subscribeSystemScheme,
  writeStoredPreferences,
} from './apply-theme'
import { DEFAULT_PREFERENCES } from './registry'
import type {
  Density,
  SchemePreference,
  ThemeContextValue,
  ThemeId,
  ThemePreferences,
  ThemeStorage,
} from './types'

interface ThemeProviderProps {
  children: ReactNode
  /**
   * Preferences to start from, overriding anything stored. For a Tauri host
   * that owns theme choice natively, or for tests that need a fixed theme.
   */
  initial?: Partial<ThemePreferences>
  /** Storage backend. Defaults to localStorage; pass a Tauri store to share it. */
  storage?: ThemeStorage
  /**
   * Persist changes. Off for embedded previews that shouldn't clobber the
   * user's real choice while they're looking at a swatch.
   */
  persist?: boolean
}

export function ThemeProvider({ children, initial, storage, persist = true }: ThemeProviderProps) {
  // Read storage during the initializer, not in an effect: the inline boot
  // script (see index.html) has already applied these attributes to <html>, so
  // starting from anything else would flash the default theme for one frame
  // before correcting itself.
  const [preferences, setPreferences] = useState<ThemePreferences>(() => ({
    ...readStoredPreferences(storage),
    ...initial,
  }))

  // The OS preference is external state React reads, not state React owns —
  // so it comes through useSyncExternalStore rather than a media-query
  // listener writing into useState. That keeps `resolvedScheme` a derived
  // value available on the first render, instead of a second render correcting
  // the first.
  const systemScheme = useSyncExternalStore(
    subscribeSystemScheme,
    getSystemSchemeSnapshot,
    getSystemSchemeServerSnapshot,
  )

  const resolvedScheme = preferences.scheme === 'system' ? systemScheme : preferences.scheme

  // Push to the DOM. This is the legitimate shape of an effect: synchronising
  // an external system (the document, and localStorage) with React state. It
  // sets no state of its own.
  useEffect(() => {
    applyThemeWithoutTransition({ ...preferences, scheme: resolvedScheme })
  }, [preferences, resolvedScheme])

  useEffect(() => {
    if (persist) writeStoredPreferences(preferences, storage)
  }, [preferences, persist, storage])

  const setTheme = useCallback((theme: ThemeId) => {
    setPreferences((prev) => (prev.theme === theme ? prev : { ...prev, theme }))
  }, [])

  const setScheme = useCallback((scheme: SchemePreference) => {
    setPreferences((prev) => (prev.scheme === scheme ? prev : { ...prev, scheme }))
  }, [])

  const setDensity = useCallback((density: Density) => {
    setPreferences((prev) => (prev.density === density ? prev : { ...prev, density }))
  }, [])

  const toggleScheme = useCallback(() => {
    // Toggling away from 'system' commits to the opposite of what is currently
    // on screen — which is what the user is asking for by reaching for the
    // switch, regardless of how the current appearance was arrived at.
    setPreferences((prev) => ({
      ...prev,
      scheme:
        (prev.scheme === 'system' ? getSystemSchemeSnapshot() : prev.scheme) === 'dark'
          ? 'light'
          : 'dark',
    }))
  }, [])

  const reset = useCallback(() => {
    clearStoredPreferences(storage)
    setPreferences(DEFAULT_PREFERENCES)
  }, [storage])

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...preferences,
      resolvedScheme,
      setTheme,
      setScheme,
      setDensity,
      toggleScheme,
      reset,
    }),
    [preferences, resolvedScheme, setTheme, setScheme, setDensity, toggleScheme, reset],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

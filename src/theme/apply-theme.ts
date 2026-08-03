/**
 * Theme application — the DOM seam.
 *
 * Deliberately framework-free: it touches `document` and nothing else. React
 * is one caller (./theme-provider.tsx); a Tauri host that wants to drive the
 * theme from the native side, a test, or an embedded preview iframe are others.
 *
 * All state lives on `<html>` as data attributes, which is what the CSS in
 * ./css/ selects on. There is no JavaScript-held copy of the theme that could
 * disagree with what is rendered.
 */

import { DEFAULT_PREFERENCES, THEME_STORAGE_KEY, normalizePreferences } from './registry'
import type { ColorScheme, SchemePreference, ThemePreferences, ThemeStorage } from './types'

/** Media query for the OS dark preference. */
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** True when the DOM is reachable — false during SSR or in a plain Node test. */
function hasDom(): boolean {
  return typeof document !== 'undefined'
}

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DARK_QUERY).matches
}

/** Collapse a preference to the scheme the CSS should actually render. */
export function resolveScheme(preference: SchemePreference): ColorScheme {
  if (preference === 'system') return prefersDark() ? 'dark' : 'light'
  return preference
}

/**
 * Subscribe to OS scheme changes. Returns an unsubscribe function.
 *
 * Callers should only act on this while the preference is 'system'; the
 * listener itself stays attached either way, since attaching and detaching on
 * every preference change is more code than ignoring an event.
 */
export function watchSystemScheme(onChange: (scheme: ColorScheme) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(DARK_QUERY)
  const handler = (event: MediaQueryListEvent) => onChange(event.matches ? 'dark' : 'light')
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}

/*
 * useSyncExternalStore adapters.
 *
 * The OS colour preference is exactly what that hook is for: state owned
 * outside React that React needs to read. Going through the hook instead of
 * mirroring the media query into `useState` inside an effect means the scheme
 * is *derived* during render rather than corrected one render late — no
 * cascading re-render, and no flash of the wrong scheme on first paint.
 *
 * Both functions must keep stable identities across renders or the hook
 * resubscribes on every commit, so they are module-level, not inline.
 */

export function subscribeSystemScheme(onStoreChange: () => void): () => void {
  return watchSystemScheme(onStoreChange)
}

/** Snapshot for useSyncExternalStore. Returns a primitive, so it is stable. */
export function getSystemSchemeSnapshot(): ColorScheme {
  return prefersDark() ? 'dark' : 'light'
}

/** Server/prerender snapshot. No media query exists, so assume light. */
export function getSystemSchemeServerSnapshot(): ColorScheme {
  return 'light'
}

/**
 * Keep the browser/OS chrome in step with the theme.
 *
 * On Android Chrome this colours the status bar, on iOS the PWA status area,
 * and in a Tauri window with a transparent titlebar the titlebar itself. The
 * value is read back from the computed style rather than duplicated in JS, so
 * it stays correct no matter which theme is active or what it set.
 */
function syncBrowserChrome(root: HTMLElement): void {
  const background = getComputedStyle(root).getPropertyValue('--background').trim()
  if (!background) return

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = background
}

/**
 * Write the resolved theme to the DOM.
 *
 * Returns the resolved scheme so callers don't have to re-derive it.
 */
export function applyTheme(
  preferences: ThemePreferences,
  root: HTMLElement | undefined = hasDom() ? document.documentElement : undefined,
): ColorScheme {
  const resolved = resolveScheme(preferences.scheme)
  if (!root) return resolved

  root.dataset.theme = preferences.theme
  root.dataset.scheme = resolved
  root.dataset.density = preferences.density

  syncBrowserChrome(root)
  return resolved
}

/**
 * Suppress transitions for the duration of a theme switch.
 *
 * Without this, changing theme animates every transition-bearing element at
 * once — a slow, smeared repaint that reads as jank rather than polish. The
 * forced reflow between adding and removing the class is required: it flushes
 * the style change so the browser can't batch both mutations into one frame.
 */
export function applyThemeWithoutTransition(
  preferences: ThemePreferences,
  root: HTMLElement | undefined = hasDom() ? document.documentElement : undefined,
): ColorScheme {
  if (!root || typeof window === 'undefined') return applyTheme(preferences, root)

  const style = document.createElement('style')
  style.appendChild(
    document.createTextNode('*,*::before,*::after{transition:none!important;animation:none!important}'),
  )
  document.head.appendChild(style)

  const resolved = applyTheme(preferences, root)

  // Force a synchronous style flush before removing the override.
  void window.getComputedStyle(style).opacity
  document.head.removeChild(style)

  return resolved
}

export function readStoredPreferences(storage?: ThemeStorage): ThemePreferences {
  const store = storage ?? defaultStorage()
  if (!store) return DEFAULT_PREFERENCES
  try {
    const raw = store.getItem(THEME_STORAGE_KEY)
    return raw ? normalizePreferences(JSON.parse(raw)) : DEFAULT_PREFERENCES
  } catch {
    // Malformed JSON, or storage blocked by privacy settings. Neither is worth
    // failing a render over.
    return DEFAULT_PREFERENCES
  }
}

export function writeStoredPreferences(
  preferences: ThemePreferences,
  storage?: ThemeStorage,
): void {
  const store = storage ?? defaultStorage()
  if (!store) return
  try {
    store.setItem(THEME_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Quota exceeded or a locked-down Safari private window. The theme still
    // applies for this session; it just won't be remembered.
  }
}

export function clearStoredPreferences(storage?: ThemeStorage): void {
  const store = storage ?? defaultStorage()
  if (!store) return
  try {
    store.removeItem(THEME_STORAGE_KEY)
  } catch {
    /* see writeStoredPreferences */
  }
}

/** `localStorage`, or undefined where it isn't available or is blocked. */
function defaultStorage(): ThemeStorage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined
  } catch {
    return undefined
  }
}

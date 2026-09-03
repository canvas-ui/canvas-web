/**
 * Canvas theme for the sketch surface.
 *
 * Separate from the app's theme on purpose: a light canvas under a dark UI is
 * what most people want from a drawing surface (it reads as paper), so the app
 * scheme is only the default and the user's choice outlives the editor.
 */
const STORAGE_KEY = 'canvas.ui.sketch.theme'

export type CanvasTheme = 'light' | 'dark'

/** The app's resolved light/dark: data-scheme, NOT data-theme (a palette id). */
export function appScheme(): CanvasTheme {
  if (typeof document === 'undefined') return 'light'
  const scheme = document.documentElement.getAttribute('data-scheme')
  if (scheme === 'dark') return 'dark'
  if (scheme === 'light') return 'light'
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The stored override, or null when the user has never chosen one. */
export function readSketchTheme(): CanvasTheme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    // Private mode / blocked storage: fall back to the app scheme.
    return null
  }
}

export function writeSketchTheme(theme: CanvasTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Not worth surfacing — the choice just won't outlive the session.
  }
}

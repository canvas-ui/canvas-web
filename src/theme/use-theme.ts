import { useContext } from 'react'
import { ThemeContext } from './theme-context'
import type { ThemeContextValue } from './types'

/**
 * Read and change the active theme.
 *
 * Throws outside a ThemeProvider rather than returning a default: a silent
 * fallback would make `setTheme` a no-op that appears to work, which is a much
 * harder bug to find than a missing-provider error at mount.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a <ThemeProvider>')
  }
  return context
}

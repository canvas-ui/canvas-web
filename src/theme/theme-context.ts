import { createContext } from 'react'
import type { ThemeContextValue } from './types'

/**
 * Split from theme-provider.tsx so that file exports only its component.
 * Mixing a component and a non-component export in one module defeats React
 * Fast Refresh — editing the provider would force a full reload instead of a
 * hot swap, losing app state on every save.
 */
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

import { createContext } from 'react'
import type { AppletTarget } from './applet-target'

export const AppletTargetCtx = createContext<AppletTarget | undefined>(undefined)

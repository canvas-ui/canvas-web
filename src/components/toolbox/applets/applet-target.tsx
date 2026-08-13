import { type ReactNode } from 'react'
import { AppletTargetCtx, type AppletTarget } from './use-applet-target'

// Standalone hosts (the /apps/<app> route) provide an explicit binding; inside
// the toolbox no provider is mounted and the target derives from the focused
// navigation, mirroring useAddTarget's rules.
export function AppletTargetProvider({ target, children }: { target: AppletTarget; children: ReactNode }) {
  return <AppletTargetCtx.Provider value={target}>{children}</AppletTargetCtx.Provider>
}

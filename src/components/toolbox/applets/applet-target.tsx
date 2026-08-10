import type { ReactNode } from 'react'
import type { AddTarget } from '../add/useAddTarget'
import { AppletTargetCtx } from './applet-target-context'

// Where an applet reads from and writes to. Same discriminated union as the
// add-panel target, because an applet's data scope and its insert destination
// are the same thing by design.
export type AppletTarget = AddTarget

// Standalone hosts (the /apps/<app> route) provide an explicit binding; inside
// the toolbox no provider is mounted and the target derives from the focused
// navigation, mirroring useAddTarget's rules.
export function AppletTargetProvider({ target, children }: { target: AppletTarget; children: ReactNode }) {
  return <AppletTargetCtx.Provider value={target}>{children}</AppletTargetCtx.Provider>
}

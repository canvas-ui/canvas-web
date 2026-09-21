import type { PinnedCanvas, WebuiConfig } from '../services/user-config'

// Serialize read-modify-write operations so fast minimize/reorder clicks do
// not overwrite each other. Re-read to retain settings saved by other panels.
export function createHomePinsWriter(
  read: () => Promise<WebuiConfig>,
  write: (config: WebuiConfig) => Promise<WebuiConfig>,
  onSaved: (config: WebuiConfig) => void,
) {
  let pending = Promise.resolve()
  return (update: (pins: PinnedCanvas[]) => PinnedCanvas[]): Promise<void> => {
    const task = pending.then(async () => {
      const base = await read()
      const pins = update(base.home?.pinnedCanvases ?? [])
      const saved = await write({ ...base, home: { ...base.home, pinnedCanvases: pins } })
      onSaved(saved)
    })
    pending = task.catch(() => {})
    return task
  }
}

export function isHomePinMinimized(pin: PinnedCanvas, temporary: ReadonlySet<string>): boolean {
  return pin.minimized === true || temporary.has(pin.id)
}

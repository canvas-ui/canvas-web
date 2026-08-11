import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolbox } from '../toolbox-context'
import { APPLETS, appletsForMode, type AppletMode } from '../applets/registry'

// Apps tab: the applet launcher plus the host for the opened applet.
// Two sub-tabs mirror the two applet modes: Context applets see only data
// pre-filtered by the focused context; Global applets are context-free.
export function AppsPanel() {
  const { state, openApplet } = useToolbox()
  const [mode, setMode] = useState<AppletMode>('context')
  // Which applet is open lives in the toolbox, not here: this panel unmounts
  // whenever the toolbox closes, and a long-running applet (Lens) has to be
  // re-openable from outside it.
  const openId = state.appsAppletId

  const open = openId ? APPLETS.find(a => a.id === openId) : null

  if (open) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
          <button
            type="button"
            onClick={() => openApplet(null)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Back to applets"
            title="Back to applets"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <open.icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{open.label}</span>
        </div>
        <div className="min-h-0 flex-1">
          <open.Component />
        </div>
      </div>
    )
  }

  const list = appletsForMode(mode)

  return (
    <div className="flex h-full flex-col">
      {/* Sub-tab bar - same underline idiom as the Filters panel. */}
      <div className="flex shrink-0 border-b border-border">
        {(['context', 'global'] as AppletMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'flex-1 py-2.5 text-xs capitalize transition-colors',
              mode === m
                ? '-mb-px border-b-2 border-foreground font-semibold text-foreground'
                : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!list.length && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No {mode} applets yet.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openApplet(a.id)}
              className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 p-3 text-foreground transition-colors hover:bg-muted"
              title={a.description}
            >
              <a.icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs font-medium leading-none">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

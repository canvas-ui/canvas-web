import { useEffect, useState } from 'react'
import { listWorkspaces } from '@/services/workspace'
import './next.css'

/**
 * /next — content-centric shell scaffold (see README.md in this folder).
 *
 * What exists today: the wallpaper, the glass, the orb, and the three
 * surfaces the gestures will eventually reveal (pinned tasks, tree,
 * workspace list — the last one already live against the API as proof the
 * data layer reaches this shell). Canvas streams, voice and gestures land
 * here iteratively.
 */

type Surface = 'none' | 'tasks' | 'workspaces'

// Placeholder until pinned layers arrive from the tree service.
const STUB_TASKS = ['Inbox sweep', 'Canvas edge notes', 'Release 2.7']

export default function NextShell() {
  const [surface, setSurface] = useState<Surface>('none')
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)

  useEffect(() => {
    if (surface !== 'workspaces' || workspaces !== null) return
    listWorkspaces()
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]))
  }, [surface, workspaces])

  const toggle = (next: Surface) => setSurface((cur) => (cur === next ? 'none' : next))

  return (
    <div className="next-shell">
      <div className="next-wallpaper" aria-hidden><i /></div>

      {/* Center hint — replaced by the canvas stream. */}
      <div className="relative flex h-full flex-col items-center justify-center gap-3 select-none">
        <p className="text-2xl font-light tracking-wide text-white/80">Canvas</p>
        <p className="text-sm text-white/40">
          say something, or tap the orb. Swipe up for canvases (soon)
        </p>
      </div>

      {/* Pinned tasks — slides in from the left. */}
      {surface === 'tasks' && (
        <div className="next-glass absolute bottom-24 left-6 w-64 rounded-2xl p-3">
          <p className="px-2 pb-2 text-[11px] uppercase tracking-widest text-white/40">Pinned</p>
          <div className="flex flex-col gap-1">
            {STUB_TASKS.map((task) => (
              <button
                key={task}
                type="button"
                className="rounded-xl px-3 py-2 text-left text-sm text-white/85 transition-colors hover:bg-white/10"
              >
                {task}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Workspaces — the real list, straight from the shared data layer. */}
      {surface === 'workspaces' && (
        <div className="next-glass absolute bottom-24 right-6 w-72 rounded-2xl p-3">
          <p className="px-2 pb-2 text-[11px] uppercase tracking-widest text-white/40">Workspaces</p>
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {workspaces === null && <p className="px-3 py-2 text-sm text-white/50">Loading…</p>}
            {workspaces?.map((ws) => (
              <button
                key={ws.id}
                type="button"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-white/85 transition-colors hover:bg-white/10"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: ws.color || 'rgb(255 255 255 / 0.35)' }}
                />
                <span className="truncate">{ws.label || ws.name}</span>
              </button>
            ))}
            {workspaces?.length === 0 && <p className="px-3 py-2 text-sm text-white/50">No workspaces</p>}
          </div>
        </div>
      )}

      {/* The one control. Click cycles surfaces for now; long-press/voice and
          real gestures replace this. */}
      <div className="absolute bottom-6 right-6 flex items-center gap-3">
        {surface !== 'none' && (
          <button
            type="button"
            onClick={() => toggle(surface === 'tasks' ? 'workspaces' : 'tasks')}
            className="next-glass rounded-full px-4 py-2 text-xs text-white/70"
          >
            {surface === 'tasks' ? 'workspaces' : 'pinned'}
          </button>
        )}
        <button
          type="button"
          onClick={() => toggle('tasks')}
          aria-label="Toolbox"
          className="next-orb flex h-14 w-14 items-center justify-center rounded-full"
        >
          <span className="h-3 w-3 rounded-full bg-white/85" />
        </button>
      </div>
    </div>
  )
}

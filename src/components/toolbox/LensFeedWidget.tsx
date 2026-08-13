import { CircleStop, Maximize2, Pause, Play, Camera, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLensFeed } from './use-lens-feed'
import { LensFeedVideo } from './lens-feed-context'

// The running Lens feed, collapsed.
//
// The feed outlives the panel that started it, so when no panel is showing it
// the session must not go invisible — a camera with no on-screen trace is both
// a privacy problem and unstoppable. This is that trace: the live preview, the
// stream controls, and a way back into the panel it came from.
//
// It appears exactly when the feed is running and nothing else is displaying
// it (`hasViewer`), which covers closing the toolbox, switching T1 tabs, and
// moving between Filters sub-tabs — all of which used to kill the camera.
export function LensFeedWidget() {
  const { running, hasViewer, paused, source, lastCount, error, setPaused, stop, reopen } = useLensFeed()

  if (!running || hasViewer) return null

  const SourceIcon = source === 'screen' ? Monitor : Camera

  return (
    <div
      className={cn(
        'fixed right-4 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-elevation-4 z-panel animate-fade-in',
        // Clear of the FAB, which occupies the same corner once the toolbox is
        // closed (and is hidden below md, where the widget sits low instead).
        'bottom-fab-inset md:bottom-[calc(var(--spacing-fab-inset)+5rem)]',
      )}
      role="status"
      aria-label="Lens feed running"
    >
      <button
        type="button"
        onClick={reopen}
        title="Back to Lens"
        className="relative block w-full cursor-pointer bg-black/80 aspect-video"
      >
        <LensFeedVideo className="h-full w-full object-cover" />
        {paused && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white">
            paused
          </span>
        )}
      </button>

      <div className="flex items-center gap-1 px-2 py-1.5">
        <SourceIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : paused ? (
            'paused'
          ) : (
            `live · ${lastCount ?? '…'} match${lastCount === 1 ? '' : 'es'}`
          )}
        </span>
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? 'Resume Lens' : 'Pause Lens'}
          title={paused ? 'Resume searching' : 'Pause searching (camera stays on)'}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={reopen}
          aria-label="Reopen Lens panel"
          title="Reopen Lens"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={stop}
          aria-label="Stop Lens feed"
          title="Stop the feed"
          className="rounded p-1 text-destructive transition-colors hover:bg-destructive/10"
        >
          <CircleStop className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

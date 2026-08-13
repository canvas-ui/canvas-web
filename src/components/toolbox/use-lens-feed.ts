import { createContext, useContext, useEffect } from 'react'
import type { LensFeedValue } from './lens-feed-context'

export const LensFeedCtx = createContext<LensFeedValue | null>(null)

export function useLensFeed(): LensFeedValue {
  const ctx = useContext(LensFeedCtx)
  if (!ctx) throw new Error('useLensFeed must be used within a LensFeedProvider')
  return ctx
}

/**
 * Declare that this component is showing the feed. While at least one viewer
 * is mounted the collapsed widget hides — two live previews of the same camera
 * on screen reads as two cameras.
 *
 * Pass false when the panel is mounted but NOT displaying the stream (the
 * other consumer owns it): the feed is then still unattended, and the widget
 * has to stay up.
 */
export function useLensFeedViewer(showing = true): void {
  const { registerViewer } = useLensFeed()
  useEffect(() => {
    if (!showing) return
    return registerViewer()
  }, [showing, registerViewer])
}

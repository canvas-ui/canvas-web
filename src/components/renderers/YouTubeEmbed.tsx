import { youTubeVideoId, type RendererProps } from './types'

// Privacy-enhanced YouTube embed for link/tab documents pointing at a video.
// Server CSP allows frame-src https://www.youtube-nocookie.com.
export function YouTubeEmbed({ document, className = '' }: RendererProps) {
  const url = String(document.data?.url ?? document.data?.uri ?? '')
  const videoId = youTubeVideoId(url)
  if (!videoId) return null
  return (
    <div className={`aspect-video w-full ${className}`}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`}
        title={String(document.data?.title ?? document.data?.label ?? 'YouTube video')}
        className="h-full w-full rounded border"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

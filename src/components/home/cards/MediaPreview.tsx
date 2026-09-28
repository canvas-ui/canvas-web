import { useEffect, useRef, useState } from 'react'

export function MediaPreview({ file }: { file: File }) {
  const mediaRef = useRef<HTMLImageElement & HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    const url = URL.createObjectURL(file)
    media.src = url
    return () => {
      media.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [file])

  return (
    <div className="flex min-h-24 items-center justify-center overflow-hidden rounded-md border border-input bg-muted/30">
      {failed ? (
        <p className="p-4 text-center text-sm text-muted-foreground">Preview unavailable for {file.name}. You can still save the original.</p>
      ) : file.type.startsWith('video/') ? (
        <video ref={mediaRef} controls preload="metadata" aria-label={file.name} onError={() => setFailed(true)} className="max-h-64 max-w-full" />
      ) : (
        <img ref={mediaRef} alt={file.name} onError={() => setFailed(true)} className="max-h-64 max-w-full object-contain" />
      )}
    </div>
  )
}

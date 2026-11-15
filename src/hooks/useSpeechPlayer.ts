import { useCallback, useEffect, useRef, useState } from 'react'

/** 50 ms of silence: playing it inside a tap unlocks later programmatic playback. */
function silentClip(): string {
  const samples = 400
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i) }
  text(0, 'RIFF'); view.setUint32(4, 36 + samples, true); text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true)
  text(36, 'data'); view.setUint32(40, samples, true)
  bytes.fill(128, 44)
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
}

/**
 * One reusable audio element for spoken replies. Mobile browsers only allow
 * playback that starts from a user gesture, and the reply arrives long after
 * the tap, so prime() is called inside the tap and play() reuses the element.
 */
export function useSpeechPlayer() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const setSource = useCallback((url: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
  }, [])

  const element = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio()
      audio.onended = () => setIsSpeaking(false)
      audio.onpause = () => setIsSpeaking(false)
      audioRef.current = audio
    }
    return audioRef.current
  }, [])

  const prime = useCallback(() => {
    const audio = element()
    audio.pause()
    const url = silentClip()
    setSource(url)
    audio.src = url
    audio.play().catch(() => { /* playback stays locked; replies are still shown as text */ })
  }, [element, setSource])

  const play = useCallback(async (clip: Blob) => {
    const audio = element()
    audio.pause()
    const url = URL.createObjectURL(clip)
    setSource(url)
    audio.src = url
    try {
      await audio.play()
      setIsSpeaking(true)
    } catch {
      setIsSpeaking(false)
    }
  }, [element, setSource])

  const stop = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  useEffect(() => () => {
    audioRef.current?.pause()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  return { isSpeaking, prime, play, stop }
}

import { useCallback, useRef, useState } from 'react'

/**
 * Minimal MediaRecorder wrapper: start() grabs the mic, stop() resolves the
 * recorded clip as a Blob (webm/opus where supported, browser default otherwise).
 */
export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [recorderError, setRecorderError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const start = useCallback(async () => {
    if (recorderRef.current) return
    setRecorderError(null)

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecorderError('Audio recording is not supported in this browser')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : undefined
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)
    } catch (err: any) {
      setRecorderError(err?.name === 'NotAllowedError'
        ? 'Microphone access denied'
        : err?.message ?? 'Could not start recording')
    }
  }, [])

  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current
    if (!recorder) return Promise.resolve(null)

    return new Promise((resolve) => {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach(track => track.stop())
        recorderRef.current = null
        setIsRecording(false)
        const type = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        resolve(blob.size > 0 ? blob : null)
      }
      recorder.stop()
    })
  }, [])

  const cancel = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return
    recorder.onstop = () => {
      recorder.stream.getTracks().forEach(track => track.stop())
    }
    recorder.stop()
    recorderRef.current = null
    chunksRef.current = []
    setIsRecording(false)
  }, [])

  return { isRecording, recorderError, start, stop, cancel }
}

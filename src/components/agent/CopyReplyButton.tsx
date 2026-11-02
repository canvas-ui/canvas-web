import { useEffect, useRef, useState } from 'react'

export function CopyReplyButton({ text }: { text: string }) {
  const [result, setResult] = useState<{ text: string; status: 'copied' | 'error' } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  if (!text) return null
  const status = result?.text === text ? result.status : null
  return <button type="button" aria-label="Copy reply text" title="Copy reply text"
    className="rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground [@media(hover:hover)]:opacity-0 group-hover/agent-reply:opacity-100 focus-visible:opacity-100"
    onClick={async () => {
      if (timer.current) clearTimeout(timer.current)
      try {
        await navigator.clipboard.writeText(text)
        setResult({ text, status: 'copied' })
      } catch {
        setResult({ text, status: 'error' })
      }
      timer.current = setTimeout(() => setResult(null), 2000)
    }}><span aria-live="polite">{status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed — retry' : '+ Copy text'}</span></button>
}

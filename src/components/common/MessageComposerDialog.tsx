import { useEffect, useRef, type ComponentProps } from 'react'
import { MessageComposer } from './MessageComposer'

/** Native modal stays above the document modal and keeps keyboard focus inside. */
export function MessageComposerDialog(props: ComponentProps<typeof MessageComposer>) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(props.onClose)
  useEffect(() => { closeRef.current = props.onClose })
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} aria-label={props.replyToDocumentId ? `${props.mode === 'forward' ? 'Forward' : props.mode === 'replyAll' ? 'Reply all' : 'Reply'} message` : 'Send test email'}
    className="m-auto w-[calc(100%-2rem)] max-w-3xl max-h-[90dvh] overflow-y-auto rounded-lg border bg-card p-0 text-foreground shadow-elevation-4 backdrop:bg-black/40"
    onKeyDown={(event) => event.stopPropagation()}
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); closeRef.current() }}>
    <MessageComposer {...props} />
  </dialog>
}

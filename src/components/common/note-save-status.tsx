import type { DraftStatus } from '@/lib/durable-draft'

export function NoteSaveStatus({ status, storageError, error, onRetry }: {
  status: DraftStatus; storageError: boolean; error: string; onRetry: () => Promise<unknown>
}) {
  return <p role="status" className="text-xs text-muted-foreground">
    {status === 'error' ? <><span title={error}>Couldn’t sync. {storageError ? 'Keep this editor open.' : 'Draft saved on this device.'}</span>{' '}<button type="button" className="underline" onClick={() => void onRetry().catch(() => {})}>Retry</button></>
      : status === 'saving' ? 'Saving…'
      : status === 'saved' ? 'Saved'
      : status === 'draft' ? storageError ? 'Draft recovery unavailable. Keep this editor open until saved.' : 'Draft saved on this device'
      : 'Changes save automatically'}
  </p>
}

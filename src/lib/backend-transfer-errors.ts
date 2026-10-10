export interface BackendTransferFailure { id: number; reason: string; code?: string }

export function backendTransferFailureMessage(failed: BackendTransferFailure[], names: ReadonlyMap<number, string>): string {
  return failed.slice(0, 3).map(failure => {
    const label = names.get(failure.id)
    const reason = failure.reason === 'not-found'
      ? 'Source missing from the storage index. Resync the source backend and retry.'
      : failure.reason === 'not found'
        ? 'Document no longer exists in this workspace. Refresh the list and select it again.'
        : failure.reason
    return `${label ? `${label} (ID ${failure.id})` : `Document ${failure.id}`}: ${reason}`
  }).join('\n') + (failed.length > 3 ? `\n…and ${failed.length - 3} more failed file${failed.length === 4 ? '' : 's'}.` : '')
}

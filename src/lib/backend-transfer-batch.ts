import type { BackendTransferResult } from '../services/workspace'

/** One request per deletion: progress and stopping have a committed boundary.
 * Never abort a destructive request and guess whether it completed.
 */
export async function runBackendDeletionBatch(
  ids: number[],
  request: (ids: number[]) => Promise<BackendTransferResult>,
  options: { shouldStop: () => boolean; onProgress: (completed: number, total: number) => void },
): Promise<BackendTransferResult & { pending: number[] }> {
  const result: BackendTransferResult & { pending: number[] } = { successful: [], failed: [], pending: [] }
  const unique = [...new Set(ids)]
  let completed = 0
  options.onProgress(0, unique.length)
  for (const id of unique) {
    if (options.shouldStop()) break
    try {
      const outcome = await request([id])
      result.successful.push(...outcome.successful)
      result.failed.push(...outcome.failed)
    } catch (error) {
      // A transport error has an uncertain outcome. Stop scheduling work and
      // keep this selection visible so the user can refresh before retrying.
      result.failed.push({ id, reason: error instanceof Error ? error.message : String(error) })
      completed++
      options.onProgress(completed, unique.length)
      break
    }
    completed++
    options.onProgress(completed, unique.length)
  }
  result.pending = unique.slice(completed)
  return result
}

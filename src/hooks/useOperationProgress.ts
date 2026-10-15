import { useCallback } from 'react'
import { useToast } from '@/components/ui/use-toast'

/** Keep feedback alive when the initiating menu or pane is closed. */
export function useOperationProgress() {
  const { showProgress } = useToast()
  return useCallback(async <T,>(title: string, description: string, success: string, operation: () => Promise<T>): Promise<T> => {
    const progress = showProgress({ title, description })
    try {
      const result = await operation()
      if (result === false) throw new Error('The operation could not be completed.')
      progress.done({ title: success, description })
      return result
    } catch (error) {
      progress.fail({ title: 'Operation failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
      throw error
    }
  }, [showProgress])
}

import { useToast } from '@/components/ui/use-toast'

export function useToastHelpers() {
  const { showToast } = useToast()

  const showErrorToast = (description: string, title = 'Error') =>
    showToast({ title, description, variant: 'destructive' })

  const showSuccessToast = (description: string, title = 'Success') =>
    showToast({ title, description })

  return { showErrorToast, showSuccessToast }
}

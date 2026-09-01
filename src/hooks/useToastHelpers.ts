import { useToast } from '@/components/ui/use-toast'

// Network-error suppression lives in ToastContainer.showToast (the choke
// point every toast goes through), not here — many callers bypass these
// helpers and call showToast directly.
export function useToastHelpers() {
  const { showToast } = useToast()

  const showErrorToast = (description: string, title = 'Error') =>
    showToast({ title, description, variant: 'destructive' })

  const showSuccessToast = (description: string, title = 'Success') =>
    showToast({ title, description })

  return { showErrorToast, showSuccessToast }
}

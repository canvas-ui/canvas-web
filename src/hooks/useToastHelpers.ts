import { useToast } from '@/components/ui/use-toast'
import { isOffline } from '@/lib/connectivity'

// Component catch-blocks forward the API's network-error message verbatim.
// Offline, every widget on a page fails the same way at once; the
// connectivity toast in App.tsx already said "Offline" once, so these
// per-component echoes are noise, not information.
const NETWORK_ERROR_RE = /^Network error/i

export function useToastHelpers() {
  const { showToast } = useToast()

  const showErrorToast = (description: string, title = 'Error') => {
    if (isOffline() && NETWORK_ERROR_RE.test(description)) return
    showToast({ title, description, variant: 'destructive' })
  }

  const showSuccessToast = (description: string, title = 'Success') =>
    showToast({ title, description })

  return { showErrorToast, showSuccessToast }
}

import { createContext, useContext } from 'react'

export type ToastType = {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  // Progress toast: spinner, no auto-dismiss — settled by its handle.
  busy?: boolean
}

export type ToastInput = Omit<ToastType, 'id' | 'busy'> & {
  /** Stable delivery identity/time for incoming notifications. */
  historyId?: string
  timestamp?: string
}

/** Handle for a long-running operation's toast; settle it exactly once. */
export type ProgressToast = {
  update: (toast: ToastInput) => void
  done: (toast?: ToastInput) => void
  fail: (toast: ToastInput) => void
}

export type ToastContextType = {
  showToast: (toast: ToastInput) => void
  // Shows immediately and stays until settled, then is replaced by the
  // result (or just dismissed when `done()` gets no toast).
  showProgress: (toast: ToastInput) => ProgressToast
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastContainer')
  }
  return context
}

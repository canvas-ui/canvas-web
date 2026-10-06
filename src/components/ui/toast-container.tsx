import React, { useMemo, useRef, useState, useCallback } from 'react'
import { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from './toast'
import { Loader2 } from 'lucide-react'
import { ToastContext, type ProgressToast, type ToastInput, type ToastType } from './use-toast'
import { isNetworkErrorMessage } from '@/lib/connectivity'

export function ToastContainer({ children }: { children?: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastType[]>([])

  // Keep a short-lived set of recent toast keys to avoid accidental spam (e.g. socket events firing multiple times)
  const recentToastKeys = useRef<Set<string>>(new Set())

  const showToast = useCallback((toast: ToastInput) => {
    // Network failures are shown by the persistent connection indicator.
    // Component catch-blocks all over the app forward the
    // API's network-error message verbatim via their own showToast calls, so
    // the suppression has to live here, at the single choke point — and
    // unconditionally, because connectivity state can flip between a parallel
    // request's success and this toast being raised.
    if (isNetworkErrorMessage(toast.description) || isNetworkErrorMessage(toast.title)) {
      return
    }
    const key = `${toast.title}:${toast.description ?? ''}`
    // If we already displayed the exact same toast very recently, skip it
    if (recentToastKeys.current.has(key)) {
      return
    }

    recentToastKeys.current.add(key)

    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { ...toast, id }])

    // Auto-dismiss toast and allow the same key again after timeout
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      recentToastKeys.current.delete(key)
    }, 5000)
  }, [])

  const showProgress = useCallback((toast: ToastInput): ProgressToast => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { ...toast, id, busy: true }])
    let settled = false
    const settle = (result?: ToastInput) => {
      if (settled) return
      settled = true
      setToasts((prev) => prev.filter((t) => t.id !== id))
      if (result) showToast(result)
    }
    return { done: settle, fail: settle }
  }, [showToast])

  const contextValue = useMemo(() => ({ showToast, showProgress }), [showToast, showProgress])

  return (
    <ToastContext.Provider value={contextValue}>
      <ToastProvider>
        {children}
        {toasts.map((toast) => (
          <Toast key={toast.id} variant={toast.variant} duration={toast.busy ? Infinity : undefined}>
            <div className="grid gap-1">
              <ToastTitle className="flex items-center gap-2">
                {toast.busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                {toast.title}
              </ToastTitle>
              {toast.description != null && <ToastDescription>{toast.description}</ToastDescription>}
            </div>
            {!toast.busy && <ToastClose />}
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  )
}


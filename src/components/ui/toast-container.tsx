import React, { useMemo, useRef, useState, useCallback } from 'react'
import { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from './toast'
import { ToastContext, type ToastType } from './use-toast'
import { isNetworkErrorMessage } from '@/lib/connectivity'

export function ToastContainer({ children }: { children?: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastType[]>([])

  // Keep a short-lived set of recent toast keys to avoid accidental spam (e.g. socket events firing multiple times)
  const recentToastKeys = useRef<Set<string>>(new Set())

  const showToast = useCallback((toast: Omit<ToastType, 'id'>) => {
    // Network-layer failures are reported ONCE by the connectivity transition
    // toast (App.tsx). Component catch-blocks all over the app forward the
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

  const contextValue = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={contextValue}>
      <ToastProvider>
        {children}
        {toasts.map((toast) => (
          <Toast key={toast.id} variant={toast.variant}>
            <div className="grid gap-1">
              <ToastTitle>{toast.title}</ToastTitle>
              {toast.description != null && <ToastDescription>{toast.description}</ToastDescription>}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  )
}


import React, { createContext, useContext, useState } from 'react'
import { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from './toast'

type ToastType = {
  id: string
  title: string
  description: string
  variant?: 'default' | 'destructive'
}

type ToastContextType = {
  showToast: (toast: Omit<ToastType, 'id'>) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastContainer({ children }: { children?: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastType[]>([])

  const showToast = (toast: Omit<ToastType, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      <ToastProvider>
        {children}
        {toasts.map((toast) => (
          <Toast key={toast.id} variant={toast.variant}>
            <div className="grid gap-1">
              <ToastTitle>{toast.title}</ToastTitle>
              <ToastDescription>{toast.description}</ToastDescription>
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastContainer')
  }
  return context
}

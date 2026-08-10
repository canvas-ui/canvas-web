import { createContext, useContext } from 'react'

export type ToastType = {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

export type ToastContextType = {
  showToast: (toast: Omit<ToastType, 'id'>) => void
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined)
export function useToast(): ToastContextType {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within a ToastContainer')
  return context
}

import { Navigate, useLocation } from 'react-router-dom'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const token = localStorage.getItem('token')
  const selectedSession = localStorage.getItem('selectedSession')
  const location = useLocation()
  
  if (!token) {
    return <Navigate to="/login" replace />
  }

  // Allow access to sessions page even without selected session
  if (location.pathname === '/sessions') {
    return <>{children}</>
  }

  // Redirect to sessions page if no session is selected
  if (!selectedSession) {
    return <Navigate to="/sessions" replace state={{ from: location }} />
  }

  return <>{children}</>
}
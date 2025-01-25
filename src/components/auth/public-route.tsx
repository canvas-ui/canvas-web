import { Navigate } from 'react-router-dom'

interface PublicRouteProps {
  children: React.ReactNode
}

export function PublicRoute({ children }: PublicRouteProps) {
  // Check if user is authenticated
  const token = localStorage.getItem('token')
  
  if (token) {
    // If authenticated, redirect to workspaces
    return <Navigate to="/workspaces" replace />
  }

  // If not authenticated, render the children (login/register page)
  return <>{children}</>
}
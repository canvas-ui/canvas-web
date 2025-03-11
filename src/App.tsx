import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/auth/login'
import RegisterPage from './pages/auth/register'
import WorkspacesPage from './pages/workspaces'
import { ProtectedRoute } from './components/auth/protected-route'
import { PublicRoute } from './components/auth/public-route'
import SessionsPage from './pages/sessions'
import ContextsPage from './pages/contexts'
import ApiTokensPage from './pages/api-tokens'
import { DashboardLayout } from './components/layouts/dashboard-layout'
import { ToastContainer } from './components/ui/toast-container'

function App() {
  return (
    <ToastContainer>
      <BrowserRouter>
        <Routes>
          {/* Auth routes - redirect to workspaces if authenticated */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />

          {/* Protected routes */}
          <Route
            path="/workspaces"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <WorkspacesPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sessions"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SessionsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contexts"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ContextsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/api-tokens"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ApiTokensPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Redirect root to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Catch all route - redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastContainer>
  )
}

export default App

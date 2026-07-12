import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import LoginPage from './pages/auth/login'
import RegisterPage from './pages/auth/register'
import WorkspacesPage from './pages/workspaces'
import WorkspaceDetailPage from './pages/workspaces/[workspaceName]'
import HomePage from './pages/home'
import ShareTargetPage from './pages/share-target'
import { ProtectedRoute } from './components/auth/protected-route'
import { PublicRoute } from './components/auth/public-route'
import ContextsPage from './pages/contexts'
import ContextDetailPage from './pages/contexts/[contextId]'
import ApiTokensPage from './pages/api-tokens'
import DevicesPage from './pages/devices'
import SharedViewerPage from './pages/shared'
import PublicCanvasPage from './pages/pub/canvas'
import AdminWorkspacesPage from './pages/admin/workspaces'
import AdminContextsPage from './pages/admin/contexts'
import AdminAgentsPage from './pages/admin/agents'
import AdminLogsPage from './pages/admin/logs'
import AdminRolesPage from './pages/admin/roles'
import AdminUsersPage from './pages/admin/users'
import AgentsPage from './pages/agents'
import AgentDetailPage from './pages/agents/[agentId]'
import WorkspaceSettingsPage from './pages/workspaces/[workspaceName]/settings'
import ContextSettingsPage from './pages/contexts/[contextId]/settings'
import RolesPage from './pages/roles'
import RemotesPage from './pages/remotes'
import { AppShell } from './components/shell/AppShell'
import { ToastContainer, useToast } from './components/ui/toast-container'
import { NotificationsProvider } from './components/notifications/notifications-context'
import { setGlobalErrorHandler } from './lib/error-handler'

function AppContent() {
  const { showToast } = useToast()

  useEffect(() => {
    // Set up global error handler for API errors
    setGlobalErrorHandler((error: Error, context?: string) => {
      showToast({
        title: 'Error',
        description: context ? `${error.message} (${context})` : error.message,
        variant: 'destructive'
      })
    })
  }, [showToast])

  return (
    <BrowserRouter>
      <Routes>
        {/* Authentication routes */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/pub/c/:code" element={<PublicCanvasPage />} />

        {/* Dashboard layout for authenticated routes */}
        <Route path="/" element={<ProtectedRoute><NotificationsProvider><AppShell /></NotificationsProvider></ProtectedRoute>}>
          <Route index element={<Navigate to="/workspaces" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="share-target" element={<ShareTargetPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="workspaces/:workspaceName" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:workspaceName/settings" element={<WorkspaceSettingsPage />} />
          <Route path="workspaces/:workspaceName/settings/:tab" element={<WorkspaceSettingsPage />} />
          <Route path="workspaces/:workspaceName/path/*" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:workspaceName/trees/:treeName" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:workspaceName/trees/:treeName/path/*" element={<WorkspaceDetailPage />} />
          <Route path="contexts" element={<ContextsPage />} />
          <Route path="contexts/:contextId" element={<ContextDetailPage />} />
          <Route path="contexts/:contextId/settings" element={<ContextSettingsPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/:agentId" element={<AgentDetailPage />} />
          <Route path="agents/:agentId/:sessionId" element={<AgentDetailPage />} />
          <Route path="agents/:agentId/settings" element={<AgentDetailPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="remotes" element={<RemotesPage />} />
          <Route path="api-tokens" element={<ApiTokensPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="shared" element={<SharedViewerPage />} />

          {/* Admin routes */}
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/contexts" element={<AdminContextsPage />} />
          <Route path="admin/workspaces" element={<AdminWorkspacesPage />} />
          <Route path="admin/agents" element={<AdminAgentsPage />} />
          <Route path="admin/logs" element={<AdminLogsPage />} />
          <Route path="admin/roles" element={<AdminRolesPage />} />
        </Route>

        {/* Catch-all redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  return (
    <ToastContainer>
      <AppContent />
    </ToastContainer>
  )
}

export default App

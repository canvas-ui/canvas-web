import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import LoginPage from './pages/auth/login'
import RegisterPage from './pages/auth/register'
import WorkspacesPage from './pages/workspaces'
import WorkspaceDetailPage from './pages/workspaces/[workspaceName]'
import HomePage from './pages/home'
import DeskPage from './pages/desk'
import ShareTargetPage from './pages/share-target'
import { ProtectedRoute } from './components/auth/protected-route'
import { PublicRoute } from './components/auth/public-route'
import ContextsPage from './pages/contexts'
import ContextDetailPage from './pages/contexts/[contextId]'
import ApiTokensPage from './pages/api-tokens'
import DevicesPage from './pages/devices'
import AppearancePage from './pages/appearance'
import EmbeddingDefaultsPage from './pages/embedding'
import SharedViewerPage from './pages/shared'
import PublicCanvasPage from './pages/pub/canvas'
import AdminWorkspacesPage from './pages/admin/workspaces'
import AdminContextsPage from './pages/admin/contexts'
import AdminAgentsPage from './pages/admin/agents'
import AdminLogsPage from './pages/admin/logs'
import AdminRolesPage from './pages/admin/roles'
import AdminUsersPage from './pages/admin/users'
import AdminEmbeddingPage from './pages/admin/embedding'
import AgentsPage from './pages/agents'
import AgentDetailPage from './pages/agents/[agentId]'
import AgentSettingsPage from './pages/agents/[agentId]/settings'
import WorkspaceSettingsPage from './pages/workspaces/[workspaceName]/settings'
import ContextSettingsPage from './pages/contexts/[contextId]/settings'
import RolesPage from './pages/roles'
import RemotesPage from './pages/remotes'
import AppletHostPage from './pages/apps'
import { UpdateBanner } from './components/common/update-banner'
import QuickAddPage from './pages/apps/add'
import { AppShell } from './components/shell/AppShell'
import { ToastContainer, useToast } from './components/ui/toast-container'
import { NotificationsProvider } from './components/notifications/notifications-context'
import { CanvasPinsProvider } from './components/home/pins-context'
import { setGlobalErrorHandler } from './lib/error-handler'
import { ThemeProvider } from './theme'

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
      <UpdateBanner />
      <Routes>
        {/* Authentication routes */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/pub/c/:code" element={<PublicCanvasPage />} />

        {/* Standalone applet host - chrome-free, one PWA-shortcut click away.
            /apps/add/:kind is more specific and matches inside the shell below. */}
        <Route path="/apps/:appletId" element={<ProtectedRoute><AppletHostPage /></ProtectedRoute>} />

        {/* Dashboard layout for authenticated routes */}
        <Route path="/" element={<ProtectedRoute><NotificationsProvider><CanvasPinsProvider><AppShell /></CanvasPinsProvider></NotificationsProvider></ProtectedRoute>}>
          {/* The empty desk. Closing any content section lands here. */}
          <Route index element={<DeskPage />} />
          <Route path="home" element={<HomePage />} />
          <Route path="share-target" element={<ShareTargetPage />} />
          {/* Quick-add shortcut landing - the B5 card flow inside the shell,
              same hosting as share-target. */}
          <Route path="apps/add/:kind" element={<QuickAddPage />} />
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
          <Route path="contexts/:contextId/settings/:tab" element={<ContextSettingsPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/:agentId" element={<AgentDetailPage />} />
          <Route path="agents/:agentId/:sessionId" element={<AgentDetailPage />} />
          <Route path="agents/:agentId/settings" element={<AgentSettingsPage />} />
          <Route path="agents/:agentId/settings/:tab" element={<AgentSettingsPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="remotes" element={<RemotesPage />} />
          <Route path="appearance" element={<AppearancePage />} />
          <Route path="api-tokens" element={<ApiTokensPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="embedding" element={<EmbeddingDefaultsPage />} />
          <Route path="shared" element={<SharedViewerPage />} />

          {/* Admin routes */}
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/contexts" element={<AdminContextsPage />} />
          <Route path="admin/workspaces" element={<AdminWorkspacesPage />} />
          <Route path="admin/agents" element={<AdminAgentsPage />} />
          <Route path="admin/logs" element={<AdminLogsPage />} />
          <Route path="admin/roles" element={<AdminRolesPage />} />
          <Route path="admin/embedding" element={<AdminEmbeddingPage />} />
        </Route>

        {/* Catch-all redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  return (
    // ThemeProvider is outermost: it owns the data-* attributes on <html> that
    // every other component's styling resolves against, including toasts and
    // dialogs that portal outside the router.
    <ThemeProvider>
      <ToastContainer>
        <AppContent />
      </ToastContainer>
    </ThemeProvider>
  )
}

export default App

import { Route } from 'react-router-dom'
import WorkspacesPage from '@/pages/workspaces'
import WorkspaceDetailPage from '@/pages/workspaces/[workspaceName]'
import HomePage from '@/pages/home'
import DeskPage from '@/pages/desk'
import ShareTargetPage from '@/pages/share-target'
import ContextsPage from '@/pages/contexts'
import ContextDetailPage from '@/pages/contexts/[contextId]'
import ApiTokensPage from '@/pages/api-tokens'
import DevicesPage from '@/pages/devices'
import AppearancePage from '@/pages/appearance'
import OfflinePage from '@/pages/offline'
import AboutPage from '@/pages/about'
import EmbeddingDefaultsPage from '@/pages/embedding'
import SharedViewerPage from '@/pages/shared'
import AdminWorkspacesPage from '@/pages/admin/workspaces'
import AdminContextsPage from '@/pages/admin/contexts'
import AdminAgentsPage from '@/pages/admin/agents'
import AdminLogsPage from '@/pages/admin/logs'
import AdminRolesPage from '@/pages/admin/roles'
import AdminUsersPage from '@/pages/admin/users'
import AdminEmbeddingPage from '@/pages/admin/embedding'
import AgentsPage from '@/pages/agents'
import AgentDetailPage from '@/pages/agents/[agentId]'
import AgentSettingsPage from '@/pages/agents/[agentId]/settings'
import WorkspaceSettingsPage from '@/pages/workspaces/[workspaceName]/settings'
import ContextSettingsPage from '@/pages/contexts/[contextId]/settings'
import RolesPage from '@/pages/roles'
import RemotesPage from '@/pages/remotes'
import QuickAddPage from '@/pages/apps/add'

// The pages hosted inside the app shell. One list, two consumers:
//   · App.tsx mounts it under the shell route (`<Outlet/>` in the content area)
//   · the strip layout's secondary canvases render it again inside their own
//     in-memory router (components/shell/strip/CanvasRouter.tsx), so a second
//     canvas shows the SAME page components for any shell URL.
// Keep it a fragment of <Route> elements: <Routes> reads its children with
// createRoutesFromChildren, which walks fragments; a component wrapper would
// not match.
export const shellRoutes = (
  <>
  {/* The empty desk. Closing any content section lands here. */}
  <Route key="r1" index element={<DeskPage />} />
  <Route key="r2" path="home" element={<HomePage />} />
  <Route key="r3" path="share-target" element={<ShareTargetPage />} />
  {/* Quick-add shortcut landing - the B5 card flow inside the shell,
      same hosting as share-target. */}
  <Route key="r4" path="apps/add/:kind" element={<QuickAddPage />} />
  <Route key="r5" path="workspaces" element={<WorkspacesPage />} />
  <Route key="r6" path="workspaces/:workspaceName" element={<WorkspaceDetailPage />} />
  <Route key="r7" path="workspaces/:workspaceName/settings" element={<WorkspaceSettingsPage />} />
  <Route key="r8" path="workspaces/:workspaceName/settings/:tab" element={<WorkspaceSettingsPage />} />
  <Route key="r9" path="workspaces/:workspaceName/path/*" element={<WorkspaceDetailPage />} />
  <Route key="r10" path="workspaces/:workspaceName/trees/:treeName" element={<WorkspaceDetailPage />} />
  <Route key="r11" path="workspaces/:workspaceName/trees/:treeName/path/*" element={<WorkspaceDetailPage />} />
  <Route key="r12" path="contexts" element={<ContextsPage />} />
  <Route key="r13" path="contexts/:contextId" element={<ContextDetailPage />} />
  <Route key="r14" path="contexts/:contextId/settings" element={<ContextSettingsPage />} />
  <Route key="r15" path="contexts/:contextId/settings/:tab" element={<ContextSettingsPage />} />
  <Route key="r16" path="agents" element={<AgentsPage />} />
  <Route key="r17" path="agents/:agentId" element={<AgentDetailPage />} />
  <Route key="r18" path="agents/:agentId/:sessionId" element={<AgentDetailPage />} />
  <Route key="r19" path="agents/:agentId/settings" element={<AgentSettingsPage />} />
  <Route key="r20" path="agents/:agentId/settings/:tab" element={<AgentSettingsPage />} />
  <Route key="r21" path="roles" element={<RolesPage />} />
  <Route key="r22" path="remotes" element={<RemotesPage />} />
  <Route key="r23" path="appearance" element={<AppearancePage />} />
  <Route key="r24" path="offline" element={<OfflinePage />} />
  <Route key="r25" path="about" element={<AboutPage />} />
  <Route key="r26" path="api-tokens" element={<ApiTokensPage />} />
  <Route key="r27" path="devices" element={<DevicesPage />} />
  <Route key="r28" path="embedding" element={<EmbeddingDefaultsPage />} />
  <Route key="r29" path="shared" element={<SharedViewerPage />} />

  {/* Admin routes */}
  <Route key="r30" path="admin/users" element={<AdminUsersPage />} />
  <Route key="r31" path="admin/contexts" element={<AdminContextsPage />} />
  <Route key="r32" path="admin/workspaces" element={<AdminWorkspacesPage />} />
  <Route key="r33" path="admin/agents" element={<AdminAgentsPage />} />
  <Route key="r34" path="admin/logs" element={<AdminLogsPage />} />
  <Route key="r35" path="admin/roles" element={<AdminRolesPage />} />
  <Route key="r36" path="admin/embedding" element={<AdminEmbeddingPage />} />
  </>
)

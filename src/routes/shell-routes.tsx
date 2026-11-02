import { lazy, Suspense, type ComponentType } from 'react'
import { Route } from 'react-router-dom'

const AppletHostPage = lazy(() => import('@/pages/apps'))
const AppsMenu = lazy(() => import('@/components/menu/apps/AppsMenu').then(module => ({ default: module.AppsMenu })))
const WorkspacesPage = lazy(() => import('@/pages/workspaces'))
const WorkspaceDetailPage = lazy(() => import('@/pages/workspaces/[workspaceName]'))
const WorkspaceDocumentPage = lazy(() => import('@/pages/workspaces/[workspaceName]/document'))
const HomePage = lazy(() => import('@/pages/home'))
const DeskPage = lazy(() => import('@/pages/desk'))
const ShareTargetPage = lazy(() => import('@/pages/share-target'))
const ContextsPage = lazy(() => import('@/pages/contexts'))
const ContextDetailPage = lazy(() => import('@/pages/contexts/[contextId]'))
const ApiTokensPage = lazy(() => import('@/pages/api-tokens'))
const DevicesPage = lazy(() => import('@/pages/devices'))
const SettingsPage = lazy(() => import('@/pages/settings'))
const AppearancePage = lazy(() => import('@/pages/appearance'))
const KeyBindingsPage = lazy(() => import('@/pages/key-bindings'))
const OfflinePage = lazy(() => import('@/pages/offline'))
const AboutPage = lazy(() => import('@/pages/about'))
const EmbeddingDefaultsPage = lazy(() => import('@/pages/embedding'))
const SharedViewerPage = lazy(() => import('@/pages/shared'))
const AdminWorkspacesPage = lazy(() => import('@/pages/admin/workspaces'))
const AdminContextsPage = lazy(() => import('@/pages/admin/contexts'))
const AdminAgentsPage = lazy(() => import('@/pages/admin/agents'))
const AdminLogsPage = lazy(() => import('@/pages/admin/logs'))
const AdminRolesPage = lazy(() => import('@/pages/admin/roles'))
const AdminUsersPage = lazy(() => import('@/pages/admin/users'))
const AdminEmbeddingPage = lazy(() => import('@/pages/admin/embedding'))
const AdminAuthPage = lazy(() => import('@/pages/admin/auth'))
const AgentsPage = lazy(() => import('@/pages/agents'))
const AgentDetailPage = lazy(() => import('@/pages/agents/[agentId]'))
const AgentSettingsPage = lazy(() => import('@/pages/agents/[agentId]/settings'))
const WorkspaceSettingsPage = lazy(() => import('@/pages/workspaces/[workspaceName]/settings'))
const ContextSettingsPage = lazy(() => import('@/pages/contexts/[contextId]/settings'))
const RolesPage = lazy(() => import('@/pages/roles'))
const RemotesPage = lazy(() => import('@/pages/remotes'))
const QuickAddPage = lazy(() => import('@/pages/apps/add'))
// Each route suspends locally so opening a page keeps the window chrome visible.
function page(Page: ComponentType) {
  return <Suspense fallback={<div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground" role="status">Opening…</div>}><Page /></Suspense>
}


// Pages shared by the app shell, secondary canvases and native desktop windows.
// Keep it a fragment of <Route> elements: <Routes> reads its children with
// createRoutesFromChildren, which walks fragments; a component wrapper would
// not match.
export const shellRoutes = (
  <>
  {/* The empty desk. Closing any content section lands here. */}
  <Route key="r1" index element={page(DeskPage)} />
  <Route key="r2" path="home" element={page(HomePage)} />
  <Route key="r3" path="share-target" element={page(ShareTargetPage)} />
  {/* Quick-add shortcut landing - the B5 card flow inside the shell,
      same hosting as share-target. */}
  <Route key="apps-index" path="apps" element={page(AppsMenu)} />
  <Route key="apps-host" path="apps/:appletId" element={page(AppletHostPage)} />
  <Route key="r4" path="apps/add/:kind" element={page(QuickAddPage)} />
  <Route key="r5" path="workspaces" element={page(WorkspacesPage)} />
  <Route key="r6" path="workspaces/:workspaceName" element={page(WorkspaceDetailPage)} />
  <Route key="workspace-document-by-id" path="workspaces/:workspaceName/documents/by-id/:documentId" element={page(WorkspaceDocumentPage)} />
  <Route key="workspace-document" path="workspaces/:workspaceName/documents/:documentId" element={page(WorkspaceDocumentPage)} />
  <Route key="workspace-document-by-hash" path="workspaces/:workspaceName/documents/by-hash/:algo/:checksum" element={page(WorkspaceDocumentPage)} />
  <Route key="workspace-document-by-checksum" path="workspaces/:workspaceName/documents/by-checksum/:algo/:checksum" element={page(WorkspaceDocumentPage)} />
  <Route key="r7" path="workspaces/:workspaceName/settings" element={page(WorkspaceSettingsPage)} />
  <Route key="r8" path="workspaces/:workspaceName/settings/:tab" element={page(WorkspaceSettingsPage)} />
  <Route key="r9" path="workspaces/:workspaceName/path/*" element={page(WorkspaceDetailPage)} />
  <Route key="r10" path="workspaces/:workspaceName/trees/:treeName" element={page(WorkspaceDetailPage)} />
  <Route key="r11" path="workspaces/:workspaceName/trees/:treeName/path/*" element={page(WorkspaceDetailPage)} />
  <Route key="r12" path="contexts" element={page(ContextsPage)} />
  <Route key="r13" path="contexts/:contextId" element={page(ContextDetailPage)} />
  <Route key="r14" path="contexts/:contextId/settings" element={page(ContextSettingsPage)} />
  <Route key="r15" path="contexts/:contextId/settings/:tab" element={page(ContextSettingsPage)} />
  <Route key="r16" path="agents" element={page(AgentsPage)} />
  <Route key="r17" path="agents/:agentId" element={page(AgentDetailPage)} />
  <Route key="r18" path="agents/:agentId/:sessionId" element={page(AgentDetailPage)} />
  <Route key="r19" path="agents/:agentId/settings" element={page(AgentSettingsPage)} />
  <Route key="r20" path="agents/:agentId/settings/:tab" element={page(AgentSettingsPage)} />
  <Route key="r21" path="roles" element={page(RolesPage)} />
  <Route key="r22" path="remotes" element={page(RemotesPage)} />
  <Route key="settings" path="settings" element={page(SettingsPage)} />
  <Route key="r23" path="appearance" element={page(AppearancePage)} />
  <Route key="key-bindings" path="key-bindings" element={page(KeyBindingsPage)} />
  <Route key="r24" path="offline" element={page(OfflinePage)} />
  <Route key="r25" path="about" element={page(AboutPage)} />
  <Route key="r26" path="api-tokens" element={page(ApiTokensPage)} />
  <Route key="r27" path="devices" element={page(DevicesPage)} />
  <Route key="r28" path="embedding" element={page(EmbeddingDefaultsPage)} />
  <Route key="r29" path="shared" element={page(SharedViewerPage)} />

  {/* Admin routes */}
  <Route key="r30" path="admin/users" element={page(AdminUsersPage)} />
  <Route key="r31" path="admin/contexts" element={page(AdminContextsPage)} />
  <Route key="r32" path="admin/workspaces" element={page(AdminWorkspacesPage)} />
  <Route key="r33" path="admin/agents" element={page(AdminAgentsPage)} />
  <Route key="r34" path="admin/logs" element={page(AdminLogsPage)} />
  <Route key="r35" path="admin/roles" element={page(AdminRolesPage)} />
  <Route key="r36" path="admin/embedding" element={page(AdminEmbeddingPage)} />
  <Route key="r37" path="admin/auth" element={page(AdminAuthPage)} />
  </>
)

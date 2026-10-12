type WorkspaceAccessSource = Pick<Workspace, 'access' | 'isShared' | 'type' | 'sharedVia' | 'remote'>

/** UI capability only; the server remains responsible for authorizing requests. */
export function canManageWorkspace(workspace: WorkspaceAccessSource | null | undefined): boolean {
  if (!workspace) return false
  // Owning a local reference does not grant admin access to its remote target.
  if (workspace.remote) return workspace.remote.permissions.includes('admin')
  if (workspace.access) return workspace.access.isOwner || workspace.access.permissions.includes('admin')
  if (workspace.isShared || workspace.type === 'shared') {
    return typeof workspace.sharedVia === 'object' && workspace.sharedVia?.permissions?.includes('admin') === true
  }
  // The workspace list marks every non-owned local workspace as shared.
  return true
}

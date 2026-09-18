/** Shared names belong to another user and may collide with an owned workspace. */
export function workspaceAddress(workspace: { id: string; name: string; isShared?: boolean; type?: string }): string {
  return workspace.isShared || workspace.type === 'shared' ? workspace.id : workspace.name
}

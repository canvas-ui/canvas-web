export function workspacePathUrl(target: { workspaceName: string; treeName: string; path: string }): string {
  const base = `/workspaces/${encodeURIComponent(target.workspaceName)}`
  const path = target.path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  return target.treeName === 'context'
    ? `${base}/path/${path}`
    : `${base}/trees/${encodeURIComponent(target.treeName)}/path/${path}`
}

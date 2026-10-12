export interface TreeBreadcrumb {
  label: string
  path: string
}

// Paths here are tree paths, already decoded by the router. In particular,
// a literal "%2F" in a folder name must not turn into another path segment.
export function treeBreadcrumbs(path: string, rootLabel: string): TreeBreadcrumb[] {
  const parts = path.split('/').filter(Boolean)
  return [
    { label: rootLabel, path: '/' },
    ...parts.map((label, index) => ({ label, path: `/${parts.slice(0, index + 1).join('/')}` })),
  ]
}

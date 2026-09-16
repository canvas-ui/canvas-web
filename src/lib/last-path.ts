// Last visited tree path per workspace — device-local, like the wallpaper.
//
// Switching workspaces used to drop the user at the root of the target every
// time, so getting back to a deep folder meant walking the tree again. The
// workspace page records where the user is; the entry points that open a
// workspace (M1 row, "Open workspace", the workspaces overview) resume there.
//
// Only real tree positions are recorded: layer views, search results and the
// workspace-wide document scope are transient and are not a "place".

import { buildWorkspaceUrl } from '@/utils/url-params'

export interface LastPath {
  tree: string
  path: string
}

const KEY = 'canvas:lastPath'
const MAX_ENTRIES = 200

type Store = Record<string, LastPath>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* private mode / quota: nothing to remember on this device */
  }
}

export function rememberWorkspacePath(workspaceName: string, tree: string, path: string): void {
  if (!workspaceName) return
  const store = read()
  const prev = store[workspaceName]
  if (prev && prev.tree === tree && prev.path === path) return
  // Re-insert so the map stays in most-recent-last order for the cap below.
  delete store[workspaceName]
  store[workspaceName] = { tree, path }
  const names = Object.keys(store)
  if (names.length > MAX_ENTRIES) {
    for (const name of names.slice(0, names.length - MAX_ENTRIES)) delete store[name]
  }
  write(store)
}

export function recallWorkspacePath(workspaceName: string): LastPath | null {
  const entry = read()[workspaceName]
  if (!entry || typeof entry.path !== 'string' || typeof entry.tree !== 'string') return null
  return entry
}

export function forgetWorkspacePath(workspaceName: string): void {
  const store = read()
  if (!(workspaceName in store)) return
  delete store[workspaceName]
  write(store)
}

// URL that resumes the workspace where the user left it; the root when the
// workspace has never been visited on this device.
export function workspaceResumeUrl(workspaceName: string): string {
  const last = recallWorkspacePath(workspaceName)
  return last ? buildWorkspaceUrl(workspaceName, last.path, last.tree) : `/workspaces/${workspaceName}`
}

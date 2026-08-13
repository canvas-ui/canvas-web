import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { House } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APPLETS } from '@/components/toolbox/applets/registry'
import { AppletTargetProvider } from '@/components/toolbox/applets/applet-target'
import type { AppletTarget } from '@/components/toolbox/applets/use-applet-target'
import { listWorkspaces, DEFAULT_WORKSPACE_TREE_NAME } from '@/services/workspace'
import { DocumentModalProvider } from '@/components/shell/document-modal-context'
import { LensFeedProvider } from '@/components/toolbox/lens-feed-context'
import { listContexts } from '@/services/context'

const DEFAULT_WORKSPACE = 'universe'

// Standalone applet host - /apps/<id>. The same applet components the toolbox
// Apps tab hosts, in a chrome-free page an installed PWA shortcut can open in
// one click. The binding lives in the URL so a bound applet is bookmarkable:
//   /apps/notes                       -> universe, path /
//   /apps/notes?workspace=w&path=/x   -> bind to a path
//   /apps/notes?context=<id>          -> bind to a context
//   ...&add=1                         -> open the inline creation draft
export default function AppletHostPage() {
  const { appletId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const applet = APPLETS.find(a => a.id === appletId)

  const contextId = searchParams.get('context')
  const workspace = searchParams.get('workspace') || DEFAULT_WORKSPACE
  const path = searchParams.get('path') || '/'
  const treeName = searchParams.get('tree') || DEFAULT_WORKSPACE_TREE_NAME
  const autoAdd = searchParams.get('add') === '1'

  const target = useMemo<AppletTarget>(() => contextId
    ? { mode: 'context', contextId }
    : {
        mode: 'workspace',
        workspaceName: workspace,
        path,
        treeName,
        treeType: treeName === 'directory' ? 'directory' : 'context',
      }, [contextId, workspace, path, treeName])

  // Binding bar data - loaded lazily, the applet works before either arrives.
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [contexts, setContexts] = useState<Context[]>([])
  useEffect(() => {
    listWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]))
    listContexts().then(setContexts).catch(() => setContexts([]))
  }, [])

  // Re-seed the draft whenever the URL's path changes (previous-value-in-state
  // pattern: reset during render instead of via an effect).
  const [pathDraft, setPathDraft] = useState(path)
  const [prevPath, setPrevPath] = useState(path)
  if (prevPath !== path) {
    setPrevPath(path)
    setPathDraft(path)
  }

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    // A binding change consumes the one-shot add flag.
    next.delete('add')
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k); else next.set(k, v)
    }
    setSearchParams(next, { replace: true })
  }

  if (!applet) {
    return (
      <div className="flex h-viewport flex-col items-center justify-center gap-3 surface-desk">
        <p className="text-sm text-muted-foreground">Unknown app{appletId ? ` "${appletId}"` : ''}.</p>
        <div className="flex gap-2">
          {APPLETS.map(a => (
            <Link key={a.id} to={`/apps/${a.id}`} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    )
  }

  const bindMode: 'path' | 'context' = contextId ? 'context' : 'path'

  return (
    <DocumentModalProvider>
    {/* Lens needs its feed hosted above the applet here too — this page has no
        shell, so nothing else would own the camera. */}
    <LensFeedProvider>
    <div className="flex h-viewport flex-col surface-desk p-shell gap-shell">
      {/* Header: identity + binding. Two binding modes: a workspace path
          (default /) or a context - the applet shows only what the binding
          scopes to, and creates into it. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-elevation-2">
        <applet.icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{applet.label}</span>

        <div className="ml-2 flex overflow-hidden rounded-md border border-border">
          {(['path', 'context'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (m === bindMode) return
                if (m === 'path') setParams({ context: null })
                else setParams({ context: contexts[0]?.id ?? '', workspace: null, path: null, tree: null })
              }}
              className={cn(
                'px-2.5 py-1 text-xs capitalize transition-colors',
                bindMode === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {bindMode === 'path' ? (
          <>
            <select
              value={workspace}
              onChange={(e) => setParams({ workspace: e.target.value, path: '/' })}
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
              aria-label="Workspace"
            >
              {!workspaces.some(w => w.name === workspace) && <option value={workspace}>{workspace}</option>}
              {workspaces.map(w => <option key={w.id} value={w.name}>{w.label || w.name}</option>)}
            </select>
            <input
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onBlur={() => { const p = pathDraft.trim() || '/'; if (p !== path) setParams({ path: p }) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              spellCheck={false}
              placeholder="/"
              className="h-7 w-40 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Path"
            />
          </>
        ) : (
          <select
            value={contextId ?? ''}
            onChange={(e) => setParams({ context: e.target.value })}
            className="h-7 max-w-56 rounded-md border border-input bg-transparent px-1.5 text-xs"
            aria-label="Context"
          >
            {!contextId && <option value="">Pick a context…</option>}
            {contexts.map(c => <option key={c.id} value={c.id}>{c.id}{c.url ? ` (${c.url})` : ''}</option>)}
          </select>
        )}

        <div className="grow" />
        <Link
          to="/home"
          className="flex items-center gap-1 rounded-md p-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Open the full Canvas app"
        >
          <House className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-elevation-2">
        {bindMode === 'context' && !contextId ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Pick a context above to bind {applet.label} to it.
          </div>
        ) : (
          <AppletTargetProvider target={target}>
            {/* Key on the binding so per-item edit state never leaks across bindings. */}
            <applet.Component key={JSON.stringify(target)} autoAdd={autoAdd} />
          </AppletTargetProvider>
        )}
      </div>
    </div>
    </LensFeedProvider>
    </DocumentModalProvider>
  )
}

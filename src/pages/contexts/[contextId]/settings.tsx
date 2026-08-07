import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { RefreshCw, Trash2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/common/page-header'
import { MenuTreeView } from '@/components/menu/shared/MenuTreeView'
import { useToast } from '@/components/ui/toast-container'
import { useMenu } from '@/components/shell/menu-context'
import { cn } from '@/lib/utils'
import {
  CONTEXT_SETTINGS_SECTIONS,
  resolveContextSettingsTab,
  type ContextSettingsTab,
} from '@/lib/settings-sections'
import {
  deleteContext,
  getContext,
  getContextTree,
  grantContextAccess,
  listContextShares,
  patchContext,
  revokeContextAccess,
  updateContext,
  updateContextUrl,
  type ContextShare,
} from '@/services/context'
import type { TreeNode } from '@/types/workspace'

const ACCESS_LEVELS: { value: string; label: string }[] = [
  { value: 'documentRead', label: 'Read' },
  { value: 'documentWrite', label: 'Write' },
  { value: 'documentReadWrite', label: 'Read & write' },
]

function urlToPath(url: string): string {
  const m = url.match(/:\/\/(.*)$/)
  if (m) return '/' + m[1].replace(/^\/+/, '')
  return url.startsWith('/') ? url : '/' + url
}

// Context settings, shaped exactly like workspace and agent settings: the
// section list is in M2 and one section renders here.
export default function ContextSettingsPage() {
  const { contextId, tab } = useParams<{ contextId: string; tab?: string }>()
  const [searchParams] = useSearchParams()
  const ownerId = searchParams.get('ownerId') || undefined
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { selectEntity } = useMenu()

  const activeTab: ContextSettingsTab = resolveContextSettingsTab(tab)
  // The ownerId qualifier has to survive the tab normalization, or a shared
  // context would lose its owner on the first redirect.
  const qs = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : ''
  useEffect(() => {
    if (tab !== activeTab && contextId) {
      navigate(`/contexts/${contextId}/settings/${activeTab}${qs}`, { replace: true })
    }
  }, [tab, activeTab, contextId, qs, navigate])

  const [context, setContext] = useState<Context | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  const [tree, setTree] = useState<TreeNode | null>(null)
  const [treeSettled, setTreeSettled] = useState(false)
  const [treeTarget, setTreeTarget] = useState<'url' | 'baseUrl'>('url')
  // Derived rather than a state flag, so the fetch effect only ever writes
  // state asynchronously.
  const isLoadingTree = activeTab === 'location' && !treeSettled

  const [shares, setShares] = useState<ContextShare[]>([])
  const [isLoadingShares, setIsLoadingShares] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [shareLevel, setShareLevel] = useState(ACCESS_LEVELS[0].value)
  const [busyShare, setBusyShare] = useState<string | null>(null)

  useEffect(() => {
    if (!contextId) return
    let cancelled = false
    getContext(contextId, ownerId).then(ctx => {
      if (cancelled) return
      setContext(ctx)
      selectEntity(ctx.id)
      setName(ctx.name || '')
      setDescription(ctx.description || '')
      setUrl(ctx.url || '')
      setBaseUrl(ctx.baseUrl || '')
    }).catch(() => {
      if (!cancelled) showToast({ title: 'Error', description: 'Failed to load context', variant: 'destructive' })
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [contextId, ownerId, selectEntity, showToast])

  // Tree and shares back a single section each, so they load with it.
  useEffect(() => {
    if (activeTab !== 'location' || !contextId || treeSettled) return
    getContextTree(contextId, ownerId)
      .then(setTree)
      .catch(() => {})
      .finally(() => setTreeSettled(true))
  }, [activeTab, contextId, ownerId, treeSettled])

  const loadShares = (id = contextId) => {
    if (!id) return
    setIsLoadingShares(true)
    listContextShares(id)
      .then(setShares)
      // Only owners may list shares; for a context shared with you this 403s,
      // which is not an error worth shouting about.
      .catch(() => setShares([]))
      .finally(() => setIsLoadingShares(false))
  }

  // Initial load for the section. It skips the spinner flag that loadShares
  // sets, so this effect never writes state synchronously.
  useEffect(() => {
    if (activeTab !== 'shares' || !contextId) return
    let cancelled = false
    listContextShares(contextId)
      .then(list => { if (!cancelled) setShares(list) })
      .catch(() => { if (!cancelled) setShares([]) })
    return () => { cancelled = true }
  }, [activeTab, contextId])

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contextId) return
    setIsSaving(true)
    try {
      const updated = await patchContext(contextId, {
        name: name.trim(),
        description: description.trim(),
      }, ownerId)
      setContext(updated)
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      showToast({ title: 'Saved', description: 'Context updated' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contextId) return
    setIsSaving(true)
    try {
      await Promise.all([
        updateContextUrl(contextId, url.trim(), ownerId),
        updateContext(contextId, { baseUrl: baseUrl.trim() || null }, ownerId),
      ])
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      showToast({ title: 'Saved', description: 'Context URL updated' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!contextId) return
    if (!window.confirm(`Delete context "${contextId}"? This cannot be undone.`)) return
    setIsDeleting(true)
    try {
      await deleteContext(contextId, ownerId)
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      showToast({ title: 'Deleted', description: `Context "${contextId}" removed` })
      navigate('/contexts')
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contextId || !shareEmail.trim()) return
    setBusyShare('grant')
    try {
      await grantContextAccess(contextId, shareEmail.trim(), shareLevel)
      setShareEmail('')
      loadShares()
      showToast({ title: 'Shared', description: `Access granted to ${shareEmail.trim()}` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to grant access', variant: 'destructive' })
    } finally {
      setBusyShare(null)
    }
  }

  const handleRevoke = async (share: ContextShare) => {
    if (!contextId) return
    if (!window.confirm(`Revoke ${share.userEmail}'s access to "${contextId}"?`)) return
    setBusyShare(share.userEmail)
    try {
      await revokeContextAccess(contextId, share.userEmail)
      loadShares()
      showToast({ title: 'Revoked', description: `${share.userEmail} no longer has access` })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to revoke access', variant: 'destructive' })
    } finally {
      setBusyShare(null)
    }
  }

  const handleTreeSelect = (path: string) => {
    const full = context?.workspaceName
      ? `${context.workspaceName}://${path.replace(/^\//, '')}`
      : path
    if (treeTarget === 'url') setUrl(full)
    else setBaseUrl(full)
  }

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  if (!context) return <div className="p-6 text-sm text-muted-foreground">Context not found</div>

  const section = CONTEXT_SETTINGS_SECTIONS.find(sec => sec.id === activeTab)!
  const backPath = `/contexts/${contextId}${qs}`

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6 pb-12">
        <PageHeader
          compact
          className="mb-6 border-b pb-4"
          title={`${section.label} - ${context.name || context.id}`}
          description={section.description}
          backTo={backPath}
        />

        {activeTab === 'general' && (
          <div className="space-y-6">
            <form onSubmit={handleSaveGeneral} className="space-y-4 rounded-lg border p-4">
              <div>
                <label className="text-sm font-medium">Context ID</label>
                <div className="mt-1 flex h-10 items-center rounded-md bg-muted px-3 font-mono text-sm text-muted-foreground">
                  {context.id}
                </div>
              </div>
              <div>
                <label htmlFor="ctx-name" className="text-sm font-medium">Name</label>
                <Input id="ctx-name" value={name} onChange={e => setName(e.target.value)} placeholder="My Context" />
              </div>
              <div>
                <label htmlFor="ctx-description" className="text-sm font-medium">Description</label>
                <Input id="ctx-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
              </div>
              <div>
                <label className="text-sm font-medium">Workspace</label>
                <div className="mt-1 flex h-10 items-center rounded-md bg-muted px-3 text-sm text-muted-foreground">
                  {context.workspaceName || context.workspaceId || context.workspace}
                </div>
              </div>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>

            <section className="rounded-lg border border-destructive/30 p-4">
              <h2 className="mb-3 text-sm font-semibold text-destructive">Danger Zone</h2>
              <Button variant="destructive" disabled={isDeleting} onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete Context'}
              </Button>
            </section>
          </div>
        )}

        {activeTab === 'location' && (
          <form onSubmit={handleSaveLocation} className="space-y-4 rounded-lg border p-4">
            <div>
              <label htmlFor="ctx-url" className="text-sm font-medium">URL</label>
              <Input id="ctx-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="workspace://path" className="font-mono" />
            </div>
            <div>
              <label htmlFor="ctx-base-url" className="text-sm font-medium">Base URL <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input id="ctx-base-url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="workspace://base/path" className="font-mono" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Pick from tree</span>
                <div className="flex items-center gap-1">
                  {(['url', 'baseUrl'] as const).map(target => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => setTreeTarget(target)}
                      className={cn(
                        'rounded px-2 py-1 text-xs font-medium transition-colors',
                        treeTarget === target
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      {target === 'url' ? 'URL' : 'Base URL'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-md border">
                <div className="max-h-72 overflow-y-auto">
                  <MenuTreeView
                    root={tree}
                    selectedPath={urlToPath(treeTarget === 'url' ? url : baseUrl)}
                    onSelect={handleTreeSelect}
                    isLoading={isLoadingTree}
                    readOnly
                    rootLabel={context.workspaceName}
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        )}

        {activeTab === 'shares' && (
          <div className="space-y-4">
            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">People with access</h2>
                  <p className="text-xs text-muted-foreground">Only the context owner can see and change this list.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => loadShares()} disabled={isLoadingShares}>
                  <RefreshCw className={cn('mr-2 h-3.5 w-3.5', isLoadingShares && 'animate-spin')} />
                  Refresh
                </Button>
              </div>
              {shares.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Not shared with anyone.
                </div>
              ) : shares.map(share => (
                <div key={share.userEmail} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{share.userEmail}</div>
                    <div className="text-xs text-muted-foreground">
                      {ACCESS_LEVELS.find(l => l.value === share.accessLevel)?.label || share.accessLevel || 'unknown access'}
                      {share.sharedAt && ` - since ${new Date(share.sharedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={busyShare === share.userEmail}
                    onClick={() => handleRevoke(share)}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </section>

            <form onSubmit={handleGrant} className="space-y-4 rounded-lg border p-4">
              <h2 className="text-sm font-semibold">Grant access</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="share-email" className="text-sm font-medium">User email</label>
                  <Input
                    id="share-email"
                    type="email"
                    value={shareEmail}
                    onChange={e => setShareEmail(e.target.value)}
                    placeholder="person@example.com"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">The user must already have an account on this server.</p>
                </div>
                <div>
                  <label htmlFor="share-level" className="text-sm font-medium">Access level</label>
                  <select
                    id="share-level"
                    value={shareLevel}
                    onChange={e => setShareLevel(e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {ACCESS_LEVELS.map(level => (
                      <option key={level.value} value={level.value}>{level.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={busyShare === 'grant' || !shareEmail.trim()}>
                {busyShare === 'grant' ? 'Sharing...' : 'Share context'}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

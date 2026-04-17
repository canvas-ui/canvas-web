import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { getContext, updateContextUrl, deleteContext } from '@/services/context'

export default function ContextSettingsPage() {
  const { contextId } = useParams<{ contextId: string }>()
  const [searchParams] = useSearchParams()
  const ownerId = searchParams.get('ownerId') || undefined
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [context, setContext] = useState<Context | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    async function load() {
      if (!contextId) return
      try {
        const ctx = await getContext(contextId, ownerId)
        setContext(ctx)
        setUrl(ctx.url || '')
      } catch (err) {
        showToast({ title: 'Error', description: 'Failed to load context', variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [contextId, ownerId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contextId) return
    setIsSaving(true)
    try {
      await updateContextUrl(contextId, url.trim(), ownerId)
      window.dispatchEvent(new CustomEvent('contexts:refresh'))
      showToast({ title: 'Saved', description: 'Context URL updated' })
      const backPath = ownerId ? `/contexts/${contextId}?ownerId=${encodeURIComponent(ownerId)}` : `/contexts/${contextId}`
      navigate(backPath)
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
      showToast({ title: 'Deleted', description: `Context ${contextId} has been removed` })
      navigate('/contexts')
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const backPath = ownerId ? `/contexts/${contextId}?ownerId=${encodeURIComponent(ownerId)}` : `/contexts/${contextId}`

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  }

  if (!context) {
    return <div className="p-6 text-sm text-muted-foreground">Context not found</div>
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(backPath)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold">Settings — {context.id}</h1>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <div>Workspace: {context.workspaceName || context.workspace}</div>
        {context.description && <div>Description: {context.description}</div>}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="ctx-url" className="text-sm font-medium">URL</label>
          <Input id="ctx-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="Context URL" />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(backPath)}>
            Cancel
          </Button>
        </div>
      </form>

      <div className="border-t pt-6 space-y-3">
        <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
        <Button variant="destructive" disabled={isDeleting} onClick={handleDelete}>
          <Trash2 className="w-4 h-4 mr-2" />
          {isDeleting ? 'Deleting...' : 'Delete Context'}
        </Button>
      </div>
    </div>
  )
}

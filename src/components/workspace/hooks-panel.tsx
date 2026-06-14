import { useEffect, useState } from 'react'
import { Plus, Save, Trash2, RefreshCw, Power, PowerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import {
  listHooks,
  getHook,
  saveHook,
  deleteHook,
  groupHooksByEvent,
  isHookEnabled,
  setHookEnabled,
  type HookFile,
} from '@/services/hooks'

interface HooksPanelProps {
  workspaceId: string
}

const NEW_HOOK_TEMPLATE = `export default async function run({ eventName, payload, workspace, logger, link, agent }) {
  // payload.context?.path / payload.directory?.path tell you where it landed
  logger.debug(\`hook \${eventName} id=\${payload?.id ?? payload?.ids}\`)
}
`

export function HooksPanel({ workspaceId }: HooksPanelProps) {
  const { showToast } = useToast()
  const [files, setFiles] = useState<HookFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [showNew, setShowNew] = useState(false)

  const loadFiles = async () => {
    try {
      setIsLoading(true)
      setFiles(await listHooks(workspaceId))
    } catch {
      showToast({ title: 'Error', description: 'Failed to load hooks', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadFiles() }, [workspaceId])

  const openFile = async (path: string) => {
    if (isDirty && !confirm('Discard unsaved changes?')) return
    try {
      setSelected(path)
      setContent(await getHook(workspaceId, path))
      setIsDirty(false)
    } catch {
      showToast({ title: 'Error', description: `Failed to open ${path}`, variant: 'destructive' })
    }
  }

  const save = async () => {
    if (!selected) return
    try {
      setIsSaving(true)
      await saveHook(workspaceId, selected, content)
      setIsDirty(false)
      showToast({ title: 'Saved', description: `${selected} saved` })
      await loadFiles()
    } catch {
      showToast({ title: 'Error', description: `Failed to save ${selected}`, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const toggle = async (path: string) => {
    const enabled = isHookEnabled(path)
    try {
      const next = await setHookEnabled(workspaceId, path, !enabled)
      if (selected === path) setSelected(next)
      await loadFiles()
      showToast({ title: enabled ? 'Disabled' : 'Enabled', description: next })
    } catch {
      showToast({ title: 'Error', description: `Failed to toggle ${path}`, variant: 'destructive' })
    }
  }

  const remove = async (path: string) => {
    if (!confirm(`Delete hook ${path}?`)) return
    try {
      await deleteHook(workspaceId, path)
      if (selected === path) { setSelected(null); setContent(''); setIsDirty(false) }
      await loadFiles()
      showToast({ title: 'Deleted', description: `${path} deleted` })
    } catch {
      showToast({ title: 'Error', description: `Failed to delete ${path}`, variant: 'destructive' })
    }
  }

  const createHook = async () => {
    const path = newPath.trim().replace(/^\/+/, '')
    if (!path.endsWith('.js')) {
      showToast({ title: 'Error', description: 'Hook path must end in .js (e.g. document.inserted/my-hook.js)', variant: 'destructive' })
      return
    }
    try {
      await saveHook(workspaceId, path, NEW_HOOK_TEMPLATE)
      setNewPath('')
      setShowNew(false)
      await loadFiles()
      await openFile(path)
    } catch {
      showToast({ title: 'Error', description: 'Failed to create hook', variant: 'destructive' })
    }
  }

  const groups = groupHooksByEvent(files)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Workspace Hooks</h3>
          <p className="text-sm text-muted-foreground">
            ES modules run in-process on workspace events. Saving commits to the workspace git repo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={loadFiles} title="Reload">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowNew(!showNew)}>
            <Plus className="mr-2 h-4 w-4" /> New Hook
          </Button>
        </div>
      </div>

      {showNew && (
        <div className="border rounded-lg p-3 flex gap-2 items-center bg-muted/50">
          <Input
            placeholder="document.inserted/my-hook.js"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            className="font-mono text-sm"
          />
          <Button size="sm" onClick={createHook}>Create</Button>
          <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 border rounded-lg p-2 max-h-[480px] overflow-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-2">Loading...</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">No hooks yet.</p>
          ) : (
            Object.entries(groups).map(([event, eventFiles]) => (
              <div key={event} className="mb-2">
                <div className="text-xs font-semibold text-muted-foreground px-2 py-1">{event}</div>
                {eventFiles.map((file) => {
                  const enabled = isHookEnabled(file.path)
                  return (
                  <div
                    key={file.path}
                    className={`flex items-center justify-between rounded px-2 py-1 cursor-pointer text-sm ${selected === file.path ? 'bg-muted' : 'hover:bg-muted/50'} ${enabled ? '' : 'opacity-50'}`}
                    onClick={() => openFile(file.path)}
                  >
                    <span className="font-mono truncate">{file.path}</span>
                    <div className="flex items-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title={enabled ? 'Disable' : 'Enable'}
                        onClick={(e) => { e.stopPropagation(); toggle(file.path) }}
                      >
                        {enabled ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3 text-muted-foreground" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); remove(file.path) }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="md:col-span-2 border rounded-lg p-2 flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm truncate">{selected}{isDirty ? ' •' : ''}</span>
                <Button size="sm" onClick={save} disabled={isSaving || !isDirty}>
                  <Save className="mr-2 h-4 w-4" /> Save
                </Button>
              </div>
              <textarea
                className="flex-1 min-h-[400px] w-full font-mono text-sm p-2 bg-background border rounded outline-none focus:ring-2 focus:ring-ring resize-none"
                spellCheck={false}
                value={content}
                onChange={(e) => { setContent(e.target.value); setIsDirty(true) }}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground min-h-[400px]">
              Select a hook to edit, or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

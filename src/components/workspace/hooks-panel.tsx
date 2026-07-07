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
  isExampleHook,
  setHookEnabled,
  getHooksMeta,
  generateHook,
  type HookFile,
  type HooksMeta,
} from '@/services/hooks'

interface HooksPanelProps {
  workspaceId: string
}

export function HooksPanel({ workspaceId }: HooksPanelProps) {
  const { showToast } = useToast()
  const [files, setFiles] = useState<HookFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [meta, setMeta] = useState<HooksMeta | null>(null)
  const [newEvent, setNewEvent] = useState('document.inserted')
  const [newName, setNewName] = useState('')
  const [newActions, setNewActions] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)

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

  const openWizard = async () => {
    setShowNew(!showNew)
    if (!meta) {
      try {
        setMeta(await getHooksMeta(workspaceId))
      } catch {
        showToast({ title: 'Error', description: 'Failed to load hook metadata', variant: 'destructive' })
      }
    }
  }

  const toggleAction = (id: string) => {
    setNewActions((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id])
  }

  const createHook = async () => {
    if (!newName.trim()) {
      showToast({ title: 'Error', description: 'Give the hook a name', variant: 'destructive' })
      return
    }
    try {
      setIsCreating(true)
      const { path } = await generateHook(workspaceId, {
        event: newEvent,
        name: newName.trim(),
        actions: newActions,
      })
      setShowNew(false)
      setNewName('')
      setNewActions([])
      await loadFiles()
      await openFile(path)
      showToast({ title: 'Created', description: `${path} — edit the TODOs, then enable it` })
    } catch {
      showToast({ title: 'Error', description: 'Failed to create hook', variant: 'destructive' })
    } finally {
      setIsCreating(false)
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
          <Button size="sm" variant="outline" onClick={openWizard}>
            <Plus className="mr-2 h-4 w-4" /> New Hook
          </Button>
        </div>
      </div>

      {showNew && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                1. When (event)
              </label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
              >
                {(meta?.events ?? []).map((event) => (
                  <option key={event.name} value={event.name}>
                    {event.name} — {event.description}
                  </option>
                ))}
              </select>
              {meta && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  payload: {meta.events.find((e) => e.name === newEvent)?.payload}
                </p>
              )}
              <label className="text-xs font-semibold text-muted-foreground block mt-3 mb-1">
                2. Name
              </label>
              <Input
                placeholder="my-hook"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                3. Then (actions — pick any)
              </label>
              <div className="space-y-1 max-h-52 overflow-auto pr-1">
                {(meta?.actions ?? []).map((action) => (
                  <label
                    key={action.id}
                    className="flex items-start gap-2 text-sm rounded px-2 py-1 hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={newActions.includes(action.id)}
                      onChange={() => toggleAction(action.id)}
                    />
                    <span>
                      <span className="font-medium">{action.label}</span>
                      <span className="block text-xs text-muted-foreground">{action.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={createHook} disabled={isCreating || !meta}>
              {isCreating ? 'Creating…' : 'Create skeleton'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <p className="text-xs text-muted-foreground">
              Creates a disabled skeleton — edit the TODOs, then enable it. Simple match→action
              automations can also go into <span className="font-mono">rules.json</span> (no code).
            </p>
          </div>
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
                    <span className="font-mono truncate flex items-center gap-1.5">
                      {file.path}
                      {isExampleHook(file.path) && (
                        <span className="text-[10px] uppercase tracking-wide rounded bg-muted-foreground/15 px-1 py-0.5 text-muted-foreground shrink-0">
                          example
                        </span>
                      )}
                    </span>
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

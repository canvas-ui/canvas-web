import { useEffect, useState } from 'react'
import { Plus, Save, Trash2, RefreshCw, Power, PowerOff, GitBranch, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CodeEditor } from '@/components/ui/code-editor'
import { useToast } from '@/components/ui/toast-container'
import { API_URL } from '@/config/api'
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
import { listScripts, getScript, saveScript, deleteScript } from '@/services/scripts'
import { RuleBuilder } from '@/components/workspace/rule-builder'

interface HooksPanelProps {
  workspaceId: string
}

type Section = 'rules' | 'hooks' | 'scripts'

const NEW_SCRIPT_TEMPLATE = `#!/usr/bin/env bash
# Called from a hook via: spawn('bash', [script, ...args])
set -euo pipefail
`

export function HooksPanel({ workspaceId }: HooksPanelProps) {
  const { showToast } = useToast()
  const [section, setSection] = useState<Section>('rules')
  const [showReference, setShowReference] = useState(false)
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

  const svc = section === 'scripts'
    ? { list: listScripts, get: getScript, save: saveScript, del: deleteScript }
    : { list: listHooks, get: getHook, save: saveHook, del: deleteHook }

  const loadFiles = async () => {
    if (section === 'rules') return // RuleBuilder owns its own data
    try {
      setIsLoading(true)
      setFiles(await svc.list(workspaceId))
    } catch {
      showToast({ title: 'Error', description: `Failed to load ${section}`, variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFiles() }, [workspaceId, section])

  const switchSection = (next: Section) => {
    if (next === section) return
    if (isDirty && !confirm('Discard unsaved changes?')) return
    setSection(next)
    setSelected(null)
    setContent('')
    setIsDirty(false)
    setShowNew(false)
  }

  const openFile = async (path: string) => {
    if (isDirty && !confirm('Discard unsaved changes?')) return
    try {
      setSelected(path)
      setContent(await svc.get(workspaceId, path))
      setIsDirty(false)
    } catch {
      showToast({ title: 'Error', description: `Failed to open ${path}`, variant: 'destructive' })
    }
  }

  const save = async () => {
    if (!selected) return
    try {
      setIsSaving(true)
      await svc.save(workspaceId, selected, content)
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
    if (!confirm(`Delete ${section === 'hooks' ? 'hook' : 'script'} ${path}?`)) return
    try {
      await svc.del(workspaceId, path)
      if (selected === path) { setSelected(null); setContent(''); setIsDirty(false) }
      await loadFiles()
      showToast({ title: 'Deleted', description: `${path} deleted` })
    } catch {
      showToast({ title: 'Error', description: `Failed to delete ${path}`, variant: 'destructive' })
    }
  }

  const loadMeta = async () => {
    if (meta) return
    try {
      setMeta(await getHooksMeta(workspaceId))
    } catch {
      showToast({ title: 'Error', description: 'Failed to load hook metadata', variant: 'destructive' })
    }
  }

  const openWizard = async () => {
    setShowNew(!showNew)
    if (section === 'hooks') await loadMeta()
  }

  const toggleReference = async () => {
    setShowReference(!showReference)
    await loadMeta()
  }

  const createScript = async () => {
    const name = newName.trim().replace(/^\/+/, '')
    if (!name) {
      showToast({ title: 'Error', description: 'Give the script a name (e.g. on-image.sh)', variant: 'destructive' })
      return
    }
    try {
      setIsCreating(true)
      await saveScript(workspaceId, name, NEW_SCRIPT_TEMPLATE)
      setShowNew(false)
      setNewName('')
      await loadFiles()
      await openFile(name)
    } catch {
      showToast({ title: 'Error', description: 'Failed to create script', variant: 'destructive' })
    } finally {
      setIsCreating(false)
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

  const groups = section === 'hooks' ? groupHooksByEvent(files) : { scripts: files }
  const gitUrl = `${API_URL}/workspaces/${workspaceId}/git`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Automation</h3>
          <p className="text-sm text-muted-foreground">
            Rules are simple click-to-build automations (Outlook-style). Hooks are their
            programmable big brother; scripts are the shell helpers hooks spawn. Everything
            commits to the workspace git repo.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md border">
            <Button
              size="sm"
              variant={section === 'rules' ? 'secondary' : 'ghost'}
              className="rounded-r-none"
              onClick={() => switchSection('rules')}
            >
              Rules
            </Button>
            <Button
              size="sm"
              variant={section === 'hooks' ? 'secondary' : 'ghost'}
              className="rounded-none"
              onClick={() => switchSection('hooks')}
            >
              Hooks
            </Button>
            <Button
              size="sm"
              variant={section === 'scripts' ? 'secondary' : 'ghost'}
              className="rounded-l-none"
              onClick={() => switchSection('scripts')}
            >
              Scripts
            </Button>
          </div>
          {section !== 'rules' && (
            <>
              <Button size="sm" variant="ghost" onClick={loadFiles} title="Reload">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={toggleReference} title="Hook context API & classifier reference">
                <BookOpen className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={openWizard}>
                <Plus className="mr-2 h-4 w-4" /> {section === 'hooks' ? 'New Hook' : 'New Script'}
              </Button>
            </>
          )}
        </div>
      </div>

      {section === 'rules' && (
        <RuleBuilder
          workspaceId={workspaceId}
          onOpenJson={async () => {
            // Pre-create the file so a fresh workspace can jump straight into
            // JSON editing without a 404.
            try {
              await getHook(workspaceId, 'rules.json')
            } catch {
              await saveHook(workspaceId, 'rules.json', JSON.stringify({ $schema: 'canvas.hook-rules/v1', rules: [] }, null, 2) + '\n')
                .catch(() => {})
            }
            setSection('hooks')
            void openFile('rules.json')
          }}
        />
      )}

      {section !== 'rules' && showReference && meta && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30 text-sm">
          <div>
            <h4 className="font-medium mb-2">Hook context (<span className="font-mono">ctx</span>)</h4>
            <div className="space-y-2">
              {meta.contextApi?.map((entry) => (
                <div key={entry.name}>
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{entry.signature}</code>
                  <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-2">Classifier (<span className="font-mono">const c = ctx.classify()</span>)</h4>
            <div className="flex flex-wrap gap-1">
              {meta.classifier.predicates.map((p) => (
                <code key={p} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{p}</code>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Fields: {meta.classifier.fields.map((f) => <code key={f} className="font-mono">{f} </code>)}
              — never throws; all predicates are false for a null/unknown document.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Full reference: <span className="font-mono">docs/hooks.md</span> in the server repo.
          </p>
        </div>
      )}

      {showNew && section === 'scripts' && (
        <div className="border rounded-lg p-3 flex gap-2 items-center bg-muted/50">
          <Input
            placeholder="on-image.sh"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="font-mono text-sm"
          />
          <Button size="sm" onClick={createScript} disabled={isCreating}>Create</Button>
          <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
        </div>
      )}

      {showNew && section === 'hooks' && (
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

      {section !== 'rules' && (
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
                      {section === 'hooks' && isExampleHook(file.path) && (
                        <span className="text-[10px] uppercase tracking-wide rounded bg-muted-foreground/15 px-1 py-0.5 text-muted-foreground shrink-0">
                          example
                        </span>
                      )}
                    </span>
                    <div className="flex items-center">
                      {section === 'hooks' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title={enabled ? 'Disable' : 'Enable'}
                        onClick={(e) => { e.stopPropagation(); toggle(file.path) }}
                      >
                        {enabled ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3 text-muted-foreground" />}
                      </Button>
                      )}
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
              <div className="flex-1 min-h-[400px] max-h-[60vh] overflow-auto rounded border text-sm">
                <CodeEditor
                  value={content}
                  path={selected}
                  onChange={(next) => { setContent(next); setIsDirty(true) }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground min-h-[400px]">
              Select a {section === 'hooks' ? 'hook' : 'script'} to edit, or create a new one.
            </div>
          )}
        </div>
      </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5 shrink-0" />
        <span>
          Everything here lives in the workspace git repo — clone it with{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono select-all">
            git clone {gitUrl.replace('://', '://canvas@')}
          </code>{' '}
          (password: a canvas API token; the <span className="font-mono">canvas@</span> username
          is arbitrary but git needs one). Pushes hot-reload hooks.
        </span>
      </p>
    </div>
  )
}

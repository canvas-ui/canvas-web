import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-container';
import {
  deleteWorkspaceHook,
  getWorkspaceHook,
  listWorkspaceHooks,
  saveWorkspaceHook,
  WorkspaceHookFile,
} from '@/services/workspace';
import { Loader2, Plus, RefreshCw, Save, Trash2, WandSparkles } from 'lucide-react';

interface HooksPanelProps {
  workspaceId: string;
}

const DEFAULT_HOOK_PATH = 'document.inserted.js';
const DEFAULT_HELPER_PATH = 'lib/helpers.js';

const NOOP_HOOK_TEMPLATE = `export default async function hook({
  event,
  eventName,
  payload,
  workspace,
  db,
  tree,
  logger,
  emit,
  insert,
  update,
  remove,
  deleteDocument,
  get,
  find,
  link,
}) {
  logger.debug(\`Hook fired: \${eventName} in workspace \${workspace.id}\`);

  // Available values:
  // - event: { name, workspaceId, payload, timestamp }
  // - payload: raw event payload
  // - workspace: workspace instance
  // - db: SynapsD instance when workspace is active
  // - tree: workspace tree when active
  // - helpers: emit/insert/update/remove/deleteDocument/get/find/link

  return {
    ok: true,
    eventName,
    documentId: payload?.document?.id ?? payload?.id ?? null,
  };
}
`;

const DEFAULT_HELPER_TEMPLATE = `export function ensureArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}
`;

export function HooksPanel({ workspaceId }: HooksPanelProps) {
  const [files, setFiles] = useState<WorkspaceHookFile[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [draftPath, setDraftPath] = useState('');
  const [content, setContent] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const { showToast } = useToast();

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => a.path.localeCompare(b.path)),
    [files]
  );

  const loadFiles = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const nextFiles = await listWorkspaceHooks(workspaceId);
      setFiles(nextFiles);
      if (!selectedPath && nextFiles.length > 0) {
        const nextPath = nextFiles[0].path;
        setSelectedPath(nextPath);
        setDraftPath(nextPath);
      }
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to load hooks',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingList(false);
    }
  }, [workspaceId, selectedPath, showToast]);

  const loadFile = useCallback(async (hookPath: string) => {
    if (!hookPath) {
      setContent('');
      return;
    }

    setIsLoadingFile(true);
    try {
      const hookFile = await getWorkspaceHook(workspaceId, hookPath);
      setSelectedPath(hookFile.path);
      setDraftPath(hookFile.path);
      setContent(hookFile.content);
      setIsDirty(false);
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to load hook file',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingFile(false);
    }
  }, [workspaceId, showToast]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (selectedPath) {
      loadFile(selectedPath);
    }
  }, [selectedPath, loadFile]);

  const selectFile = async (hookPath: string) => {
    if (hookPath === selectedPath && !isDirty) {
      return;
    }

    if (isDirty && !window.confirm('Discard unsaved hook changes?')) {
      return;
    }

    setSelectedPath(hookPath);
  };

  const startNewFile = (hookPath: string, nextContent: string) => {
    if (isDirty && !window.confirm('Discard unsaved hook changes?')) {
      return;
    }
    setSelectedPath('');
    setDraftPath(hookPath);
    setContent(nextContent);
    setIsDirty(true);
  };

  const handleSave = async () => {
    const normalizedPath = draftPath.trim().replace(/\\/g, '/');
    if (!normalizedPath) {
      showToast({
        title: 'Error',
        description: 'Hook path is required',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveWorkspaceHook(workspaceId, normalizedPath, content);
      await loadFiles();
      setSelectedPath(saved.path);
      setDraftPath(saved.path);
      setIsDirty(false);
      showToast({
        title: 'Saved',
        description: `Hook ${saved.path} saved`,
      });
    } catch (error) {
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save hook',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const targetPath = selectedPath || draftPath.trim();
    if (!targetPath) {
      return;
    }

    if (!window.confirm(`Delete hook ${targetPath}?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteWorkspaceHook(workspaceId, targetPath);
      const nextFiles = (await listWorkspaceHooks(workspaceId)).sort((a, b) => a.path.localeCompare(b.path));
      setFiles(nextFiles);
      const nextPath = nextFiles[0]?.path || '';
      setSelectedPath(nextPath);
      setDraftPath(nextPath);
      setContent('');
      setIsDirty(false);
      showToast({
        title: 'Deleted',
        description: `Hook ${targetPath} deleted`,
      });
    } catch (error) {
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete hook',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Hooks</h4>
        <p className="text-xs text-muted-foreground">
          Event hooks live at the workspace root as `event.name.js`. Shared helpers belong under `lib/`.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => startNewFile(DEFAULT_HOOK_PATH, NOOP_HOOK_TEMPLATE)}>
          <Plus className="h-3 w-3" />
          New Hook
        </Button>
        <Button size="sm" variant="outline" onClick={() => startNewFile(DEFAULT_HELPER_PATH, DEFAULT_HELPER_TEMPLATE)}>
          <Plus className="h-3 w-3" />
          New Helper
        </Button>
        <Button size="sm" variant="outline" onClick={() => setContent(NOOP_HOOK_TEMPLATE)}>
          <WandSparkles className="h-3 w-3" />
          Noop Template
        </Button>
        <Button size="sm" variant="ghost" onClick={loadFiles} disabled={isLoadingList}>
          {isLoadingList ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        <Input
          value={draftPath}
          onChange={(event) => {
            setDraftPath(event.target.value);
            setIsDirty(true);
          }}
          placeholder="document.inserted.js or lib/helpers.js"
        />
        <div className="rounded-md border">
          <div className="max-h-32 overflow-y-auto p-2 space-y-1">
            {sortedFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hook files yet.</p>
            ) : (
              sortedFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => selectFile(file.path)}
                  className={`w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                    file.path === selectedPath ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                  }`}
                >
                  <div className="font-mono">{file.path}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <textarea
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setIsDirty(true);
        }}
        className="min-h-[280px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        spellCheck={false}
      />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleSave} disabled={isSaving || isLoadingFile}>
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={isDeleting || (!selectedPath && !draftPath.trim())}
        >
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Delete
        </Button>
      </div>

      <div className="rounded-md border bg-muted/40 p-2 text-[11px] text-muted-foreground">
        Hook args: `event`, `eventName`, `payload`, `workspace`, `db`, `tree`, `logger`, `emit`, `insert`, `update`, `remove`,
        `deleteDocument`, `get`, `find`, `link`.
      </div>
    </div>
  );
}

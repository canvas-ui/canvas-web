import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast-container';
import {
  listBackends,
  addBackend,
  updateBackend,
  removeBackend,
  syncBackend,
  testBackend,
  syncBackendContainer,
  removeBackendContainer,
  addBackendContainers,
  listBackendFoldersAvailable,
  discoverBackendFolders,
  type Backend,
  type BackendFolder,
} from '@/services/workspace';
import { Loader2, Mail, RefreshCw, Save, Trash2, FolderPlus } from 'lucide-react';

interface ImapMailboxesPanelProps {
  workspaceId: string;
  enabled: boolean;
}

// Add-account form state. Editing an existing account reuses the same fields
// (host/user immutable while editing; blank password keeps the current one).
interface AccountForm {
  host: string;
  port: number;
  tls: boolean;
  allowSelfSigned: boolean;
  user: string;
  password: string;
  pollInterval: number;
  initialSyncDays: number;
}

const EMPTY_FORM: AccountForm = {
  host: '', port: 993, tls: true, allowSelfSigned: true,
  user: '', password: '', pollInterval: 60000, initialSyncDays: 180,
};

function formFromBackend(b: Backend): AccountForm {
  const c = (b.config || {}) as Record<string, unknown>;
  return {
    host: String(c.host || ''),
    port: Number(c.port ?? 993),
    tls: c.tls !== false,
    allowSelfSigned: c.allowSelfSigned !== false,
    user: String(c.user || b.address),
    password: '',
    pollInterval: Number(c.pollInterval ?? 60000),
    initialSyncDays: Number(c.initialSyncDays ?? 180),
  };
}

export function ImapMailboxesPanel({ workspaceId, enabled }: ImapMailboxesPanelProps) {
  const [accounts, setAccounts] = useState<Backend[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // address, or null = new
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [folders, setFolders] = useState<BackendFolder[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>(['INBOX']);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const { showToast } = useToast();

  const sorted = useMemo(() => [...accounts].sort((a, b) => a.address.localeCompare(b.address)), [accounts]);
  const current = useMemo(() => accounts.find((a) => a.address === selected) || null, [accounts, selected]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setAccounts(await listBackends(workspaceId, 'imap'));
    } catch (error) {
      showToast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to load IMAP accounts', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, showToast]);

  useEffect(() => { void load(); }, [load]);

  // Discover the account's server-side folder list. For an existing account
  // this runs automatically on select; for a new one it needs credentials
  // from the form first.
  const discoverFoldersFor = useCallback(async (account: Backend | null, formForNew?: AccountForm) => {
    setIsLoadingFolders(true);
    try {
      const list = account
        ? await listBackendFoldersAvailable(workspaceId, 'imap', account.address)
        : await discoverBackendFolders(workspaceId, 'imap', {
            host: (formForNew?.host || '').trim(), port: Number(formForNew?.port) || 993, tls: formForNew?.tls !== false,
            allowSelfSigned: formForNew?.allowSelfSigned !== false, user: (formForNew?.user || '').trim(), password: formForNew?.password || '',
            folder: 'INBOX',
          });
      setFolders(list.filter((f) => f.selectable));
    } catch (error) {
      showToast({ title: 'IMAP Error', description: error instanceof Error ? error.message : 'Failed to discover folders', variant: 'destructive' });
    } finally {
      setIsLoadingFolders(false);
    }
  }, [workspaceId, showToast]);

  const selectAccount = (b: Backend) => {
    setSelected(b.address);
    setForm(formFromBackend(b));
    setFolders([]);
    setSelectedFolders((b.containers || []).map((c) => c.name));
    // Auto-discover so subscribed folders show checked immediately and can be
    // unchecked without hunting for a discover button.
    void discoverFoldersFor(b);
  };

  const resetForm = () => {
    setSelected(null);
    setForm(EMPTY_FORM);
    setFolders([]);
    setSelectedFolders(['INBOX']);
  };

  const change = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const toggleFolder = (path: string) =>
    setSelectedFolders((cur) => (cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path]));

  // Render union of discovered folders + already-subscribed ones, so checked
  // state stays visible even when discovery fails (imap host unreachable).
  const folderRows = useMemo(() => {
    const byPath = new Map(folders.map((f) => [f.path, f]));
    for (const path of selectedFolders) {
      if (!byPath.has(path)) byPath.set(path, { name: path, path, delimiter: '/', selectable: true, attributes: [] });
    }
    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [folders, selectedFolders]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const wanted = selectedFolders.length ? selectedFolders : ['INBOX'];
      const base = {
        host: form.host.trim(), user: form.user.trim(),
        port: Number(form.port) || 993, tls: form.tls, allowSelfSigned: form.allowSelfSigned,
        pollInterval: Number(form.pollInterval) || 60000,
        initialSyncDays: Math.max(0, Number(form.initialSyncDays) || 0),
        ...(form.password ? { password: form.password } : {}),
      };

      if (current) {
        // Update shared account settings, then reconcile folder subscriptions.
        await updateBackend(workspaceId, 'imap', current.address, base);
        const existing = new Set((current.containers || []).map((c) => c.name));
        const toAdd = wanted.filter((f) => !existing.has(f));
        const toRemove = [...existing].filter((f) => !wanted.includes(f));
        if (toAdd.length) await addBackendContainers(workspaceId, 'imap', current.address, toAdd);
        for (const name of toRemove) await removeBackendContainer(workspaceId, 'imap', current.address, name);
      } else {
        // Create the account on its first folder, then subscribe the rest.
        await addBackend(workspaceId, 'imap', { ...base, password: form.password, folder: wanted[0] });
        const address = form.user.trim();
        if (wanted.length > 1) await addBackendContainers(workspaceId, 'imap', address, wanted.slice(1));
      }

      await load();
      setSelected(form.user.trim());
      showToast({ title: 'Saved', description: `IMAP account ${form.user.trim()} saved — sync runs in the background` });
    } catch (error) {
      showToast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save IMAP account', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!current || !window.confirm(`Delete IMAP account ${current.address} and all its folders?`)) return;
    setRunningAction(`delete:${current.address}`);
    try {
      await removeBackend(workspaceId, 'imap', current.address);
      await load();
      resetForm();
      showToast({ title: 'Deleted', description: `IMAP account ${current.address} deleted` });
    } catch (error) {
      showToast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete account', variant: 'destructive' });
    } finally {
      setRunningAction(null);
    }
  };

  const accountAction = async (action: 'test' | 'sync', address: string) => {
    setRunningAction(`${action}:${address}`);
    try {
      if (action === 'test') await testBackend(workspaceId, 'imap', address);
      else await syncBackend(workspaceId, 'imap', address);
      await load();
      showToast({ title: 'Success', description: action === 'sync' ? `${address} sync started (runs in the background)` : `${address} test completed` });
    } catch (error) {
      showToast({ title: 'Error', description: error instanceof Error ? error.message : `Failed to ${action}`, variant: 'destructive' });
    } finally {
      setRunningAction(null);
    }
  };

  const syncFolder = async (address: string, name: string) => {
    setRunningAction(`folder-sync:${address}:${name}`);
    try {
      await syncBackendContainer(workspaceId, 'imap', address, name);
      await load();
      showToast({ title: 'Synced', description: `${address} · ${name}` });
    } catch (error) {
      showToast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to sync folder', variant: 'destructive' });
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">IMAP Accounts</h4>
        <p className="text-xs text-muted-foreground">Each account mirrors under /imap/&lt;account&gt; in the backends tree; its folders are synced as containers.</p>
      </div>

      {!enabled && (
        <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
          Enable the IMAP service before polling starts. Accounts can still be configured while it is off.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={resetForm}><Mail className="h-3 w-3" /> New Account</Button>
        <Button size="sm" variant="ghost" onClick={load} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </Button>
      </div>

      <div className="rounded-md border">
        <div className="max-h-52 overflow-y-auto p-2 space-y-1">
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground">No IMAP accounts configured.</p>
          ) : (
            sorted.map((acc) => (
              <div
                key={acc.address}
                className={`rounded px-2 py-2 text-xs transition-colors ${selected === acc.address ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              >
                <button onClick={() => selectAccount(acc)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{acc.address}</span>
                    <span className={`shrink-0 ${acc.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{acc.status}</span>
                  </div>
                  <div className="text-muted-foreground">{String((acc.config as Record<string, unknown>)?.host || '')} · {(acc.containers || []).length} folder(s)</div>
                  {acc.lastError && <div className="text-destructive">error: {acc.lastError}</div>}
                </button>
                <div className="mt-1 space-y-0.5">
                  {(acc.containers || []).map((c) => (
                    <div key={c.name} className="flex items-center justify-between gap-2 rounded bg-background/60 px-2 py-1">
                      <span className="font-mono truncate">{c.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button title="Sync folder" className="p-1 hover:bg-accent rounded" onClick={() => syncFolder(acc.address, c.name)} disabled={!!runningAction}>
                          {runningAction === `folder-sync:${acc.address}:${c.name}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        </button>
                        <button
                          title="Remove folder"
                          className="p-1 hover:bg-destructive/10 text-destructive rounded"
                          onClick={() => removeBackendContainer(workspaceId, 'imap', acc.address, c.name)
                            .then(load)
                            .catch((error) => showToast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to remove folder', variant: 'destructive' }))}
                          disabled={!!runningAction}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="imap-host">Host</Label>
          <Input id="imap-host" value={form.host} disabled={!!current} onChange={(e) => change('host', e.target.value)} placeholder="imap.example.com" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-user">User (account)</Label>
          <Input id="imap-user" value={form.user} disabled={!!current} onChange={(e) => change('user', e.target.value)} placeholder="me@example.com" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-password">Password</Label>
          <Input id="imap-password" type="password" value={form.password} onChange={(e) => change('password', e.target.value)} placeholder={current ? 'Leave blank to keep current password' : 'Password'} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-port">Port</Label>
          <Input id="imap-port" type="number" value={String(form.port)} onChange={(e) => change('port', Number(e.target.value || 993))} />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Folders to sync</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => void discoverFoldersFor(current, form)} disabled={isLoadingFolders || (!current && (!form.host.trim() || !form.user.trim() || !form.password))}>
              {isLoadingFolders ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderPlus className="h-3 w-3" />} Discover folders
            </Button>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border p-2">
            {folderRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {isLoadingFolders
                  ? 'Discovering folders…'
                  : current
                    ? 'No folders found on the server.'
                    : 'Fill in host, user and password, then discover the account’s folders. INBOX is synced by default.'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {folderRows.map((folder) => {
                  const depth = folder.path.split(folder.delimiter || '/').length - 1;
                  const discovered = folders.some((f) => f.path === folder.path);
                  return (
                    <label key={folder.path} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent/50" style={{ paddingLeft: `${8 + depth * 14}px` }}>
                      <input type="checkbox" checked={selectedFolders.includes(folder.path)} onChange={() => toggleFolder(folder.path)} />
                      <span className="font-mono truncate">{folder.path}</span>
                      {!discovered && folders.length > 0 && <span className="text-muted-foreground">(subscribed, not on server)</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedFolders.length} folder{selectedFolders.length === 1 ? '' : 's'} selected — each synced as its own container. Unchecking a synced folder removes it on Save.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-lookback">Initial sync lookback (days)</Label>
          <Input id="imap-lookback" type="number" min="0" value={String(form.initialSyncDays)} onChange={(e) => change('initialSyncDays', Number(e.target.value || 0))} />
          <p className="text-xs text-muted-foreground">First sync only (lastUid 0). Set 0 to import the whole mailbox.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-poll">Poll interval (ms)</Label>
          <Input id="imap-poll" type="number" value={String(form.pollInterval)} onChange={(e) => change('pollInterval', Number(e.target.value || 60000))} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.tls} onChange={(e) => change('tls', e.target.checked)} /> TLS
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.allowSelfSigned} onChange={(e) => change('allowSelfSigned', e.target.checked)} /> Allow self-signed
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
        </Button>
        <Button size="sm" variant="outline" disabled={!current || !!runningAction} onClick={() => current && accountAction('test', current.address)}>
          {runningAction === `test:${current?.address}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Test
        </Button>
        <Button size="sm" variant="outline" disabled={!current || !!runningAction} onClick={() => current && accountAction('sync', current.address)}>
          {runningAction === `sync:${current?.address}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Sync all
        </Button>
        <Button size="sm" variant="destructive" disabled={!current || !!runningAction} onClick={handleDelete}>
          {runningAction === `delete:${current?.address}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
        </Button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast-container';
import {
  createWorkspaceImapMailbox,
  deleteWorkspaceImapMailbox,
  listWorkspaceImapMailboxes,
  startWorkspaceImapMailbox,
  stopWorkspaceImapMailbox,
  syncWorkspaceImapMailbox,
  testWorkspaceImapMailbox,
  updateWorkspaceImapMailbox,
  WorkspaceImapMailbox,
  WorkspaceImapMailboxInput,
} from '@/services/workspace';
import { Loader2, Mail, Play, RefreshCw, Save, Square, Trash2 } from 'lucide-react';

interface ImapMailboxesPanelProps {
  workspaceId: string;
  enabled: boolean;
}

const EMPTY_MAILBOX: WorkspaceImapMailboxInput = {
  id: '',
  enabled: true,
  host: '',
  port: 993,
  tls: true,
  allowSelfSigned: true,
  user: '',
  password: '',
  folder: 'INBOX',
  mode: 'poll',
  pollInterval: 60000,
  initialSyncDays: 30,
  lastUid: 0,
};

function toFormState(mailbox: WorkspaceImapMailbox): WorkspaceImapMailboxInput {
  return {
    id: mailbox.id,
    enabled: mailbox.enabled,
    host: mailbox.host,
    port: mailbox.port,
    tls: mailbox.tls,
    allowSelfSigned: mailbox.allowSelfSigned,
    user: mailbox.user,
    password: '',
    folder: mailbox.folder,
    mode: mailbox.mode,
    pollInterval: mailbox.pollInterval,
    initialSyncDays: mailbox.initialSyncDays,
    lastUid: mailbox.lastUid,
  };
}

export function ImapMailboxesPanel({ workspaceId, enabled }: ImapMailboxesPanelProps) {
  const [mailboxes, setMailboxes] = useState<WorkspaceImapMailbox[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [form, setForm] = useState<WorkspaceImapMailboxInput>(EMPTY_MAILBOX);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const { showToast } = useToast();

  const sortedMailboxes = useMemo(
    () => [...mailboxes].sort((a, b) => a.id.localeCompare(b.id)),
    [mailboxes]
  );

  const loadMailboxes = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextMailboxes = await listWorkspaceImapMailboxes(workspaceId);
      setMailboxes(nextMailboxes);
      if (selectedId) {
        const selected = nextMailboxes.find((mailbox) => mailbox.id === selectedId);
        if (selected) {
          setForm((current) => ({
            ...toFormState(selected),
            password: current.password,
          }));
        }
      }
    } catch (error) {
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load IMAP mailboxes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, selectedId, showToast]);

  useEffect(() => {
    loadMailboxes();
  }, [loadMailboxes]);

  const selectMailbox = (mailbox: WorkspaceImapMailbox) => {
    setSelectedId(mailbox.id);
    setForm(toFormState(mailbox));
  };

  const resetForm = () => {
    setSelectedId('');
    setForm(EMPTY_MAILBOX);
  };

  const handleChange = <K extends keyof WorkspaceImapMailboxInput>(key: K, value: WorkspaceImapMailboxInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: WorkspaceImapMailboxInput = {
        ...form,
        id: form.id?.trim() || undefined,
        host: form.host.trim(),
        user: form.user.trim(),
        folder: form.folder?.trim() || 'INBOX',
      };

      const saved = selectedId
        ? await updateWorkspaceImapMailbox(workspaceId, selectedId, payload)
        : await createWorkspaceImapMailbox(workspaceId, payload);

      await loadMailboxes();
      selectMailbox(saved);
      showToast({
        title: 'Saved',
        description: `IMAP mailbox ${saved.id} saved`,
      });
    } catch (error) {
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save IMAP mailbox',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) {
      return;
    }
    if (!window.confirm(`Delete IMAP mailbox ${selectedId}?`)) {
      return;
    }

    setRunningAction(`delete:${selectedId}`);
    try {
      await deleteWorkspaceImapMailbox(workspaceId, selectedId);
      await loadMailboxes();
      resetForm();
      showToast({
        title: 'Deleted',
        description: `IMAP mailbox ${selectedId} deleted`,
      });
    } catch (error) {
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete IMAP mailbox',
        variant: 'destructive',
      });
    } finally {
      setRunningAction(null);
    }
  };

  const runMailboxAction = async (action: 'test' | 'sync' | 'start' | 'stop', mailboxId: string) => {
    setRunningAction(`${action}:${mailboxId}`);
    try {
      if (action === 'test') {
        await testWorkspaceImapMailbox(workspaceId, mailboxId);
      } else if (action === 'sync') {
        await syncWorkspaceImapMailbox(workspaceId, mailboxId);
      } else if (action === 'start') {
        await startWorkspaceImapMailbox(workspaceId, mailboxId);
      } else {
        await stopWorkspaceImapMailbox(workspaceId, mailboxId);
      }

      await loadMailboxes();
      showToast({
        title: 'Success',
        description: `Mailbox ${mailboxId} ${action} completed`,
      });
    } catch (error) {
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Failed to ${action} mailbox`,
        variant: 'destructive',
      });
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">IMAP Mailboxes</h4>
        <p className="text-xs text-muted-foreground">
          Configure mailbox polling, test connectivity, and manually trigger syncs.
        </p>
      </div>

      {!enabled && (
        <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
          Enable the IMAP service first. Mailboxes can still be configured while the service is off.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={resetForm}>
          <Mail className="h-3 w-3" />
          New Mailbox
        </Button>
        <Button size="sm" variant="ghost" onClick={loadMailboxes} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </div>

      <div className="rounded-md border">
        <div className="max-h-40 overflow-y-auto p-2 space-y-1">
          {sortedMailboxes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No IMAP mailboxes configured.</p>
          ) : (
            sortedMailboxes.map((mailbox) => (
              <button
                key={mailbox.id}
                onClick={() => selectMailbox(mailbox)}
                className={`w-full rounded px-2 py-2 text-left text-xs transition-colors ${
                  selectedId === mailbox.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
              >
                <div className="font-medium">{mailbox.id}</div>
                <div className="text-muted-foreground">{mailbox.user} on {mailbox.host} · {mailbox.folder}</div>
                <div className="text-muted-foreground">
                  {mailbox.runtime.status}
                  {mailbox.lastError ? ` · error: ${mailbox.lastError}` : ''}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="imap-id">Mailbox ID</Label>
          <Input id="imap-id" value={form.id || ''} onChange={(event) => handleChange('id', event.target.value)} placeholder="acct-main-inbox" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-host">Host</Label>
          <Input id="imap-host" value={form.host} onChange={(event) => handleChange('host', event.target.value)} placeholder="imap.example.com" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-user">User</Label>
          <Input id="imap-user" value={form.user} onChange={(event) => handleChange('user', event.target.value)} placeholder="me@example.com" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-password">Password</Label>
          <Input id="imap-password" type="password" value={form.password || ''} onChange={(event) => handleChange('password', event.target.value)} placeholder={selectedId ? 'Leave blank to keep current password' : 'Password'} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="imap-folder">Folder</Label>
            <Input id="imap-folder" value={form.folder || 'INBOX'} onChange={(event) => handleChange('folder', event.target.value)} placeholder="INBOX" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="imap-port">Port</Label>
            <Input id="imap-port" type="number" value={String(form.port || 993)} onChange={(event) => handleChange('port', Number(event.target.value || 993))} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-lookback">Initial Sync Lookback (days)</Label>
          <Input id="imap-lookback" type="number" min="0" value={String(form.initialSyncDays ?? 30)} onChange={(event) => handleChange('initialSyncDays', Number(event.target.value || 0))} />
          <p className="text-xs text-muted-foreground">Only used for the first sync when `lastUid` is `0`. Set `0` to import the whole mailbox.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imap-poll">Poll Interval (ms)</Label>
          <Input id="imap-poll" type="number" value={String(form.pollInterval || 60000)} onChange={(event) => handleChange('pollInterval', Number(event.target.value || 60000))} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled !== false} onChange={(event) => handleChange('enabled', event.target.checked)} />
            Enabled
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.tls !== false} onChange={(event) => handleChange('tls', event.target.checked)} />
            TLS
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.allowSelfSigned !== false} onChange={(event) => handleChange('allowSelfSigned', event.target.checked)} />
            Allow self-signed
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save
        </Button>
        <Button size="sm" variant="outline" disabled={!selectedId || !!runningAction} onClick={() => selectedId && runMailboxAction('test', selectedId)}>
          {runningAction === `test:${selectedId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
          Test
        </Button>
        <Button size="sm" variant="outline" disabled={!selectedId || !!runningAction} onClick={() => selectedId && runMailboxAction('sync', selectedId)}>
          {runningAction === `sync:${selectedId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Sync
        </Button>
        <Button size="sm" variant="outline" disabled={!selectedId || !!runningAction} onClick={() => selectedId && runMailboxAction('start', selectedId)}>
          {runningAction === `start:${selectedId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Start
        </Button>
        <Button size="sm" variant="outline" disabled={!selectedId || !!runningAction} onClick={() => selectedId && runMailboxAction('stop', selectedId)}>
          {runningAction === `stop:${selectedId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
          Stop
        </Button>
        <Button size="sm" variant="destructive" disabled={!selectedId || !!runningAction} onClick={handleDelete}>
          {runningAction === `delete:${selectedId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Delete
        </Button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { RefreshCw, Unlink, Users, User as UserIcon, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  listWorkspaceMembers,
  grantWorkspaceMember,
  updateWorkspaceMember,
  revokeWorkspaceMember,
  type WorkspaceMember,
  type WorkspaceMembersResponse,
  type WorkspacePermission,
} from '@/services/workspace'

// Team sharing: who (e-mail) or which directory group (LDAP memberOf DN or
// CN, or admin-assigned) can open this workspace, and with what permission.
// Owner-only management; members see the list read-only.

const LEVELS: { value: WorkspacePermission; label: string; hint: string }[] = [
  { value: 'read', label: 'Read', hint: 'Browse and search' },
  { value: 'write', label: 'Read & write', hint: 'Add, edit and organise documents' },
  { value: 'admin', label: 'Admin', hint: 'Everything except sharing and deleting' },
]

const levelOf = (permissions: string[]): WorkspacePermission =>
  permissions.includes('admin') ? 'admin' : permissions.includes('write') ? 'write' : 'read'

interface MembersManagerProps {
  workspaceId: string
}

export function MembersManager({ workspaceId }: MembersManagerProps) {
  const { showToast } = useToast()
  const [data, setData] = useState<WorkspaceMembersResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [kind, setKind] = useState<'user' | 'group'>('user')
  const [principal, setPrincipal] = useState('')
  const [level, setLevel] = useState<WorkspacePermission>('read')

  // Re-show the spinner when switching workspaces (during render, so the
  // load effect never needs a synchronous setState).
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId)
  if (workspaceId !== prevWorkspaceId) {
    setPrevWorkspaceId(workspaceId)
    setIsLoading(true)
  }

  const load = useCallback(() =>
    listWorkspaceMembers(workspaceId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setIsLoading(false)),
  [workspaceId])

  useEffect(() => { load() }, [load])

  const isOwner = data?.isOwner === true
  const members = data?.members ?? []

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = principal.trim()
    if (!value) return
    setBusy('grant')
    try {
      const member = await grantWorkspaceMember(workspaceId, kind === 'user' ? { email: value } : { group: value }, [level])
      setPrincipal('')
      await load()
      const who = kind === 'user' ? value : `group ${value}`
      showToast({
        title: 'Shared',
        description: member.type === 'user' && member.userExists === false
          ? `${who} has no account here yet — the share applies as soon as they sign in.`
          : `Access granted to ${who}.`,
      })
    } catch (error) {
      showToast({ title: 'Could not share', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const handleLevel = async (member: WorkspaceMember, next: WorkspacePermission) => {
    const key = `${member.type}:${member.principal}`
    setBusy(key)
    try {
      await updateWorkspaceMember(workspaceId, member.type, member.principal, [next])
      await load()
    } catch (error) {
      showToast({ title: 'Could not update', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const handleRevoke = async (member: WorkspaceMember) => {
    const key = `${member.type}:${member.principal}`
    setBusy(key)
    try {
      await revokeWorkspaceMember(workspaceId, member.type, member.principal)
      await load()
      showToast({ title: 'Access revoked', description: `${member.principal} no longer has access.` })
    } catch (error) {
      showToast({ title: 'Could not revoke', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  if (data && data.shareable === false) {
    return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Your universe workspace is private and cannot be shared.</div>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {isOwner ? 'People and groups who can open this workspace.' : 'You are a member of this workspace; only its owner can change the list.'}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => { setIsLoading(true); load() }} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading members…</div>
        ) : members.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Not shared with anyone.</div>
        ) : members.map((member) => {
          const key = `${member.type}:${member.principal}`
          const current = levelOf(member.permissions)
          return (
            <div key={key} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2">
                {member.type === 'group'
                  ? <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  : <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" title={member.principal}>{member.principal}</div>
                  <div className="text-xs text-muted-foreground">
                    {member.type === 'group' ? 'Group' : 'User'}
                    {member.description ? ` · ${member.description}` : ''}
                    {member.grantedAt ? ` · since ${new Date(member.grantedAt).toLocaleDateString()}` : ''}
                  </div>
                  {member.type === 'user' && member.userExists === false && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-warning">
                      <AlertCircle className="h-3 w-3" /> No account yet — applies at first sign-in
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isOwner ? (
                  <select
                    value={current}
                    disabled={busy === key}
                    onChange={(e) => handleLevel(member, e.target.value as WorkspacePermission)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    title="Access level"
                  >
                    {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{LEVELS.find((l) => l.value === current)?.label}</span>
                )}
                {isOwner && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={busy === key}
                    onClick={() => handleRevoke(member)}
                    title="Revoke access"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isOwner && (
        <form onSubmit={handleGrant} className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            Share with
            <div className="inline-flex overflow-hidden rounded-md border">
              {(['user', 'group'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn('px-3 py-1 text-xs', kind === k ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}
                >
                  {k === 'user' ? 'a person' : 'a group'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <Input
                type={kind === 'user' ? 'email' : 'text'}
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                placeholder={kind === 'user' ? 'colleague@corp.tld' : 'team-a  or  cn=team-a,ou=groups,dc=corp,dc=tld'}
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {kind === 'user'
                  ? 'The share is keyed by e-mail: it works even before the person signs in for the first time.'
                  : 'Directory group (LDAP/AD memberOf — full DN or just the CN) or a group an admin assigned to local accounts.'}
              </p>
            </div>
            <div>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as WorkspacePermission)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                title={LEVELS.find((l) => l.value === level)?.hint}
              >
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>
          <Button type="submit" size="sm" disabled={busy === 'grant' || !principal.trim()}>
            {busy === 'grant' ? 'Sharing…' : 'Share workspace'}
          </Button>
        </form>
      )}
    </div>
  )
}

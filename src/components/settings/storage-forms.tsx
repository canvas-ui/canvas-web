import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { GoogleOAuthButton } from '@/components/settings/GoogleOAuthButton'
import { addBackend, updateBackend, type Backend } from '@/services/workspace'

export type StorageKind = 'file' | 'gdrive' | 's3'

interface FormProps {
  workspaceId: string
  // Present when editing an existing backend; absent when adding one.
  backend?: Backend
  onSaved: () => Promise<void> | void
  onCancel: () => void
}

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`block space-y-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

// A switch with its explanation: the label says what it does, the hint when to use it.
export function OptionRow({ label, hint, checked, disabled, onChange }: {
  label: string; hint?: ReactNode; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-xs font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} disabled={disabled} onClick={() => onChange(!checked)} label={label} />
    </div>
  )
}

function FormShell({ intro, busy, valid, submitLabel, onSubmit, onCancel, children }: {
  intro: string; busy: boolean; valid: boolean; submitLabel: string
  onSubmit: (e: FormEvent) => void; onCancel: () => void; children: ReactNode
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-muted-foreground">{intro}</p>
      {children}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !valid}>{busy ? 'Checking…' : submitLabel}</Button>
      </div>
    </form>
  )
}

// A folder on the server host, indexed in place.
export function LocalFolderForm({ workspaceId, backend, onSaved, onCancel }: FormProps) {
  const cfg = backend?.config || {}
  const [name, setName] = useState(String(cfg.label || backend?.address || ''))
  const [path, setPath] = useState(String(cfg.root || ''))
  const [watch, setWatch] = useState(cfg.watch === true)
  const [readOnly, setReadOnly] = useState(cfg.readOnly === true)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (backend) await updateBackend(workspaceId, 'file', backend.address, { label: name.trim(), root: path.trim(), watch, readOnly })
      else await addBackend(workspaceId, 'file', { name: name.trim(), path: path.trim(), watch, readOnly })
      showToast({ title: backend ? 'Folder saved' : 'Folder added', description: backend ? undefined : `${name.trim()} is being indexed in the background` })
      await onSaved()
    } catch (err) {
      showToast({ title: 'Could not save folder', description: message(err, 'Request failed'), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShell intro="Index a folder on the server host. Files stay where they are." busy={busy} valid={!!name.trim() && !!path.trim()}
      submitLabel={backend ? 'Save folder' : 'Add folder'} onSubmit={submit} onCancel={onCancel}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Financial Reports" required /></Field>
        <Field label="Path on the server" hint="Absolute path of a readable directory.">
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/mnt/data/reports" required className="font-mono" />
        </Field>
      </div>
      <div className="divide-y">
        <OptionRow label="Watch for changes" hint="Pick up files added or edited outside Canvas without a manual re-sync." checked={watch} onChange={setWatch} />
        <OptionRow label="Read-only" hint="Canvas never deletes or writes files here. Use it for folders managed by other tools." checked={readOnly} onChange={setReadOnly} />
      </div>
    </FormShell>
  )
}

// A Google Drive folder. Credentials are an OAuth client plus an offline
// refresh token; the server checks them before saving and never returns them.
export function GoogleDriveForm({ workspaceId, backend, onSaved, onCancel }: FormProps) {
  const cfg = backend?.config || {}
  const [form, setForm] = useState({ name: String(cfg.label || backend?.address || ''), clientId: String(cfg.clientId || ''), clientSecret: '', refreshToken: '', folderId: String(cfg.folderId || '') })
  const [watch, setWatch] = useState(cfg.watch === true)
  const [readOnly, setReadOnly] = useState(cfg.readOnly === true)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const valid = !!form.name.trim() && !!form.clientId.trim() && (!!backend || (!!form.clientSecret.trim() && !!form.refreshToken.trim()))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const config = {
        label: form.name.trim(),
        clientId: form.clientId.trim(),
        ...(form.clientSecret.trim() ? { clientSecret: form.clientSecret.trim() } : {}),
        ...(form.refreshToken.trim() ? { refreshToken: form.refreshToken.trim() } : {}),
        folderId: form.folderId.trim() || 'root',
        watch,
        readOnly,
      }
      if (backend) await updateBackend(workspaceId, 'gdrive', backend.address, config)
      else await addBackend(workspaceId, 'gdrive', config)
      showToast({ title: backend ? 'Google Drive saved' : 'Google Drive connected', description: backend ? undefined : `${form.name.trim()} is being indexed in the background` })
      await onSaved()
    } catch (err) {
      showToast({ title: 'Could not connect Google Drive', description: message(err, 'Request failed'), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const keep = backend ? 'Leave blank to keep the stored value' : ''
  return (
    <FormShell intro="Index a Drive folder, or all of My Drive. Needs a Google OAuth client of type Web application: enter its id and secret, then sign in."
      busy={busy} valid={valid} submitLabel={backend ? 'Save Drive' : 'Add Drive'} onSubmit={submit} onCancel={onCancel}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={set('name')} placeholder="Work Drive" required /></Field>
        <Field label="Folder id" hint="Empty uses the root of My Drive."><Input value={form.folderId} onChange={set('folderId')} placeholder="1AbC…" className="font-mono" /></Field>
        <Field label="OAuth client id"><Input value={form.clientId} onChange={set('clientId')} required className="font-mono" /></Field>
        <Field label="OAuth client secret">
          <Input type="password" value={form.clientSecret} onChange={set('clientSecret')} required={!backend} placeholder={keep} className="font-mono" autoComplete="off" />
        </Field>
        <Field label="Refresh token" wide>
          <Input type="password" value={form.refreshToken} onChange={set('refreshToken')} required={!backend} className="font-mono" autoComplete="off"
            placeholder={backend ? keep : 'Sign in below, or paste an offline-access refresh token'} />
          <GoogleOAuthButton
            clientId={form.clientId}
            clientSecret={form.clientSecret}
            backend={backend && form.clientId.trim() === cfg.clientId ? { workspaceId, driver: 'gdrive', address: backend.address } : undefined}
            scope={readOnly ? 'drive.readonly' : 'drive'}
            disabled={busy}
            onLinked={({ refreshToken, account }) => setForm((f) => ({ ...f, refreshToken, name: f.name.trim() || (account ? `Drive (${account})` : f.name) }))}
          />
        </Field>
      </div>
      <div className="divide-y">
        <OptionRow label="Watch for changes" hint="Check Drive every minute for edits made there." checked={watch} onChange={setWatch} />
        <OptionRow label="Read-only" hint="Canvas never deletes or writes files in this Drive." checked={readOnly} onChange={setReadOnly} />
      </div>
    </FormShell>
  )
}

// An existing S3-compatible bucket, optionally scoped to a key prefix.
export function S3BackendForm({ workspaceId, backend, onSaved, onCancel }: FormProps) {
  const cfg = backend?.config || {}
  const [form, setForm] = useState({
    name: String(cfg.label || ''), bucket: String(cfg.bucket || ''), prefix: String(cfg.prefix || ''),
    endpoint: String(cfg.endpoint || ''), region: String(cfg.region || 'us-east-1'),
    accessKeyId: '', secretAccessKey: '', sessionToken: '',
  })
  const [pathStyle, setPathStyle] = useState(cfg.forcePathStyle !== false)
  const [readOnly, setReadOnly] = useState(cfg.readOnly === true)
  const [watch, setWatch] = useState(cfg.watch === true)
  const [clearToken, setClearToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })) })
  const valid = !!form.name.trim() && !!form.bucket.trim() && (!!backend || (!!form.accessKeyId.trim() && !!form.secretAccessKey.trim()))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const secrets = Object.fromEntries((['accessKeyId', 'secretAccessKey', 'sessionToken'] as const).flatMap((key) => {
        const value = form[key].trim()
        return value ? [[key, value]] : []
      }))
      // Bucket, endpoint and prefix identify the backend; an edit leaves them out.
      const config = {
        label: form.name.trim(), region: form.region.trim() || 'us-east-1', forcePathStyle: pathStyle, readOnly, watch,
        ...(backend ? {} : { bucket: form.bucket.trim(), prefix: form.prefix.trim(), endpoint: form.endpoint.trim() }),
        ...secrets, ...(clearToken ? { sessionToken: '' } : {}),
      }
      if (backend) await updateBackend(workspaceId, 's3', backend.address, config)
      else await addBackend(workspaceId, 's3', config)
      showToast({ title: backend ? 'S3 connection saved' : 'S3 bucket connected', description: backend ? undefined : `${form.name.trim()} is being indexed in the background` })
      await onSaved()
    } catch (err) {
      showToast({ title: 'Could not connect S3', description: message(err, 'Request failed'), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const keep = backend ? 'Leave blank to keep the stored value' : ''
  return (
    <FormShell intro="Amazon S3, OVH, MinIO, Garage, RustFS or Ceph RGW. Connects an existing bucket; the access key needs list, read and write on it."
      busy={busy} valid={valid} submitLabel={backend ? 'Save connection' : 'Connect bucket'} onSubmit={submit} onCancel={onCancel}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input {...field('name')} required placeholder="Accounting archive" /></Field>
        <Field label="Bucket" hint={backend ? 'Fixed after the bucket is connected.' : undefined}><Input {...field('bucket')} disabled={!!backend} required placeholder="accounting" className="font-mono" /></Field>
        <Field label="Endpoint" hint={backend ? 'Fixed after the bucket is connected.' : 'Blank for Amazon S3.'}><Input {...field('endpoint')} disabled={!!backend} type="url" placeholder="https://s3.gra.io.cloud.ovh.net" className="font-mono" /></Field>
        <Field label="Region"><Input {...field('region')} required placeholder="us-east-1" className="font-mono" /></Field>
        <Field label="Key prefix" wide hint={backend ? 'Fixed after the bucket is connected.' : 'Optional. Canvas only reads and writes below this prefix.'}>
          <Input {...field('prefix')} disabled={!!backend} placeholder="Augmentd/Accounting" className="font-mono" />
        </Field>
        <Field label="Access key ID"><Input {...field('accessKeyId')} required={!backend} autoComplete="off" placeholder={keep} className="font-mono" /></Field>
        <Field label="Secret access key"><Input {...field('secretAccessKey')} type="password" required={!backend} autoComplete="off" placeholder={keep} className="font-mono" /></Field>
        <Field label="Session token" wide hint="Only for temporary credentials.">
          <Input {...field('sessionToken')} disabled={clearToken} type="password" autoComplete="off" placeholder={keep} className="font-mono" />
        </Field>
      </div>
      <div className="divide-y">
        {backend && <OptionRow label="Remove the stored session token" checked={clearToken} onChange={setClearToken} />}
        <OptionRow label="Path-style addressing" hint="Needed by most S3-compatible servers. Turn off for Amazon S3 virtual-hosted buckets." checked={pathStyle} onChange={setPathStyle} />
        <OptionRow label="Watch for changes" hint="List the bucket every minute. Each pass costs list requests, and changed objects are downloaded to index them." checked={watch} onChange={setWatch} />
        <OptionRow label="Read-only" hint="Canvas never writes or deletes objects in this bucket." checked={readOnly} onChange={setReadOnly} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Saving a writable connection writes and removes one small test object under <code className="font-mono">.canvas-probe/</code>. Files filed to a chosen path are limited to 5 GiB each; uploads to a primary data store have no size limit.
      </p>
    </FormShell>
  )
}

export function StorageForm({ kind, ...props }: FormProps & { kind: StorageKind }) {
  if (kind === 'gdrive') return <GoogleDriveForm {...props} />
  if (kind === 's3') return <S3BackendForm {...props} />
  return <LocalFolderForm {...props} />
}

import { useState } from 'react'
import { Database, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { addBackend, updateBackend, type Backend } from '@/services/workspace'

export function S3BackendForm({ workspaceId, backend, onSaved }: {
  workspaceId: string; backend?: Backend; onSaved: () => Promise<void> | void
}) {
  const cfg = backend?.config || {}
  const initial = () => ({
    name: String(cfg.label || ''), bucket: String(cfg.bucket || ''), prefix: String(cfg.prefix || ''),
    endpoint: String(cfg.endpoint || ''), region: String(cfg.region || 'us-east-1'),
    accessKeyId: '', secretAccessKey: '', sessionToken: '',
  })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initial)
  const [pathStyle, setPathStyle] = useState(cfg.forcePathStyle !== false)
  const [readOnly, setReadOnly] = useState(cfg.readOnly === true)
  const [watch, setWatch] = useState(cfg.watch === true)
  const [clearToken, setClearToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value })) })

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    try {
      const config = { label: form.name.trim(), bucket: form.bucket.trim(), prefix: form.prefix.trim(),
        endpoint: form.endpoint.trim(), region: form.region.trim() || 'us-east-1', forcePathStyle: pathStyle,
        readOnly, watch, ...Object.fromEntries(['accessKeyId', 'secretAccessKey', 'sessionToken'].flatMap(key => {
          const value = form[key as keyof typeof form].trim()
          return value ? [[key, value]] : []
        })), ...(clearToken ? { sessionToken: '' } : {}) }
      if (backend) await updateBackend(workspaceId, 's3', backend.address, config)
      else await addBackend(workspaceId, 's3', config)
      setOpen(false); setForm(initial())
      showToast({ title: backend ? 'S3 backend updated' : 'S3 backend added', description: 'Use Re-sync to check indexing progress, and filing policies to automate copies.' })
      await onSaved()
    } catch (error) { showToast({ title: 'Could not connect S3', description: error instanceof Error ? error.message : String(error), variant: 'destructive' }) }
    finally { setBusy(false) }
  }

  if (!open) return <Button variant="outline" size="sm" onClick={() => {
    setForm(initial()); setPathStyle(cfg.forcePathStyle !== false); setReadOnly(cfg.readOnly === true)
    setWatch(cfg.watch === true); setClearToken(false); setOpen(true)
  }}>
    {backend ? <Pencil className="mr-2 h-3.5 w-3.5" /> : <Plus className="mr-2 h-3.5 w-3.5" />}{backend ? 'Edit S3 connection' : 'Add S3 bucket'}
  </Button>
  return <form onSubmit={save} className="w-full space-y-3 rounded-lg border p-4">
    <h2 className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4" />{backend ? 'Edit S3 connection' : 'Add S3-compatible bucket'}</h2>
    <p className="text-xs text-muted-foreground">Amazon S3, MinIO, Garage, RustFS or Ceph RGW. Connect an existing bucket, optionally scoped to a prefix. Supports browsing, reads and filing copies; mirror policies and overwrites are unavailable.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs">Name<Input {...field('name')} required placeholder="Accounting archive" /></label>
      <label className="space-y-1 text-xs">Bucket<Input {...field('bucket')} disabled={!!backend} required placeholder="accounting" /></label>
      <label className="space-y-1 text-xs">Endpoint (blank for Amazon S3)<Input {...field('endpoint')} disabled={!!backend} type="url" placeholder="https://s3.example.com" /></label>
      <label className="space-y-1 text-xs">Region<Input {...field('region')} required placeholder="us-east-1" /></label>
      <label className="space-y-1 text-xs sm:col-span-2">Prefix (optional)<Input {...field('prefix')} disabled={!!backend} placeholder="Augmentd/Accounting" /></label>
      <label className="space-y-1 text-xs">Access key ID<Input {...field('accessKeyId')} required={!backend} autoComplete="off" placeholder={backend ? 'Leave blank to keep stored value' : ''} /></label>
      <label className="space-y-1 text-xs">Secret access key<Input {...field('secretAccessKey')} type="password" required={!backend} autoComplete="off" placeholder={backend ? 'Leave blank to keep stored value' : ''} /></label>
      <label className="space-y-1 text-xs sm:col-span-2">Session token (optional)<Input {...field('sessionToken')} disabled={clearToken} type="password" autoComplete="off" placeholder={backend ? 'Leave blank to keep stored value' : ''} /></label>
      {backend && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clearToken} onChange={e => setClearToken(e.target.checked)} />Clear stored session token</label>}
    </div>
    <div className="flex flex-wrap gap-4 text-xs">
      <label className="flex items-center gap-2"><input type="checkbox" checked={pathStyle} onChange={e => setPathStyle(e.target.checked)} />Path-style addressing</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} />Read-only</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={watch} onChange={e => setWatch(e.target.checked)} />Poll for changes</label>
    </div>
    <p className="text-xs text-muted-foreground">Writable connections test conflict protection using a temporary object, then delete it. The key needs list/read/write access and delete access under .canvas-probe/. Initial indexing reads file bytes; polling can incur request and download charges. Upload limit: 5 GiB per file.</p>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setForm(initial()) }}>Cancel</Button><Button disabled={busy}>{busy ? 'Checking connection…' : 'Save connection'}</Button></div>
  </form>
}

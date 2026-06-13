import { useEffect, useState } from 'react'
import { Monitor, RefreshCw, Pencil, Check, X as XIcon, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import {
  listDevices,
  updateDevice,
  type Device,
} from '@/services/devices'

function DeviceCard({
  device,
  onUpdated,
}: {
  device: Device
  onUpdated: (updated: Device) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(device.name)
  const [editDesc, setEditDesc] = useState(device.description ?? '')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const commitEdit = async () => {
    const name = editName.trim()
    if (!name) return
    if (name === device.name && editDesc.trim() === (device.description ?? '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const updated = await updateDevice(device.deviceId, {
        name,
        description: editDesc.trim() || undefined,
      })
      onUpdated({ ...device, ...updated })
      setEditing(false)
      showToast({ title: 'Saved', description: 'Device updated' })
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update device', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    setEditName(device.name)
    setEditDesc(device.description ?? '')
    setEditing(false)
  }

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Monitor className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2 mb-2">
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="h-7 text-sm"
                  placeholder="Device name"
                  autoFocus
                  disabled={saving}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                />
                <Input
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="h-7 text-xs"
                  placeholder="Description (optional)"
                  disabled={saving}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                />
              </div>
            ) : (
              <div className="mb-1">
                <span className="text-sm font-medium">{device.name}</span>
                {device.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{device.description}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-muted-foreground">
              <span title="Device ID">{device.deviceId}</span>
              {device.platform && <span>{device.platform}</span>}
              {device.arch && <span>{device.arch}</span>}
              {device.type && <span className="capitalize">{device.type}</span>}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
              {device.createdAt && <span>registered {formatDate(device.createdAt)}</span>}
              {device.updatedAt && device.updatedAt !== device.createdAt && (
                <span>updated {formatDate(device.updatedAt)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={commitEdit} disabled={saving || !editName.trim()}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} title="Edit name / description">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { showToast } = useToast()

  const load = async () => {
    setIsLoading(true)
    try {
      setDevices(await listDevices())
    } catch (err) {
      showToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load devices', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleUpdated = (updated: Device) =>
    setDevices(prev => prev.map(d => d.deviceId === updated.deviceId ? updated : d))

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6 pb-12 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Devices</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              All devices registered to your account. Link them to individual workspaces in Workspace &rsaquo; Settings &rsaquo; Devices.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground space-y-2">
            <Monitor className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p>No devices registered yet.</p>
            <p className="text-xs">
              Devices register themselves automatically on first connection via{' '}
              <span className="font-mono">POST /auth/devices/register</span>.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map(device => (
              <DeviceCard key={device.deviceId} device={device} onUpdated={handleUpdated} />
            ))}
          </div>
        )}

        {devices.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            To link a device to a workspace, go to Workspace &rsaquo; Settings &rsaquo; Devices.
          </div>
        )}
      </div>
    </div>
  )
}

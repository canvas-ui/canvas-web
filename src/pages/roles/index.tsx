import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import {
  Server,
  Play,
  Square,
  RotateCw,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  Plus
} from "lucide-react"
import { roleService, Role, RoleTemplate } from "@/services/role"
import { getCurrentUserFromToken } from "@/services/auth"
import { FormPanel } from "@/components/common/form-panel"
import { PageHeader } from "@/components/common/page-header"
import { Input } from "@/components/ui/input"
import { useCreatePanel } from "@/hooks/use-create-panel"
import { listWorkspaces } from "@/services/workspace"

// Status badge component
function StatusBadge({ status }: { status: Role['status'] }) {
  const variants = {
    running: { icon: CheckCircle, color: 'text-success', bg: 'bg-success-subtle', label: 'Running' },
    stopped: { icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Stopped' },
    starting: { icon: Clock, color: 'text-info', bg: 'bg-info-subtle', label: 'Starting' },
    stopping: { icon: Clock, color: 'text-warning', bg: 'bg-warning-subtle', label: 'Stopping' },
    error: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive-subtle', label: 'Error' },
    created: { icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Created' },
    configured: { icon: Activity, color: 'text-info', bg: 'bg-info-subtle', label: 'Configured' },
    removed: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive-subtle', label: 'Removed' },
  }

  const variant = variants[status] || variants.created
  const Icon = variant.icon

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${variant.bg} ${variant.color}`}>
      <Icon className="w-3 h-3" />
      {variant.label}
    </span>
  )
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLogs, setSelectedLogs] = useState<{role: Role, logs: string[]} | null>(null)
  const [showCreate, setShowCreate] = useCreatePanel()
  const [templates, setTemplates] = useState<RoleTemplate[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [newRoleTemplate, setNewRoleTemplate] = useState("")
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleWorkspaceId, setNewRoleWorkspaceId] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const { showToast } = useToast()
  const currentUser = getCurrentUserFromToken()

  const fetchRoles = useCallback(async () => {
    try {
      setIsLoading(true)
      // Fetch workspace roles for current user
      const fetchedRoles = await roleService.listRoles({
        type: 'workspace',
        userId: currentUser?.id
      })
      setRoles(fetchedRoles)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch roles'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [currentUser?.id])

  useEffect(() => {
    const run = () => fetchRoles()
    void run()
    // Auto-refresh every 30 seconds
    const interval = setInterval(run, 30000)
    return () => clearInterval(interval)
  }, [fetchRoles])

  // Templates and workspaces are only needed by the creation form, so they
  // load with it rather than on every visit to the list.
  useEffect(() => {
    if (!showCreate) return
    roleService.listTemplates()
      .then(all => {
        const workspaceTemplates = all.filter(t => t.type === 'workspace')
        setTemplates(workspaceTemplates)
        setNewRoleTemplate(prev => prev || workspaceTemplates[0]?.id || "")
      })
      .catch(() => setTemplates([]))
    listWorkspaces()
      .then(all => {
        setWorkspaces(all)
        setNewRoleWorkspaceId(prev => prev || all[0]?.id || "")
      })
      .catch(() => setWorkspaces([]))
  }, [showCreate])

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleTemplate || !newRoleName.trim() || !newRoleWorkspaceId) return
    setIsCreating(true)
    try {
      const role = await roleService.createRole({
        template: newRoleTemplate,
        name: newRoleName.trim(),
        type: 'workspace',
        userId: currentUser?.id,
        workspaceId: newRoleWorkspaceId,
      })
      setNewRoleName("")
      setShowCreate(false)
      await fetchRoles()
      showToast({ title: 'Created', description: `Role "${role.name}" created` })
    } catch (err) {
      showToast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create role',
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleStartRole = async (role: Role) => {
    try {
      await roleService.startRole(role.id)
      showToast({
        title: 'Success',
        description: `Role "${role.name}" started successfully`
      })
      fetchRoles()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start role'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleStopRole = async (role: Role) => {
    try {
      await roleService.stopRole(role.id)
      showToast({
        title: 'Success',
        description: `Role "${role.name}" stopped successfully`
      })
      fetchRoles()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop role'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleRestartRole = async (role: Role) => {
    try {
      await roleService.restartRole(role.id)
      showToast({
        title: 'Success',
        description: `Role "${role.name}" restarted successfully`
      })
      fetchRoles()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restart role'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  const handleViewLogs = async (role: Role) => {
    try {
      const logs = await roleService.getRoleLogs(role.id, 100)
      setSelectedLogs({ role, logs })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch logs'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Roles"
        description="Manage your workspace roles and services"
        actions={
          <>
            {!showCreate && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Role
              </Button>
            )}
            <Button onClick={fetchRoles} variant="outline">
              <RotateCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </>
        }
      />

      {showCreate && (
        <FormPanel title="Create New Role" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreateRole} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="role-template" className="mb-1 block text-sm font-medium">Template</label>
                <select
                  id="role-template"
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                  value={newRoleTemplate}
                  onChange={(e) => setNewRoleTemplate(e.target.value)}
                  disabled={isCreating || templates.length === 0}
                >
                  {templates.length === 0 && <option value="">No workspace templates available</option>}
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name} - {template.description}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="role-name" className="mb-1 block text-sm font-medium">Role Name</label>
                <Input
                  id="role-name"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g., canvas-sshd"
                  disabled={isCreating}
                />
              </div>
            </div>
            <div>
              <label htmlFor="role-workspace" className="mb-1 block text-sm font-medium">Workspace</label>
              <select
                id="role-workspace"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
                value={newRoleWorkspaceId}
                onChange={(e) => setNewRoleWorkspaceId(e.target.value)}
                disabled={isCreating || workspaces.length === 0}
              >
                {workspaces.length === 0 && <option value="">No workspaces available. Create one first.</option>}
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.label || ws.name}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={isCreating || !newRoleTemplate || !newRoleName.trim() || !newRoleWorkspaceId}>
              <Plus className="mr-2 h-4 w-4" />
              {isCreating ? 'Creating…' : 'Create Role'}
            </Button>
          </form>
        </FormPanel>
      )}

      {/* Roles Grid */}
      {isLoading ? (
        <div className="text-center py-8">Loading roles...</div>
      ) : error ? (
        <div className="text-center py-8 text-destructive">{error}</div>
      ) : roles.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <Server className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            You don't have any workspace roles yet
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Contact your administrator to set up roles for your workspaces
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => (
            <div
              key={role.id}
              className="border rounded-lg p-6 space-y-4 hover:shadow-elevation-2 transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{role.name}</h3>
                  <p className="text-sm text-muted-foreground">{role.template}</p>
                </div>
                <StatusBadge status={role.status} />
              </div>

              {role.container && (
                <div className="text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Server className="w-3 h-3" />
                    <span className="truncate">{role.container.name}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {role.status === 'stopped' || role.status === 'created' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStartRole(role)}
                    className="flex-1"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start
                  </Button>
                ) : role.status === 'running' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStopRole(role)}
                      className="flex-1"
                    >
                      <Square className="w-4 h-4 mr-2" />
                      Stop
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestartRole(role)}
                      className="flex-1"
                    >
                      <RotateCw className="w-4 h-4 mr-2" />
                      Restart
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" disabled className="flex-1">
                    <Clock className="w-4 h-4 mr-2" />
                    {role.status}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleViewLogs(role)}
                  title="View Logs"
                >
                  <FileText className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Global Roles Info */}
      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold mb-4">Global Services</h2>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            Global roles are server-wide services managed by your administrator.
            These include services like SSH access, storage, and other shared infrastructure.
          </p>
          <p>
            To check the status of global services, contact your system administrator.
          </p>
        </div>
      </div>

      {/* Logs Modal */}
      {selectedLogs && (
        <div className="fixed inset-0 bg-scrim flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-elevation-3 max-w-4xl w-full mx-4 max-h-viewport-modal flex flex-col">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">{selectedLogs.role.name} - Logs</h2>
              <p className="text-sm text-muted-foreground">{selectedLogs.role.template}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div data-scheme="dark" className="bg-background text-success p-4 rounded font-mono text-xs overflow-x-auto">
                {selectedLogs.logs.length === 0 ? (
                  <div className="text-muted-foreground">No logs available</div>
                ) : (
                  <pre>{selectedLogs.logs.join('\n')}</pre>
                )}
              </div>
            </div>

            <div className="p-4 border-t flex justify-end">
              <Button onClick={() => setSelectedLogs(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

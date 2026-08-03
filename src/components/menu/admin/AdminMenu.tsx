import { useLocation, useNavigate } from 'react-router-dom'
import { Users, FileText, Layers3, FolderOpen, Brain, Shield, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const adminLinks = [
  { path: '/admin/users', icon: Users, label: 'All Users' },
  { path: '/admin/logs', icon: FileText, label: 'Server Logs' },
  { path: '/admin/contexts', icon: Layers3, label: 'All Contexts' },
  { path: '/admin/workspaces', icon: FolderOpen, label: 'All Workspaces' },
  { path: '/admin/agents', icon: Brain, label: 'All Agents' },
  { path: '/admin/roles', icon: Shield, label: 'All Roles' },
  { path: '/admin/embedding', icon: Sparkles, label: 'Embedding' },
]

export function AdminMenu() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-4 h-12 border-b border-border shrink-0">
        <span className="text-sm font-semibold">Administration</span>
      </div>

      {/* Links */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="space-y-1 px-2">
          {adminLinks.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path

            return (
              <button
                key={path}
                type="button"
                onClick={() => navigate(path)}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors',
                  isActive
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

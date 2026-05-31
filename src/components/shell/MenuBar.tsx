import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Layers3,
  LayoutGrid,
  Brain,
  Shield,
  Settings,
  LogOut,
  Users,
  FileText,
  FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMenu, type MenuSection } from './menu-context'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/toast-container'

interface MenuItemProps {
  section: MenuSection
  icon: React.ReactNode
  label: string
  disabled?: boolean
}

function MenuItem({ section, icon, label, disabled }: MenuItemProps) {
  const { state, toggleSection } = useMenu()
  const isActive = state.activeSection === section

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && section && toggleSection(section)}
          className={cn(
            'relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
            isActive
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
            disabled && 'opacity-30 cursor-not-allowed',
          )}
        >
          {isActive && (
            <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-foreground rounded-l" />
          )}
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

interface NavItemProps {
  path: string
  icon: React.ReactNode
  label: string
}

function NavItem({ path, icon, label }: NavItemProps) {
  const navigate = useNavigate()
  const { setSection } = useMenu()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            setSection('admin')
            navigate(path)
          }}
          className="flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function MenuBar() {
  const { state } = useMenu()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const isAdmin = state.user?.userType === 'admin'

  const handleLogout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
      localStorage.removeItem('authToken')
      navigate('/login')
    } catch {
      showToast({ title: 'Error', description: 'Logout failed', variant: 'destructive' })
    }
  }, [navigate, showToast])

  const getUserInitials = (email: string) =>
    email.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase()).join('').slice(0, 2)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col items-center w-[var(--m0-width)] h-full bg-transparent shrink-0">
        {/* Logo */}
        <div className="flex items-center justify-center h-12 w-full shrink-0">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <img src="/images/logo-wr_128x128.png" alt="Canvas" className="w-6 h-6" />
          </button>
        </div>

        {/* Main nav */}
        <nav className="flex flex-col items-center gap-1 py-2 flex-1">
          <MenuItem section="contexts" icon={<Layers3 className="w-5 h-5" />} label="Contexts" />
          <MenuItem section="workspaces" icon={<LayoutGrid className="w-5 h-5" />} label="Workspaces" />
          <MenuItem section="agents" icon={<Brain className="w-5 h-5" />} label="Agents" />
          <MenuItem section="roles" icon={<Shield className="w-5 h-5" />} label="Roles" disabled />

          {/* Admin section */}
          {isAdmin && (
            <>
              <div className="w-6 h-px bg-sidebar-border my-2" />
              <NavItem path="/admin/users" icon={<Users className="w-5 h-5" />} label="All Users" />
              <NavItem path="/admin/logs" icon={<FileText className="w-5 h-5" />} label="Server Logs" />
              <NavItem path="/admin/workspaces" icon={<FolderOpen className="w-5 h-5" />} label="All Workspaces" />
              <NavItem path="/admin/agents" icon={<Brain className="w-5 h-5" />} label="All Agents" />
              <NavItem path="/admin/roles" icon={<Shield className="w-5 h-5" />} label="All Roles" />
            </>
          )}
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col items-center gap-1 py-2 shrink-0">
          <div className="w-6 h-px bg-sidebar-border mb-2" />

          <MenuItem section="settings" icon={<Settings className="w-5 h-5" />} label="Settings" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-[10px] bg-muted">
                    {state.user?.email ? getUserInitials(state.user.email) : 'U'}
                  </AvatarFallback>
                </Avatar>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {state.user?.email?.split('@')[0] || 'Profile'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center justify-center w-10 h-10 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Logout
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}

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
  Menu,
  Wrench,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMenu, type MenuSection } from './use-menu'
import { useToolbox } from '@/components/toolbox/use-toolbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

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
          aria-label={label}
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
  // Which M1 panel to leave open behind the page. Admin pages keep the admin
  // list up; standalone pages (Roles) open no panel at all.
  section?: MenuSection
}

function NavItem({ path, icon, label, section = 'admin' }: NavItemProps) {
  const navigate = useNavigate()
  const { setSection } = useMenu()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={() => {
            setSection(section)
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

// Mobile-only entry point for the M0 rail — a small fixed toggle in the
// bottom-left corner (the bottom-right belongs to the quick-add stack).
// z-nav keeps it *below* every drawer scrim (z-40+), so while any overlay
// is open the toggle is dimmed and a tap there hits the scrim instead —
// no floating chrome ever covers a panel's bottom controls.
export function MobileMenuToggle() {
  const { state, toggleM0 } = useMenu()
  return (
    <button
      type="button"
      onClick={toggleM0}
      aria-label={state.m0Open ? 'Close menu' : 'Open menu'}
      // Sized by the rail-width token (not a fixed w-12) so toggle and rail
      // read as one aligned column at every density - compact/touch change
      // the rail width and a hardcoded 3rem toggle drifts off-center.
      className="fixed bottom-rail-inset left-2 z-nav flex h-rail w-rail items-center justify-center rounded-full bg-foreground text-background shadow-elevation-4 md:hidden"
    >
      {state.m0Open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  )
}

export function MenuBar() {
  const { state, closeM0, closeM1 } = useMenu()
  const { state: toolboxState, setView, closeT1 } = useToolbox()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const isAdmin = state.user?.userType === 'admin'

  // Mobile replacement for the (hidden) toolbox FAB — opening the toolbox
  // drawer dismisses the rail and any M1 drawer it was floating beside.
  const handleToolbox = () => {
    if (toolboxState.t1Open) {
      closeT1()
    } else {
      setView('tools')
    }
    closeM1()
    closeM0()
  }

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
      {/* Mobile: dim the content behind the open rail (tap to close), same
          treatment as the M1/M2 drawer. */}
      {/* z-nav-scrim: above content, below the M1/M2 drawer (z-40) and the rail
          toggle (z-nav) — only the content section dims, not other menus. */}
      {state.m0Open && (
        <div className="fixed inset-0 z-nav-scrim bg-scrim animate-fade-in md:hidden" onClick={closeM0} aria-hidden />
      )}
      <div
        className={cn(
          'flex flex-col items-center w-rail h-full bg-transparent shrink-0',
          // Mobile: hidden by default; while open it floats as a slim rail
          // card anchored above the bottom-left toggle button.
          state.m0Open
            ? 'max-md:fixed max-md:left-2 max-md:top-2 max-md:bottom-rail-stack max-md:z-rail max-md:h-auto max-md:rounded-xl max-md:bg-card max-md:surface-glass max-md:shadow-elevation-5 max-md:animate-fade-in'
            : 'max-md:hidden',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-center h-12 w-full shrink-0">
          <button
            type="button"
            aria-label="Canvas home"
            onClick={() => navigate('/home')}
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <img src="/images/logo-br_128x128.png" alt="" className="w-6 h-6" />
          </button>
        </div>

        {/* Main nav — scrolls on vertically small screens so the bottom
            section (logout) never overlaps the rail toggle below the card. */}
        <nav className="flex flex-col items-center gap-1 py-2 flex-1 min-h-0 overflow-y-auto">
          <MenuItem section="contexts" icon={<Layers3 className="w-5 h-5" />} label="Contexts" />
          <MenuItem section="workspaces" icon={<LayoutGrid className="w-5 h-5" />} label="Workspaces" />
          <MenuItem section="agents" icon={<Brain className="w-5 h-5" />} label="Agents" />
          {/* Roles have no M1 list of their own — the page is the surface. */}
          <NavItem path="/roles" section={null} icon={<Shield className="w-5 h-5" />} label="Roles" />

          {/* Admin section */}
          {isAdmin && (
            <>
              <div className="w-6 h-px bg-border my-2" />
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
          <div className="w-6 h-px bg-border mb-2" />

          {/* The FAB only lives on the bare quick-capture desk (home) — on
              content pages and on mobile the rail carries the toolbox entry
              point instead */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToolbox}
                aria-label={toolboxState.t1Open ? 'Close toolbox' : 'Open toolbox'}
                className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
                  toolboxState.t1Open
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                <Wrench className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Toolbox
            </TooltipContent>
          </Tooltip>

          <MenuItem section="settings" icon={<Settings className="w-5 h-5" />} label="Settings" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={state.user?.email ? `Profile: ${state.user.email}` : 'Profile'}
                onClick={() => navigate('/home')}
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <Avatar className="h-7 w-7 touch-target">
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
                aria-label="Log out"
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

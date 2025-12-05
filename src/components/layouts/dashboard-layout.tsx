import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useState, useEffect, useCallback } from "react"
import { LogOut, LayoutGrid, Layers3, Settings, FolderOpen, Brain, Shield, Server, ChevronDown, ChevronRight, Users } from "lucide-react"
import { api } from "@/lib/api"
import { useToast } from "@/components/ui/toast-container"
import { getCurrentUserFromToken } from "@/services/auth"
import { listContexts } from "@/services/context"
import { listWorkspaces } from "@/services/workspace"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

// Separate component for sidebar content
function DashboardSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [user, setUser] = useState<{ id: string; email: string; userType: string } | null>(null)
  const [contextsOpen, setContextsOpen] = useState(false)
  const [workspacesOpen, setWorkspacesOpen] = useState(false)
  const [contexts, setContexts] = useState<any[]>([])
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [isLoadingContexts, setIsLoadingContexts] = useState(false)
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false)
  const [hasFetchedContexts, setHasFetchedContexts] = useState(false)
  const [hasFetchedWorkspaces, setHasFetchedWorkspaces] = useState(false)

  // Get user information from token
  useEffect(() => {
    const currentUser = getCurrentUserFromToken()
    setUser(currentUser)
  }, [])

  // Fetch contexts when submenu opens
  useEffect(() => {
    if (contextsOpen && !hasFetchedContexts && !isLoadingContexts) {
      setIsLoadingContexts(true)
      listContexts()
        .then(data => {
          setContexts(data || [])
          setHasFetchedContexts(true)
        })
        .catch(err => {
          console.error('Failed to fetch contexts:', err)
          setHasFetchedContexts(true)
        })
        .finally(() => setIsLoadingContexts(false))
    }
  }, [contextsOpen, hasFetchedContexts, isLoadingContexts])

  // Fetch workspaces when submenu opens
  useEffect(() => {
    if (workspacesOpen && !hasFetchedWorkspaces && !isLoadingWorkspaces) {
      setIsLoadingWorkspaces(true)
      listWorkspaces()
        .then(data => {
          setWorkspaces(data || [])
          setHasFetchedWorkspaces(true)
        })
        .catch(err => {
          console.error('Failed to fetch workspaces:', err)
          setHasFetchedWorkspaces(true)
        })
        .finally(() => setIsLoadingWorkspaces(false))
    }
  }, [workspacesOpen, hasFetchedWorkspaces, isLoadingWorkspaces])

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + "/")
  }

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
      localStorage.removeItem('authToken')
      navigate('/login')
    } catch (error) {
      console.error('Logout failed', error)
      showToast({
        title: 'Error',
        description: 'Logout failed',
        variant: 'destructive'
      })
    }
  }

  const navigateTo = useCallback((path: string) => {
    if (location.pathname !== path) {
      navigate(path)
    }
  }, [location.pathname, navigate])

  const getUserInitials = (email: string) => {
    return email
      .split('@')[0]
      .split('.')
      .map(part => part.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2)
  }

  const isAdmin = user?.userType === 'admin'

  return (
    <>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <button
                  onClick={() => navigateTo('/home')}
                  className="flex items-center"
                  type="button"
                >
                  <div className="flex aspect-square size-8 items-center justify-center text-sidebar-primary-foreground">
                    <img
                      src="/images/logo-wr_128x128.png"
                      alt="Canvas Logo"
                      className="size-6"
                    />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Canvas</span>
                  </div>
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Main navigation items */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive('/contexts')}
                    tooltip="Manage your contexts"
                  >
                    <button
                      onClick={() => {
                        const wasOpen = contextsOpen
                        setContextsOpen(!contextsOpen)
                        if (!wasOpen) {
                          navigateTo('/contexts')
                        }
                      }}
                      className="flex items-center justify-between w-full"
                      type="button"
                    >
                      <div className="flex items-center">
                        <Layers3 className="size-4" />
                        <span>Contexts</span>
                      </div>
                      {contextsOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  </SidebarMenuButton>
                  {contextsOpen && (
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={location.pathname === '/contexts'}
                        >
                          <button
                            onClick={() => navigateTo('/contexts')}
                            type="button"
                          >
                            <span>All Contexts</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {isLoadingContexts ? (
                        <SidebarMenuSubItem>
                          <span className="text-xs text-muted-foreground px-2">Loading...</span>
                        </SidebarMenuSubItem>
                      ) : (
                        contexts.slice(0, 10).map((context) => (
                          <SidebarMenuSubItem key={context.id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location.pathname === `/contexts/${context.id}`}
                            >
                              <button
                                onClick={() => navigateTo(`/contexts/${context.id}`)}
                                type="button"
                              >
                                <span className="truncate">{context.id}</span>
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))
                      )}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive('/workspaces')}
                    tooltip="Manage your workspaces"
                  >
                    <button
                      onClick={() => {
                        const wasOpen = workspacesOpen
                        setWorkspacesOpen(!workspacesOpen)
                        if (!wasOpen) {
                          navigateTo('/workspaces')
                        }
                      }}
                      className="flex items-center justify-between w-full"
                      type="button"
                    >
                      <div className="flex items-center">
                        <LayoutGrid className="size-4" />
                        <span>Workspaces</span>
                      </div>
                      {workspacesOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  </SidebarMenuButton>
                  {workspacesOpen && (
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={location.pathname === '/workspaces'}
                        >
                          <button
                            onClick={() => navigateTo('/workspaces')}
                            type="button"
                          >
                            <span>All Workspaces</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {isLoadingWorkspaces ? (
                        <SidebarMenuSubItem>
                          <span className="text-xs text-muted-foreground px-2">Loading...</span>
                        </SidebarMenuSubItem>
                      ) : (
                        workspaces.slice(0, 10).map((workspace) => (
                          <SidebarMenuSubItem key={workspace.id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location.pathname === `/workspaces/${workspace.name}`}
                            >
                              <button
                                onClick={() => navigateTo(`/workspaces/${workspace.name}`)}
                                type="button"
                              >
                                <span className="truncate">{workspace.label || workspace.name}</span>
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))
                      )}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive('/agents')}
                    tooltip="Manage your AI agents"
                  >
                    <button
                      onClick={() => navigateTo('/agents')}
                      className="flex items-center"
                      type="button"
                    >
                      <Brain className="size-4" />
                      <span>Agents</span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive('/roles')}
                    tooltip="Manage roles (coming soon)"
                  >
                    <button
                      onClick={() => navigateTo('/roles')}
                      className="flex items-center"
                      type="button"
                    >
                      <Shield className="size-4" />
                      <span>Roles</span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive('/remotes')}
                    tooltip="Manage remotes (coming soon)"
                  >
                    <button
                      onClick={() => navigateTo('/remotes')}
                      className="flex items-center"
                      type="button"
                    >
                      <Server className="size-4" />
                      <span>Remotes</span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* Admin section */}
          {isAdmin && (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Administration</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive('/admin/users')}
                        tooltip="Manage all users"
                      >
                        <button
                          onClick={() => navigateTo('/admin/users')}
                          className="flex items-center"
                          type="button"
                        >
                          <Users className="size-4" />
                          <span>All Users</span>
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive('/admin/contexts')}
                        tooltip="Manage all contexts"
                      >
                        <button
                          onClick={() => navigateTo('/admin/contexts')}
                          className="flex items-center"
                          type="button"
                        >
                          <Layers3 className="size-4" />
                          <span>All Contexts</span>
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive('/admin/workspaces')}
                        tooltip="Manage all workspaces"
                      >
                        <button
                          onClick={() => navigateTo('/admin/workspaces')}
                          className="flex items-center"
                          type="button"
                        >
                          <FolderOpen className="size-4" />
                          <span>All Workspaces</span>
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive('/admin/agents')}
                        tooltip="Manage all agents"
                      >
                        <button
                          onClick={() => navigateTo('/admin/agents')}
                          className="flex items-center"
                          type="button"
                        >
                          <Brain className="size-4" />
                          <span>All Agents</span>
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive('/admin/roles')}
                        tooltip="Manage all roles (coming soon)"
                      >
                        <button
                          onClick={() => navigateTo('/admin/roles')}
                          className="flex items-center"
                          type="button"
                        >
                          <Shield className="size-4" />
                          <span>All Roles</span>
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarSeparator />
            </>
          )}

          {/* Settings section */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive('/api-tokens')}
                    tooltip="Manage your API tokens"
                  >
                    <button
                      onClick={() => navigateTo('/api-tokens')}
                      className="flex items-center"
                      type="button"
                    >
                      <Settings className="size-4" />
                      <span>Settings</span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                asChild
                tooltip={`${user?.email?.split('@')[0] || "User"} - Go to Home`}
              >
                <button
                  onClick={() => navigateTo('/home')}
                  className="flex items-center gap-2 p-2"
                  type="button"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="" alt={user?.email || "User"} />
                    <AvatarFallback className="text-xs">
                      {user?.email ? getUserInitials(user.email) : "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user?.email?.split('@')[0] || "User"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email || "user@example.com"}
                    </span>
                  </div>
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <SidebarSeparator />

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="size-4" />
                  <span>Logout</span>
                </Button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="h-4 w-px bg-sidebar-border" />
            <nav className="flex items-center space-x-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {location.pathname === '/home' && 'Home'}
                {location.pathname === '/workspaces' && 'Workspaces'}
                {location.pathname.startsWith('/workspaces/') && location.pathname !== '/workspaces' && 'Workspace Details'}
                {location.pathname === '/contexts' && 'Contexts'}
                {location.pathname.startsWith('/contexts/') && location.pathname !== '/contexts' && 'Context Details'}
                {location.pathname.startsWith('/users/') && location.pathname.includes('/contexts/') && 'Shared Context Details'}
                {location.pathname === '/api-tokens' && 'Settings'}
                {location.pathname === '/agents' && 'Agents'}
                {location.pathname.startsWith('/agents/') && location.pathname !== '/agents' && 'Agent Details'}
                {location.pathname === '/roles' && 'Roles'}
                {location.pathname === '/remotes' && 'Remotes'}
                {location.pathname === '/admin/users' && 'User Management'}
                {location.pathname === '/admin/contexts' && 'All Contexts'}
                {location.pathname === '/admin/workspaces' && 'All Workspaces'}
                {location.pathname === '/admin/agents' && 'All Agents'}
                {location.pathname === '/admin/roles' && 'All Roles'}
              </span>
            </nav>
          </div>
        </header>

        {/* Main content */}
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Outlet />
        </div>

        {/* Footer */}
        <footer className="border-t py-4">
          <div className="container mx-auto px-4 flex justify-between items-center text-sm text-muted-foreground">
            <div>© {new Date().getFullYear()} Canvas. All rights reserved.</div>
            <a
              href="https://github.com/canvas-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-2">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
              </svg>
              GitHub
            </a>
          </div>
        </footer>
      </SidebarInset>
    </>
  )
}

export function DashboardLayout() {
  return (
    <SidebarProvider defaultOpen={false}>
      <DashboardSidebar />
    </SidebarProvider>
  )
}

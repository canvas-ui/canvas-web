import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useState, useEffect, useCallback } from "react"
import { Menu, X, LogOut, Home, Briefcase, Network, KeyRound } from "lucide-react"
import { api } from "@/lib/api"
import { useToast } from "@/components/ui/toast-container"

export function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(true)
    }

    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }, [location.pathname, isMobile])

  const isActive = (path: string) => {
    return location.pathname === path
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

  // Safe navigation function that uses React Router
  const navigateTo = useCallback((path: string) => {
    if (location.pathname !== path) {
      navigate(path);
    }
  }, [location.pathname, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b z-[60] relative bg-white">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="mr-2"
                onClick={() => setSidebarOpen(!isSidebarOpen)}
              >
                {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            )}
            <button
              onClick={() => navigateTo('/workspaces')}
              className="font-bold text-xl flex items-center"
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-6 w-6">
                <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
              </svg>
              Canvas
            </button>
          </div>
        </div>
      </header>

      {/* Main content with sidebar */}
      <div className="flex-1 flex relative">
        {/* Sidebar */}
        <aside className={`
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isMobile ? 'fixed pt-16 inset-y-0 left-0 z-50 h-[100dvh]' : 'relative'}
          w-64 border-r bg-background transition-transform duration-200 ease-in-out
        `}>
          <nav className="p-4 space-y-2">
            <button
              onClick={() => navigateTo('/home')}
              className={`flex items-center w-full text-left px-4 py-2 rounded-md ${isActive('/home') ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              type="button"
            >
              <Home className="mr-2 h-4 w-4" /> Home
            </button>
            <button
              onClick={() => navigateTo('/workspaces')}
              className={`flex items-center w-full text-left px-4 py-2 rounded-md ${isActive('/workspaces') ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              type="button"
            >
              <Briefcase className="mr-2 h-4 w-4" /> Workspaces
            </button>
            <button
              onClick={() => navigateTo('/contexts')}
              className={`flex items-center w-full text-left px-4 py-2 rounded-md ${isActive('/contexts') ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              type="button"
            >
              <Network className="mr-2 h-4 w-4" /> Contexts
            </button>
            <button
              onClick={() => navigateTo('/api-tokens')}
              className={`flex items-center w-full text-left px-4 py-2 rounded-md ${isActive('/api-tokens') ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              type="button"
            >
              <KeyRound className="mr-2 h-4 w-4" /> API Tokens
            </button>
            <div className="my-4 border-t border-border" />
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-2 rounded-md text-destructive hover:bg-destructive/10"
              type="button"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </button>
          </nav>
        </aside>

        {/* Overlay for mobile */}
        {isMobile && isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
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
    </div>
  )
}

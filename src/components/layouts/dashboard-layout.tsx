import { useLocation, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { API_ROUTES } from "@/config/api"
import { useState, useEffect, useCallback } from "react"
import { Menu, X, LogOut, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { useToast } from "@/components/ui/toast-container"

interface DashboardLayoutProps {
  children: React.ReactNode
}

interface Session {
  id: string
  name: string
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [sessions, setSessions] = useState<Session[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Get selected session from localStorage
  const storedSession = localStorage.getItem('selectedSession')
  const [selectedSession, setSelectedSession] = useState<{id: string, name: string} | null>(
    storedSession ? JSON.parse(storedSession) : null
  )

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
    // Always close dropdown when navigating
    setIsDropdownOpen(false)
  }, [location.pathname, isMobile])

  // Fetch sessions on component mount
  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    try {
      const response = await api.get<ApiResponse<Session[]>>(API_ROUTES.sessions)
      setSessions(response.payload)
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
      showToast({
        title: 'Error',
        description: 'Failed to fetch sessions',
        variant: 'destructive'
      })
    }
  }

  const handleSessionChange = (session: Session) => {
    // Use session ID if name is not available
    const sessionName = session.name || `Session ${session.id.substring(0, 8)}`;
    const sessionData = { id: session.id, name: sessionName }
    setSelectedSession(sessionData)
    localStorage.setItem('selectedSession', JSON.stringify(sessionData))
    setIsDropdownOpen(false)

    showToast({
      title: 'Success',
      description: `Session "${sessionName}" selected successfully`
    })
  }

  const isActive = (path: string) => {
    return location.pathname === path
  }

  const handleLogout = async () => {
    try {
      await api.post(API_ROUTES.logout)
      localStorage.removeItem('token')
      localStorage.removeItem('selectedSession')
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
          <div className="flex items-center gap-4">
            {selectedSession && (
              <div className="relative">
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  type="button"
                >
                  <span>{selectedSession.name}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>

                {isDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0"
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <div className="absolute top-full mt-1 w-48 rounded-md shadow-lg bg-white border z-50">
                      {sessions.map((session) => (
                        <button
                          key={session.id}
                          className={cn(
                            "w-full text-left px-4 py-2 hover:bg-accent/50",
                            session.id === selectedSession?.id && "bg-accent"
                          )}
                          onClick={() => handleSessionChange(session)}
                          type="button"
                        >
                          {session.name}
                        </button>
                      ))}
                      <button
                        className="block border-t px-4 py-2 text-sm text-muted-foreground hover:bg-accent/50 w-full text-left"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          navigateTo('/sessions');
                        }}
                        type="button"
                      >
                        Manage Sessions
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
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
              onClick={() => navigateTo('/workspaces')}
              className={`block w-full text-left px-4 py-2 rounded-md ${isActive('/workspaces') ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              type="button"
            >
              Workspaces
            </button>
            <button
              onClick={() => navigateTo('/contexts')}
              className={`block w-full text-left px-4 py-2 rounded-md ${isActive('/contexts') ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              type="button"
            >
              Contexts
            </button>
            <button
              onClick={() => navigateTo('/sessions')}
              className={`block w-full text-left px-4 py-2 rounded-md ${isActive('/sessions') ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              type="button"
            >
              Sessions
            </button>
            <button
              onClick={() => navigateTo('/api-tokens')}
              className={`block w-full text-left px-4 py-2 rounded-md ${isActive('/api-tokens') ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              type="button"
            >
              API Tokens
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
        <main className="flex-1 overflow-auto">
          {children}
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

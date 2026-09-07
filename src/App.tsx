import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'

// The experimental content-centric shell (src/next/) — lazily mounted so the
// management UI's bundle is unaffected. This is its ONLY entry point.
const NextShell = lazy(() => import('./next/NextShell'))
import LoginPage from './pages/auth/login'
import RegisterPage from './pages/auth/register'
import { ProtectedRoute } from './components/auth/protected-route'
import { PublicRoute } from './components/auth/public-route'
import PublicCanvasPage from './pages/pub/canvas'
import AppletHostPage from './pages/apps'
import { UpdateBanner } from './components/common/update-banner'
import { AppShell } from './components/shell/AppShell'
import { shellRoutes } from './routes/shell-routes'
import { ToastContainer } from './components/ui/toast-container'
import { useToast } from './components/ui/use-toast'
import { NotificationsProvider } from './components/notifications/notifications-context'
import { CanvasPinsProvider } from './components/home/pins-context'
import { onConnectivityChange } from '@/lib/connectivity'
import { setGlobalErrorHandler } from './lib/error-handler'
import { ThemeProvider } from './theme'

function AppContent() {
  const { showToast } = useToast()

  useEffect(() => {
    // Set up global error handler for API errors
    setGlobalErrorHandler((error: Error, context?: string) => {
      showToast({
        title: 'Error',
        description: context ? `${error.message} (${context})` : error.message,
        variant: 'destructive'
      })
    })
    // Connectivity is reported ONCE per transition, not once per failed
    // request (see lib/connectivity.ts) — offline mode must not toast-storm.
    return onConnectivityChange((offline) => {
      showToast(offline
        ? { title: 'Offline', description: 'Server unreachable — showing cached content where available.' }
        : { title: 'Back online', description: 'Connection to the server restored.' })
    })
  }, [showToast])

  return (
    <BrowserRouter>
      <UpdateBanner />
      <Routes>
        {/* Authentication routes */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/pub/c/:code" element={<PublicCanvasPage />} />

        {/* Standalone applet host - chrome-free, one PWA-shortcut click away.
            /apps/add/:kind is more specific and matches inside the shell below. */}
        <Route path="/apps/:appletId" element={<ProtectedRoute><AppletHostPage /></ProtectedRoute>} />

        {/* /next — the experimental content-centric shell. Chrome-free like
            the applet host; auth required (it talks to the same API). */}
        <Route path="/next/*" element={<ProtectedRoute><Suspense fallback={null}><NextShell /></Suspense></ProtectedRoute>} />

        {/* Dashboard layout for authenticated routes */}
        <Route path="/" element={<ProtectedRoute><NotificationsProvider><CanvasPinsProvider><AppShell /></CanvasPinsProvider></NotificationsProvider></ProtectedRoute>}>
          {shellRoutes}
        </Route>

        {/* Catch-all redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  return (
    // ThemeProvider is outermost: it owns the data-* attributes on <html> that
    // every other component's styling resolves against, including toasts and
    // dialogs that portal outside the router.
    <ThemeProvider>
      <ToastContainer>
        <AppContent />
      </ToastContainer>
    </ThemeProvider>
  )
}

export default App

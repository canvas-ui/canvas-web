import { useMemo } from 'react'
import {
  NavigationType,
  Routes,
  createPath,
  parsePath,
  UNSAFE_LocationContext as LocationContext,
  UNSAFE_NavigationContext as NavigationContext,
  UNSAFE_RouteContext as RouteContext,
  type Location,
  type To,
} from 'react-router-dom'
import { shellRoutes } from '@/routes/shell-routes'

// The webui trick for "a URL inside a canvas": a second, in-memory router
// scoped to ONE canvas. Every page component keeps using useLocation /
// useNavigate / <Link> unchanged, but here they read and write this canvas's
// own location instead of the browser URL — the same way a Tauri webview in
// canvas-desktop would own its own address bar.
//
// Nesting a <Router> inside <BrowserRouter> is refused by react-router, so
// the three contexts a Router provides are supplied directly. RouteContext is
// reset to "no parent" so the shell routes match from the root again rather
// than as descendants of the outer `/` shell route. No history stack: go()
// is a no-op, push and replace both just set the location.

interface Props {
  location: string
  onNavigate: (next: string) => void
  children?: never
}

function toPath(to: To): string {
  return createPath(typeof to === 'string' ? parsePath(to) : to)
}

export function CanvasRouter({ location, onNavigate }: Props) {
  const loc = useMemo<Location>(() => {
    const p = parsePath(location)
    return { pathname: p.pathname || '/', search: p.search || '', hash: p.hash || '', state: null, key: location }
  }, [location])

  const navigation = useMemo(
    () => ({
      basename: '/',
      static: false,
      useTransitions: undefined,
      future: {},
      navigator: {
        createHref: toPath,
        go: () => {},
        push: (to: To) => onNavigate(toPath(to)),
        replace: (to: To) => onNavigate(toPath(to)),
      },
    }),
    [onNavigate],
  )

  return (
    <NavigationContext.Provider value={navigation}>
      <LocationContext.Provider value={{ location: loc, navigationType: NavigationType.Push }}>
        <RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false }}>
          <Routes>{shellRoutes}</Routes>
        </RouteContext.Provider>
      </LocationContext.Provider>
    </NavigationContext.Provider>
  )
}

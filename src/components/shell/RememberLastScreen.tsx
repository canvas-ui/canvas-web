import { useEffect, useState } from 'react'
import { createRoutesFromChildren, matchRoutes, Navigate, useLocation } from 'react-router-dom'
import { shellRoutes } from '@/routes/shell-routes'
import { lastScreenKey, safeLastScreen } from '@/lib/last-screen'

const routes = createRoutesFromChildren(shellRoutes)
const valid = (value: unknown) => {
  const path = safeLastScreen(value)
  return path && matchRoutes(routes, path) ? path : null
}

/** Mounted once per browser launch, outside the shell and its nested routers. */
export function RememberLastScreen() {
  const location = useLocation()
  const [launch] = useState(() => {
    if (location.pathname !== '/' || location.search || location.hash) return null
    try {
      const token = localStorage.getItem('authToken')
      if (!token) return null
      return { key: location.key, path: valid(localStorage.getItem(lastScreenKey(token))) || '/home' }
    } catch { return { key: location.key, path: '/home' } }
  })
  const restoring = launch && location.key === launch.key && location.pathname === '/'
  useEffect(() => {
    if (restoring) return
    const path = valid(location.pathname + location.search + location.hash)
    if (!path) return
    try {
      const token = localStorage.getItem('authToken')
      if (token) localStorage.setItem(lastScreenKey(token), path)
    } catch { /* Storage may be blocked; navigation must still work. */ }
  }, [location.pathname, location.search, location.hash, restoring])
  return restoring ? <Navigate to={launch.path} replace /> : null
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// autoUpdate SW: activates immediately and reloads controlled pages. The
// hourly update() check covers long-lived installed-PWA windows, which never
// navigate and would otherwise keep serving their precache until reopened —
// the "deployment updated but my UI didn't" ghost.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => { void registration.update() }, 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// SW registration + prompt-style update flow (hourly discovery, user-clicked
// reload) lives in lib/sw-update; UpdateBanner renders the affordance.
import '@/lib/sw-update'
import { applyWallpaper, restoreWallpaper } from '@/lib/wallpaper'

// Apply legacy preferences immediately, then hydrate the local image store.
applyWallpaper()
void restoreWallpaper()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

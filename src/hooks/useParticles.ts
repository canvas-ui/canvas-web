import { useEffect } from 'react'

declare global {
  interface Window {
    particlesJS: {
      load: (elementId: string, configPath: string, callback?: () => void) => void
    }
  }
}

export function useParticles(elementId: string) {
  useEffect(() => {
    if (typeof window.particlesJS !== 'undefined') {
      window.particlesJS.load(elementId, '/js/particles.config.json', () => {
        console.log('particles.js config loaded')
      })
    }
    
    // Cleanup function
    return () => {
      if (typeof window.particlesJS !== 'undefined' && window.particlesJS[elementId]) {
        // @ts-ignore - pJS doesn't exist on window but it's added by particles.js
        window.pJS[elementId]?.destroy()
      }
    }
  }, [elementId])
} 
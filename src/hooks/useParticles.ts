import { useEffect } from 'react'

declare global {
  interface Window {
    particlesJS: {
      load: (elementId: string, configPath: string, callback?: () => void) => void;
    };
    pJS?: {
      [key: string]: {
        destroy?: () => void;
      };
    };
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
      if (window.pJS && window.pJS[elementId]?.destroy) {
        window.pJS[elementId].destroy()
      }
    }
  }, [elementId])
} 
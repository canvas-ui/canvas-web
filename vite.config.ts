import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom'],
  },
  json: {
    stringify: false
  },
  build: {
    // Increase chunk size warning limit for MVP stage
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[/\\]react(-dom|-router-dom)?[/\\]/.test(id)) return 'react'
          if (id.includes('lucide-react') || id.includes('@radix-ui')) return 'ui'
          if (id.includes('@iconify')) return 'icons'
          if (id.includes('fuse.js')) return 'search'
          if (id.includes('socket.io-client')) return 'socket'
          if (['class-variance-authority', 'clsx', 'tailwind-merge', 'jwt-decode'].some((pkg) => id.includes(pkg))) return 'utils'
        },
      },
    },
  }
})

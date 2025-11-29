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
        // Manual chunking to separate vendor libraries
        manualChunks: {
          // React and related libraries
          react: ['react', 'react-dom', 'react-router-dom'],
          // UI libraries
          ui: ['lucide-react', '@radix-ui/react-slot', '@radix-ui/react-separator', '@radix-ui/react-toast'],
          // Socket.io and networking
          socket: ['socket.io-client'],
          // Other utilities
          utils: ['class-variance-authority', 'clsx', 'tailwind-merge', 'jwt-decode']
        }
      }
    }
  }
})

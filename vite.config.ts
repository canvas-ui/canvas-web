import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // injectManifest (not generateSW): the share_target POST must be intercepted
      // by a handwritten fetch handler (src/sw.ts) — auth is Bearer-header-only
      // server-side, so a plain server route can't authenticate an OS-launched
      // POST navigation. The SW stashes the shared payload and redirects into the
      // already-authenticated SPA, which uploads it itself. See src/sw.ts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Keep the precache list light — this app is mostly API-driven, not
        // asset-heavy offline content.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      manifest: {
        name: 'Canvas',
        short_name: 'Canvas',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/images/logo_64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/images/logo_128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/images/logo_256x256.png', sizes: '256x256', type: 'image/png' },
          { src: '/images/logo_512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/images/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/images/logo_1024x1024.png', sizes: '1024x1024', type: 'image/png' },
        ],
        // Receives OS-native "Share to Canvas" (text/link/photo/file). POST+multipart
        // covers files, which GET share targets can't receive — handled by the
        // custom service worker (src/sw.ts), not a server route.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'files', accept: ['image/*', 'video/*', '*/*'] }],
          },
        },
      },
    }),
  ],
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

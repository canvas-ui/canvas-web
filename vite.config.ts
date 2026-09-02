import path from "path"
import { readFileSync, cpSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Optional dev proxy to a remote Canvas backend.
 *
 * Set VITE_DEV_PROXY_TARGET=https://some-instance.example.com to run this
 * frontend against a live server. Requests are proxied rather than pointed at
 * via VITE_API_URL so the browser sees them as same-origin: no CORS
 * preflights, and cookies/auth headers behave exactly as they do in
 * production. Socket.io is proxied too, or live updates would silently fail
 * while REST kept working.
 *
 * Dev only — `vite build` never reads this.
 */
const proxyTarget = process.env.VITE_DEV_PROXY_TARGET
const devProxy = proxyTarget
  ? {
      '/rest': { target: proxyTarget, changeOrigin: true, secure: true },
      '/socket.io': { target: proxyTarget, changeOrigin: true, secure: true, ws: true },
    }
  : undefined

// The running UI's own version (Settings > About). package.json is read
// directly rather than imported so tsconfig needs no resolveJsonModule.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Excalidraw resolves its runtime assets (lazy-loaded fonts) against
// window.EXCALIDRAW_ASSET_PATH (set in SketchEditor.tsx to /excalidraw/);
// without it the library falls back to the esm.sh CDN, which our CSP blocks.
// Ship the fonts with the app instead — copied out of the installed package
// so they always match the bundled version. ~14MB on disk, loaded lazily by
// the browser per font family, and excluded from the SW precache (the
// injectManifest globPatterns don't match woff2).
function excalidrawAssets() {
  return {
    name: 'excalidraw-assets',
    closeBundle() {
      const src = new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url)
      const dest = new URL('./dist/excalidraw/fonts', import.meta.url)
      cpSync(src, dest, { recursive: true })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { proxy: devProxy },
  plugins: [
    react(),
    excalidrawAssets(),
    // Tailwind v4 runs as a Vite plugin, not a PostCSS pass — there is no
    // tailwind.config.js. Design tokens are declared in CSS under
    // src/theme/css/, which is what makes them swappable at runtime.
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
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
        // Launcher shortcuts (long-press the installed icon / right-click the
        // taskbar pin): the standalone Notes app plus the quick-add flows.
        shortcuts: [
          {
            name: 'Notes',
            short_name: 'Notes',
            description: 'Open the Notes app',
            url: '/apps/notes',
            icons: [{ src: '/images/logo_128x128.png', sizes: '128x128', type: 'image/png' }],
          },
          {
            name: 'Add Note',
            short_name: 'Add Note',
            description: 'Jot a note, then link it where it belongs',
            url: '/apps/add/note',
            icons: [{ src: '/images/logo_128x128.png', sizes: '128x128', type: 'image/png' }],
          },
          {
            name: 'Add Todo',
            short_name: 'Add Todo',
            description: 'Capture a todo, due today by default',
            url: '/apps/add/todo',
            icons: [{ src: '/images/logo_128x128.png', sizes: '128x128', type: 'image/png' }],
          },
          {
            name: 'Add Photo',
            short_name: 'Add Photo',
            description: 'Snap or pick a photo, then link it where it belongs',
            url: '/apps/add/photo',
            icons: [{ src: '/images/logo_128x128.png', sizes: '128x128', type: 'image/png' }],
          },
        ],
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

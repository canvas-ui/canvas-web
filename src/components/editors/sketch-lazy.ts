import { lazy } from 'react'

// Excalidraw lazy-loads fonts at runtime; without an asset path it reaches
// for the esm.sh CDN. The fonts ship with the app (vite.config.ts
// excalidrawAssets → /excalidraw/fonts/). The global MUST be set in a module
// that lazy-IMPORTS the editor chunk, never inside it — import hoisting runs
// Excalidraw's font registration before any statement of the importing module.
declare global { interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] } }
window.EXCALIDRAW_ASSET_PATH = '/excalidraw/'

// One shared lazy instance: the applet grid and the document modal both mount
// the same full-viewport editor, and the ~1MB Excalidraw chunk loads once.
export const LazySketchEditor = lazy(() => import('@/components/toolbox/applets/SketchEditor'))

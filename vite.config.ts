import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the built app also works inside Tauri/Electron/Capacitor (file://)
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-64.png'],
      manifest: {
        name: 'Morning Meeting Dashboard',
        short_name: 'Morning Meeting',
        description: 'Upload the production report and review machine performance for the shift.',
        theme_color: '#4f46e5',
        background_color: '#eef1f8',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,xlsx,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Push handling is layered on top of the generated Workbox worker rather than
        // replacing it (injectManifest), so the existing offline caching is untouched.
        importScripts: ['push-sw.js'],
        // A new build's service worker takes control immediately on the next reload
        // (no second refresh needed) and old caches are purged — so updates always show.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5180,
    open: true,
  },
})

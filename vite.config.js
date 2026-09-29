import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: 'auto',
      manifest: {
        name: 'AgroCI+',
        short_name: 'AgroCI+',
        description: 'Le compagnon numérique des planteurs de cacao et de café.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#1B4332',
        background_color: '#F6F4F0',
        lang: 'fr',
        icons: [
          {
            src: '/assets/logo-light.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any maskable',
            media: '(prefers-color-scheme: light)'
          },
          {
            src: '/assets/logo-dark.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any maskable',
            media: '(prefers-color-scheme: dark)'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true
      }
    })
  ]
})
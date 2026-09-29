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
            src: '/assets/logo-dark-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/assets/logo-dark.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/assets/logo-dark-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/assets/logo-monochrome.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'monochrome'
          }
        ]
      },
      // ATTENTION : en stratégie `injectManifest`, le plugin ne lit PAS
      // `workbox` pour construire le precache — il lit `injectManifest`.
      // C'est pour ça que des globPatterns placés dans `workbox` étaient
      // silencieusement ignorés (9 entrées, 0 logo clair).
      // Les icônes du manifest sont déjà couvertes par globPatterns :
      // les laisser ajouterait une seconde fois les mêmes entrées
      // (via additionalManifestEntries), soit 5 doublons au precache.
      includeManifestIcons: false,
      injectManifest: {
        // Précache explicite de TOUS les assets. Le défaut workbox-build
        // ne retient que js/css/html + les icônes listées dans le manifest :
        // les logos CLAIRS en sont absents alors qu'ils sont référencés par
        // index.html (favicon media query) et par PricesScreen. En mode
        // clair, hors-ligne, l'app perdait donc son logo.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        // Les sources de logo ne sont pas des assets runtime. Le manifest
        // est exclu du glob car le plugin l'ajoute avec un revision haché,
        // ce qui garantit sa mise à jour à chaque changement de contenu.
        globIgnores: ['**/node_modules/**/*', 'assets/logos-source/**', 'manifest.webmanifest'],
        // Les PNG 512 masqués pèsent ~180 Ko : marge par défaut relevée.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/assets\/.*\.[a-z0-9]{2,5}$/],
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ]
})
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
        /* Identité de l'application installée. Sans `id`, le navigateur
           déduit l'identité de `start_url` : un simple ajustement de
           `start_url` ferait de l'application mise à jour une application
           différente (nouvelle icône dans le tiroir, app installée
           « perdue »). Laissé fixe, il verrouille l'identité. */
        id: '/',
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
      // `workbox` pour construire le précache — il ne lit QUE
      // `injectManifest`. C'est pour ça que des globPatterns placés dans
      // `workbox` étaient silencieusement ignorés (9 entrées, 0 logo clair).
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
      }
      /* PAS DE BLOC `workbox` ICI, et c'est volontaire.
         En stratégie `injectManifest`, workbox-build appelle `injectManifest()`,
         qui n'honore ni `navigateFallback`, ni `navigateFallbackDenylist`, ni
         `cleanupOutdatedCaches`, ni `clientsClaim`/`skipWaiting` : ces options
         n'ont d'effet qu'avec la stratégie `generateSW`. Les écrire ici
         donnerait l'illusion d'un réglage appliqué — c'est exactement le piège
         qui a produit la liste d'exclusion absente de src/sw.js (les liens de
         photo de diagnostic ouvraient l'accueil au lieu de l'image).
         Les équivalents sont dans le code, où ils s'exécutent vraiment :
           - skipWaiting() / clientsClaim()      → src/sw.js
           - navigation de repli + liste d'exclusion → src/sw.js (NavigationRoute)
           - cleanupOutdatedCaches()             → src/sw.js */
    })
  ],

  /* Découpe des bibliothèques. Le Service Worker précache tout, donc l'intérêt
     n'est pas le cache HTTP mais le poids re-téléchargé à chaque déploiement :
     une correction dans `src/` ne redownload plus React, le routeur ni le
     moteur d'animation, seulement le chunk applicatif. */
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          db: ['dexie']
        }
      }
    }
  }
})
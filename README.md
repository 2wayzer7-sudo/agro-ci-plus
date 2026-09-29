# AgroCI+

AgroCI+ is an offline-first Progressive Web App for cocoa and coffee farmers in Côte d'Ivoire.

## Stack

- React 18
- Vite 5
- vite-plugin-pwa / Workbox
- Dexie.js 4 / IndexedDB
- React Router v6
- Framer Motion

## Run locally

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

All application data is stored locally in IndexedDB. No backend or API key is required for the MVP.
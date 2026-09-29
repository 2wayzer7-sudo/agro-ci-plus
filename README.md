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

## Portability

This project is fully self-hosted and has no dependency on any particular
hosting provider. It runs identically on Replit, Render, GitHub Pages, a
container, a NAS, or a plain laptop.

In particular:

- Dependencies resolve from the public `https://registry.npmjs.org` registry.
  The lockfile contains no private mirror URLs.
- No `.replit` or `.replitignore` file is required, and none is committed.
- No environment variable is injected at build time. The build needs no secrets
  and no provider-specific variables such as `REPL_ID` or `REPL_SLUG`.
- `vite.config.js` contains no provider-specific plugins.
- Deploying the `dist/` directory to any static host is sufficient.

### Requirements

Node.js 20 or newer, and npm 10 or newer.

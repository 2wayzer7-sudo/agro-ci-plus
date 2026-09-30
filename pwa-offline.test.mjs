/* ============================================================
   PWA — invariants de service hors-ligne et de performance
   ============================================================
   Un Service Worker et un `vite.config.js` ne s'exécutent pas dans
   Node : on vérifie donc le SOURCE, et chaque assertion porte sur un
   bug RÉEL constaté dans ce dépôt, pas sur une préférence de style.

   Ces tests ont une valeur double : ils empêchent qu'un futur
   « correctif » remette en place exactement le réglage que
   workbox-build ignore silencieusement en stratégie `injectManifest`.
   ============================================================ */

import { readFileSync } from 'node:fs'

const results = []

function check(label, ok, detail = '') {
  results.push(Boolean(ok))
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(56)} -> ${ok ? 'ok' : 'NON'}${ok || !detail ? '' : `   ${detail}`}`)
}

const read = (path) => readFileSync(path, 'utf8')

const sw = read('src/sw.js')
const viteConfig = read('vite.config.js')
const indexHtml = read('index.html')
const mainJsx = read('src/main.jsx')
const sync = read('src/sync.js')
const useDiagnostics = read('src/hooks/useDiagnostics.js')
const useOnlineStatus = read('src/hooks/useOnlineStatus.js')
const pricesScreen = read('src/screens/PricesScreen.jsx')

/* ---------- 1. Le repli de navigation ne doit pas avaler l'API ----------
   Bug : `workbox.navigateFallbackDenylist` était écrit dans vite.config.js,
   clé que workbox-build n'honore PAS en stratégie `injectManifest`. La
   NavigationRoute écrite à la main servait donc index.html pour TOUTE
   navigation, y compris /api/diagnostic-photo?key=… : un lien de photo
   ouvert depuis Slack affichait l'accueil de l'app au lieu de la photo.

   Les assertions visent des formes OPTIONNELLES (`clé:` / `appel(`) et non
   des mots : un commentaire qui cite l'option ne doit pas les faire passer. */
{
  const routeLine = sw.split('\n').find((line) => line.includes('new NavigationRoute(')) ?? ''
  const denylistLine = sw.split('\n').find((line) => line.includes('NAVIGATION_DENYLIST =')) ?? ''

  check('sw : la NavigationRoute porte une liste d’exclusion', routeLine.includes('denylist'), routeLine.trim())
  check('sw : /api/ est exclu du repli de navigation', denylistLine.includes('api'), denylistLine.trim())
  check('sw : /assets/ est exclu du repli de navigation', denylistLine.includes('assets'), denylistLine.trim())
  /* Les deux options dont le config ne s'occupe plus doivent être ici. */
  check('sw : cleanupOutdatedCaches() est appelé', /cleanupOutdatedCaches\(\)/.test(sw))
  check('sw : skipWaiting() est appelé', /self\.skipWaiting\(\)/.test(sw))
  check('sw : clientsClaim() est appelé', /clientsClaim\(\)/.test(sw))
  check('sw : le précache reçoit bien le manifeste', /precacheAndRoute\(self\.__WB_MANIFEST\)/.test(sw))
}

/* ---------- 2. Plus d'options mortes dans vite.config.js ----------
   En `injectManifest`, tout le bloc `workbox` est ignoré : y écrire
   donne l'illusion d'un réglage appliqué. */
{
  check('vite : plus de bloc `workbox` (ignoré en injectManifest)', !/[,{]\s*workbox\s*:/.test(viteConfig))
  check('vite : plus de navigateFallbackDenylist dans la config', !/navigateFallbackDenylist\s*:/.test(viteConfig))
  check('vite : le commentaire explique pourquoi', /injectManifest/.test(viteConfig))
}

/* ---------- 3. Le précache doit rester complet ----------
   Régression déjà payé une fois : des globPatterns placés dans `workbox`
   étaient ignorés, le précache ne contenait que 9 entrées et aucun logo
   clair — le logo disparaissait en mode clair hors-ligne. */
{
  check('vite : globPatterns couvre js/css/html/png', viteConfig.includes("globPatterns: ['**/*.{js,css,html,png,svg,ico}']"))
  check('vite : les sources de logo sont exclues', /globIgnores:\s*\[[^\]]*logos-source/.test(viteConfig))
  check('vite : la marge de taille est relevée', /maximumFileSizeToCacheInBytes:\s*4\s*\*\s*1024/.test(viteConfig))
  /* Identité de l'app installée. */
  check('vite : le manifest déclare un `id`', /\bid:\s*'\/'/.test(viteConfig))
}

/* ---------- 4. Poids des images sur le chemin critique ----------
   Les favicons pointaient sur les PNG 512 (233 Ko + 252 Ko) pour dessiner
   un onglet de 16 à 32 px, et le logo d'écran (42×42 CSS px) sur la même
   image 512. Les variantes 192 px restent 4 à 12 fois surdimensionnées. */
{
  const iconLinks = indexHtml.split('\n').filter((line) => line.includes('rel="icon"'))
  check('html : deux favicons déclarés', iconLinks.length === 2, `${iconLinks.length} trouvé(s)`)
  check('html : aucun favicon en 512 px', !iconLinks.some((line) => /logo-(light|dark)\.png/.test(line)))
  check('html : favicons en variante 192 px', iconLinks.every((line) => line.includes('-192.png')))
  check('html : apple-touch-icon déclaré pour iOS', indexHtml.includes('rel="apple-touch-icon"'))
  check('écran prix : logo en variante 192 px', /logo-dark-192\.png/.test(pricesScreen) && /logo-light-192\.png/.test(pricesScreen))
  check('écran prix : dimensions intrinsèques déclarées', /<img[^>]*width="192"[^>]*height="192"/.test(pricesScreen))
  /* Les 512 px restent utilisés par le manifest : rien n'est supprimé. */
  check('vite : le manifest garde son icône 512 px', /logo-dark\.png/.test(viteConfig))
}

/* ---------- 5. Envoi des diagnostics : pas de double transmission ----------
   Bug : `useDiagnostics` est instancié deux fois (App.jsx pour le compteur,
   DiagnosticScreen pour la liste) et chacune déclenchait son flush. Les
   deux parcouraient la même file `pending` → le planteur recevait deux fois
   la même photo. Le verrou en ref de `sendNow` ne couvrait qu'une instance. */
{
  check('sync : verrou de flush au niveau module', /let flushPromise\s*=\s*null/.test(sync))
  check('sync : le verrou protège le point d’entrée public', /export function sendDiagnostics\(\)[\s\S]{0,200}if \(!flushPromise\)/.test(sync))
  check('sync : le verrou est relâché après coup', /flushPromise\s*=\s*null/.test(sync))
  /* recoverInterruptedSends ne doit pas écraser un envoi réellement en cours. */
  check('sync : envois en cours mémorisés', /const inFlight = new Set\(\)/.test(sync))
  /* Sans cet `add`, le Set resterait vide et `recover` écraserait de nouveau
     les envois en cours : l'assertion précédente ne le verrait pas. */
  check('sync : l’item est marqué pendant l’envoi', /inFlight\.add\(item\.id\)/.test(sync))
  check('sync : recover ignore les envois en cours', /interrupted\s*=\s*stuck\.filter\(\(item\)\s*=>\s*!inFlight\.has\(item\.id\)\)/.test(sync))
  check('sync : inFlight est libéré en finally', /finally\s*\{[\s\S]{0,600}inFlight\.delete\(item\.id\)/.test(sync))
  check('sync : une photo arrivée pendant le flush est reprise', /flushLateArrivals/.test(sync))
}

/* ---------- 6. Relectures de la table regroupées ----------
   `Dexie.on('storagemutated')` se déclenche sur chaque écriture, donc deux
   fois par photo pendant un flush, et chaque déclenchement relisait TOUTE la
   table — blobs compris. Regroupé : un état final identique, une lecture. */
{
  check('diagnostics : storagemutated passe par un minuteur', /Dexie\.on\('storagemutated',\s*scheduleReload\)/.test(useDiagnostics))
  check('diagnostics : relecture directe à chaque événement', !/const handleStorageChange = \(\) => loadDiagnostics\(\)/.test(useDiagnostics))
  check('diagnostics : le minuteur est annulé au démontage', /clearTimeout\(reloadTimer\.current\)/.test(useDiagnostics))
  check('diagnostics : pas de lecture concurrente', /loadingRef\.current/.test(useDiagnostics))
}

/* ---------- 7. Sondage réseau : seulement quand il sert ---------- */
{
  check('réseau : plus de setInterval', !/\bsetInterval\(/.test(useOnlineStatus))
  check('réseau : aucun sondage onglet caché', /visibilityState === 'hidden'\)\s*return/.test(useOnlineStatus))
  check('réseau : aucun sondage déjà hors ligne', /navigator\.onLine === false \|\| document\.visibilityState === 'hidden'/.test(useOnlineStatus))
  check('réseau : écouteur visibility retiré', /removeEventListener\('visibilitychange'/.test(useOnlineStatus))
  check('réseau : minuteur annulé au démontage', /if \(timer\) clearTimeout\(timer\)/.test(useOnlineStatus))
}

/* ---------- 8. Enregistrement du Service Worker ----------
   `registerType: 'autoUpdate'` recharge déjà la page sur `activated`
   (vite-plugin-pwa/dist/client/build/register.js). Ajouter un rechargement
   sur `controllerchange` ferait recharger deux fois. Verrou anti-réchute. */
{
  check('main : enregistrement conditionnel au contexte sécurisé', /isSecureContext/.test(mainJsx))
  check('main : pas de double rechargement sur controllerchange', !/controllerchange/.test(mainJsx))
}

console.log('')
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} verifications reussies`)
process.exit(passed === results.length ? 0 : 1)

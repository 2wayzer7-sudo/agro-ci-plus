import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { createHandlerBoundToURL } from 'workbox-precaching'

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

self.addEventListener('sync', (event) => {
  if (event.tag !== 'sync-diagnostics') return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'SYNC_DIAGNOSTICS' }))
    })
  )
})

/* ---------- Notifications : push distant et messages de la page ----------
   Point de sortie UNIQUE pour l'affichage : `push` (serveur) et
   `SHOW_PRICE_NOTIFICATION` (page) convergent vers la même fonction, donc
   le rendu d'une alerte est identique qu'elle vienne du réseau ou du
   planteur en changeant de marché.

   Les deux icônes sont déjà couvertes par le precache (motifs glob PNG
   de vite.config.js) : une notification hors-ligne ne doit pas dépendre
   du réseau pour son icône.
   -------------------------------------------------------------------- */

const APP_NAME = 'AgroCI+'
const NOTIFICATION_ICON = '/assets/logo-dark-192.png'
const NOTIFICATION_BADGE = '/assets/logo-monochrome.png'

function buildNotificationOptions(payload) {
  return {
    body: payload.body ?? '',
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    tag: payload.tag ?? 'agroci-prix',
    /* renotify n'est ignoré que si `tag` est présent : sans tag, Chrome
       ignore silencieusement l'option. */
    renotify: Boolean(payload.tag),
    lang: 'fr',
    dir: 'ltr',
    data: { url: payload.url ?? '/', marketId: payload.marketId ?? null },
    vibrate: [120, 60, 120],
    requireInteraction: false
  }
}

function showPriceNotification(payload) {
  const title = payload.title ?? `${APP_NAME} — variation des prix`
  return self.registration.showNotification(title, buildNotificationOptions(payload))
}

/* Alerte locale déclenchée par la page (changement de marché). */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SHOW_PRICE_NOTIFICATION') return
  const payload = event.data.payload ?? {}
  /* waitUntil garde le Service Worker vivant jusqu'à ce que la
     notification soit réellement remise à l'OS. */
  event.waitUntil(showPriceNotification(payload))
})

/* Push distant. Inactif tant qu'aucun abonnement n'est enregistré (il n'y
   pas encore de serveur VAPID) : le handler est en place pour le jour où
   le backend existera, sans changement de code côté page. */
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    /* payload non JSON : on retombe sur le texte brut plutôt que de
       laisser remonter l'exception et de perdre l'alerte. */
    payload = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(showPriceNotification(payload))
})

/* Clic sur l'alerte : on réactive la fenêtre ouverte si l'app tourne déjà
   (l'utilisateur garde son onglet prix), sinon on ouvre l'app. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url ?? '/', self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => clientList.find((client) => new URL(client.url).origin === self.location.origin))
      .then((existingClient) => {
        if (!existingClient) return self.clients.openWindow(targetUrl)
        if ('navigate' in existingClient) return existingClient.navigate(targetUrl).then((navigated) => navigated ?? existingClient)
        return existingClient.focus()
      })
      .catch(() => self.clients.openWindow(targetUrl))
  )
})

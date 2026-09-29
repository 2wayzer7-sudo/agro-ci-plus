import { useCallback, useState } from 'react'
import { getMarket } from '../data/prices'

/* Alertes prix PWA.
 *
 * La permission n'est JAMAIS demandée au chargement : sur mobile, une
 * invite de permission non justifiée par un geste est ignorée par le
 * navigateur et dégrade la rétention. Tout passe par le bouton.
 *
 * Deux canaux d'affichage, dans cet ordre :
 *   1. le Service Worker, via postMessage → registration.showNotification()
 *      (c'est exactement le chemin d'un vrai push, un seul point de sortie) ;
 *   2. new Notification() si aucun Service Worker ne contrôle la page
 *      (développement, contexte non sécurisé, SW pas encore activé).
 *
 * `navigator.serviceWorker.controller` est utilisé plutôt que
 * `navigator.serviceWorker.ready` : ce dernier reste en attente
 * indéfiniment quand aucun SW n'est enregistré, ce qui bloquerait la
 * notification sans jamais lever.
 */

const ENABLED_KEY = 'agroci:notifications'
const FALLBACK_ICON = '/assets/logo-dark-192.png'
const APP_NAME = 'AgroCI+'

function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

function readPermission() {
  if (!notificationsSupported()) return 'unsupported'
  try {
    return Notification.permission
  } catch {
    return 'unsupported'
  }
}

function readEnabled() {
  try {
    return window.localStorage.getItem(ENABLED_KEY) === 'true'
  } catch {
    return false
  }
}

function writeEnabled(value) {
  try {
    window.localStorage.setItem(ENABLED_KEY, String(value))
  } catch {
    /* stockage indisponible : la bascule reste valable pour la session */
  }
}

/* `requestPermission` renvoie une promesse sur les navigateurs modernes
   et `undefined` sur quelques plateformes anciennes : on relit
   `Notification.permission` dans ce cas plutôt que de croire `undefined`. */
async function askPermission() {
  let result
  try {
    result = Notification.requestPermission()
  } catch {
    return readPermission()
  }
  return typeof result?.then === 'function' ? await result : readPermission()
}

function cocoaPriceOf(market) {
  const cocoa = market.prices.find((price) => price.id === 'cocoa')
  return cocoa ? `${cocoa.price} ${cocoa.unit}` : 'prix indisponible'
}

export function useNotifications() {
  const [permission, setPermission] = useState(readPermission)
  const [enabled, setEnabled] = useState(readEnabled)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  const showNotification = useCallback(async ({ title, body, tag }) => {
    if (!notificationsSupported() || Notification.permission !== 'granted') return false

    try {
      const controller = navigator.serviceWorker?.controller
      if (controller) {
        controller.postMessage({
          type: 'SHOW_PRICE_NOTIFICATION',
          payload: { title, body, tag }
        })
        return true
      }
    } catch {
      /* canal SW indisponible : repli ci-dessous */
    }

    try {
      new Notification(title, { body, icon: FALLBACK_ICON, lang: 'fr', tag })
      return true
    } catch {
      return false
    }
  }, [])

  /* Construit l'alerte à partir des deux marchés concernés : le message
     parle au planteur (« vous suivez Daloa, vous voyez San-Pédro »)
     plutôt que d'exposer des identifiants techniques. */
  const notifyMarketChange = useCallback(async (fromId, toId) => {
    if (!enabled) return false
    const from = getMarket(fromId)
    const to = getMarket(toId)
    return showNotification({
      title: `${to.name} — prix du jour`,
      body: `Vous suivez maintenant ${to.name} au lieu de ${from.name}. Cacao : ${cocoaPriceOf(to)}.`,
      tag: `agroci-market-${to.id}`
    })
  }, [enabled, showNotification])

  /* Notification de démonstration : sans elle le planteur ne peut pas
     vérifier que l'autorisation a bien été prise en compte. */
  const notifyTest = useCallback(async (marketId) => {
    const market = getMarket(marketId)
    return showNotification({
      title: `${APP_NAME} — alertes activées`,
      body: `Vous recevrez ici les variations de prix de ${market.name}. Cacao : ${cocoaPriceOf(market)}.`,
      tag: 'agroci-alertes-test'
    })
  }, [showNotification])

  const requestNotifications = useCallback(async () => {
    if (!notificationsSupported()) {
      setStatus('unsupported')
      setMessage('Alertes non prises en charge par ce navigateur.')
      return false
    }

    setStatus('pending')
    const nextPermission = readPermission() === 'granted' ? 'granted' : await askPermission()
    setPermission(nextPermission)

    if (nextPermission !== 'granted') {
      setStatus('denied')
      setMessage(
        nextPermission === 'denied'
          ? 'Alertes bloquées : autorisez-les dans les réglages du navigateur.'
          : 'Alertes non accordées : activez-les depuis les réglages du site.'
      )
      return false
    }

    writeEnabled(true)
    setEnabled(true)
    setStatus('active')
    return true
  }, [])

  const toggleNotifications = useCallback(async (marketId) => {
    if (enabled) {
      writeEnabled(false)
      setEnabled(false)
      setStatus('inactive')
      setMessage('Alertes prix désactivées.')
      return
    }

    const granted = await requestNotifications()
    if (!granted) return

    const sent = await notifyTest(marketId)
    setStatus('active')
    setMessage(sent ? 'Alertes prix activées : notification de test envoyée.' : 'Alertes prix activées.')
  }, [enabled, requestNotifications, notifyTest])

  return {
    supported: notificationsSupported(),
    permission,
    enabled,
    status,
    message,
    toggleNotifications,
    notifyMarketChange
  }
}

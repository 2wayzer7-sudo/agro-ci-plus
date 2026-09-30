import { useEffect, useState } from 'react'

const PROBE_URL = 'https://www.gstatic.com/generate_204'
const PROBE_TIMEOUT = 5000
const POLL_INTERVAL = 30000

async function probeNetwork() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT)
  try {
    await fetch(PROBE_URL, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false)

  useEffect(() => {
    let active = true
    let timer = null

    const apply = (value) => {
      if (active) setIsOnline(value)
    }
    const refresh = async () => apply(await probeNetwork())
    const handleOnline = () => refresh()
    const handleOffline = () => apply(false)

    /* Le sondage était un setInterval fixe : une requête réseau toutes les
       30 s, POUR TOUJOURS — y compris onglet en arrière-plan, y compris
       déjà hors ligne (donc réponse à coup sûr négative, payée en data).
       Il est piloté par un minuteur réarmé après chaque passage, ce qui
       permet de ne sonder que lorsque la question a du sens :
         - réseau annoncé présent (l'événement `online` relance sinon) ;
         - onglet visible (inutile de tester une page que personne ne
           regarde, et le navigateur bride déjà ces timers en arrière-plan). */
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        timer = null
        if (navigator.onLine === false || document.visibilityState === 'hidden') return
        await refresh()
        schedule()
      }, POLL_INTERVAL)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        /* Retour au premier plan : l'état a pu changer sans événement
           (passage en mode avion sur un appareil qui n'a pas émis
           `offline`). */
        if (navigator.onLine === false) apply(false)
        else refresh()
        schedule()
      } else {
        schedule()
      }
    }

    refresh()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)
    schedule()

    return () => {
      active = false
      if (timer) clearTimeout(timer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return isOnline
}

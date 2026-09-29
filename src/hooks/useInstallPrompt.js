import { useCallback, useEffect, useState } from 'react'

/* Verrouillage d'affichage de la bannière d'installation.
 *
 * Trois clés dans localStorage, toutes écrites en lecture-défensive :
 * un navigateur en navigation privée peut refuser l'accès et l'app doit
 * rester utilisable dans ce cas.
 *
 *  pwa_installed         posé sur l'événement natif `appinstalled`, et
 *                        quand le planteur accepte l'invite. Verrou
 *                        définitif.
 *  pwa_prompt_dismissed  posé quand le planteur refuse, que ce soit via
 *                        « Plus tard » ou en fermant l'invite native.
 *                        Verrou définitif également : la consigne est que
 *                        la bannière ne revienne jamais une fois refusée.
 *  pwa_prompt_dismiss_ts horodatage du refus, pour savoir quand la
 *                        dernière tentative a eu lieu (diagnostic, debug).
 *
 * Le verrou est localStorage et non useState : un état React est perdu au
 * rechargement, la bannière réapparaîtrait à la visite suivante, ce qui
 * est précisément ce que le planteur vient de refuser.
 */

const INSTALLED_KEY = 'pwa_installed'
const DISMISSED_KEY = 'pwa_prompt_dismissed'
const DISMISS_TS_KEY = 'pwa_prompt_dismiss_ts'
const TEST_FLAG = 'test-install'

function readFlag(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeFlag(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* stockage indisponible : la bannière reste utilisable en mémoire */
  }
}

function clearFlag(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* rien à faire */
  }
}

/* Mode d'affichage natif. Seul `browser` autorise la bannière : installée
   en standalone, minimal-ui, fullscreen ou window-controls-overlay, le
   planteur n'a plus besoin de l'invite. */
function getDisplayMode() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'browser'
  const modes = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay']
  for (const mode of modes) {
    if (window.matchMedia(`(display-mode: ${mode})`).matches) return mode
  }
  return 'browser'
}

function isInstalledMode() {
  if (getDisplayMode() !== 'browser') return true
  return readFlag(INSTALLED_KEY) === 'true'
}

function isDismissed() {
  return readFlag(DISMISSED_KEY) === 'true'
}

function isTestMode() {
  try {
    return new URLSearchParams(window.location.search).get(TEST_FLAG) === 'true'
  } catch {
    return false
  }
}

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null)
  /* Verrou d'affichage figé au montage : 'checking' puis 'open',
     'installed' ou 'dismissed'. */
  const [locked, setLocked] = useState('checking')
  const [testMode, setTestMode] = useState(false)

  useEffect(() => {
    const testing = isTestMode()
    setTestMode(testing)

    if (isInstalledMode()) {
      setLocked('installed')
      return
    }
    if (isDismissed()) {
      setLocked('dismissed')
      return
    }
    setLocked('open')

    const handleBeforeInstallPrompt = (event) => {
      /* preventDefault est obligatoire : sans lui, Chrome affiche sa
         propre bulle, consomme l'événement, et la bannière maison
         n'apparaît jamais — ou alors trop tard pour être pilotée. */
      event.preventDefault()
      setPromptEvent(event)
    }

    /* Verrou définitif : l'app est installée, la bannière disparaît pour
       de bon, y compris après un rechargement complet. */
    const handleInstalled = () => {
      writeFlag(INSTALLED_KEY, 'true')
      clearFlag(DISMISSED_KEY)
      clearFlag(DISMISS_TS_KEY)
      setPromptEvent(null)
      setLocked('installed')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const persistRefusal = useCallback(() => {
    writeFlag(DISMISSED_KEY, 'true')
    writeFlag(DISMISS_TS_KEY, String(Date.now()))
  }, [])

  const install = useCallback(async () => {
    /* En mode test, aucun événement natif n'existe : on se contente de
       fermer la bannière sans écrire dans localStorage, pour ne pas
       polluer l'état réel du planteur. */
    if (testMode) {
      setPromptEvent(null)
      return
    }
    if (!promptEvent) return
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      if (choice?.outcome === 'accepted') {
        writeFlag(INSTALLED_KEY, 'true')
        setLocked('installed')
      } else {
        /* L'utilisateur a fermé l'invite native : traité comme un refus
           pour ne pas le relancer dans la foulée. */
        persistRefusal()
        setLocked('dismissed')
      }
    } catch {
      /* prompt() peut rejeter si l'invite a déjà été consommée */
    } finally {
      setPromptEvent(null)
    }
  }, [promptEvent, testMode, persistRefusal])

  const dismiss = useCallback(() => {
    if (!testMode) persistRefusal()
    setPromptEvent(null)
    setLocked('dismissed')
  }, [testMode, persistRefusal])

  /* En mode test (?test-install=true) la bannière est forcée visible pour
     valider le rendu, sans court-circuiter la logique de production. */
  const canInstall = testMode ? true : locked === 'open' && promptEvent !== null

  return { canInstall, install, dismiss, testMode, locked }
}

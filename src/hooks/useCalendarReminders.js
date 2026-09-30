import { useCallback, useEffect, useMemo, useState } from 'react'
import { SEASON_TIPS } from '../data/season'

/* Rappels agronomiques locaux.
 *
 * Contrainte honnête : sans serveur push ni Periodic Sync, un navigateur
 * ne SAIT PAS réveiller une page fermée. Ce module ne vend donc pas une
 * programmation en arrière-plan qui n'existe pas — il fait deux choses
 * vraies :
 *   1. il demande l'autorisation et prouve immédiatement le canal par une
 *      notification de confirmation ;
 *   2. il rattrape, à chaque ouverture, les conseils dont la date de
 *      rappel est dépassée et qui n'ont jamais été servis.
 * Un stockage indisponible (navigation privée) laisse le module
 * utilisable pour la seule session courante.
 *
 * L'affichage passe par l'UNIQUE point de sortie du Service Worker
 * (`SHOW_PRICE_NOTIFICATION`, cf. sw.js) : un rendu identique à celui des
 * alertes prix, même icône, même gestionnaire de clic. */

const ENABLED_KEY = 'agroci:calendar-reminders'
const SERVED_KEY = 'agroci:calendar-reminders-served'
const FALLBACK_ICON = '/assets/logo-dark-192.png'

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

/* Lecture/écriture tolérantes : un stockage refusé (navigation privée,
   quota épuisé) ne doit jamais faire planter l'écran. */
function readStored(storageKey, fallback) {
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeStored(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    /* stockage indisponible : le rappel vaut pour la session en cours */
  }
}

/* Échéance exprimée en timestamp local minuit : la comparaison ignore le
   fuseau et l'heure d'été. */
function reminderDueDate(reminder, year) {
  return new Date(year, reminder.month - 1, reminder.day)
}

function dueStamp(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/* Un conseil est dû lorsque sa date de rappel est dépassée et qu'il n'a
   pas déjà été servi POUR CETTE ÉCHEANCE : l'identifiant seul suffirait
   si les échéances ne changeaient pas d'une campagne à l'autre. */
function collectDueReminders(now, served) {
  return SEASON_TIPS.filter((tip) => {
    if (!tip.reminder) return false
    const deadline = reminderDueDate(tip.reminder, now.getFullYear())
    if (deadline.getTime() > now.getTime()) return false
    return served[tip.id] !== dueStamp(deadline)
  })
}

async function askPermission() {
  let result
  try {
    result = Notification.requestPermission()
  } catch {
    return readPermission()
  }
  return typeof result?.then === 'function' ? await result : readPermission()
}

/* Même ordre de tentative que useNotifications : Service Worker d'abord,
   `new Notification` en repli quand aucun SW ne contrôle la page. */
function display(title, body, tag) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false

  try {
    const controller = navigator.serviceWorker?.controller
    if (controller) {
      controller.postMessage({ type: 'SHOW_PRICE_NOTIFICATION', payload: { title, body, tag } })
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
}

export function useCalendarReminders() {
  const supported = notificationsSupported()
  const [permission, setPermission] = useState(readPermission)
  const [enabled, setEnabled] = useState(() => readStored(ENABLED_KEY, false) === true)
  const [status, setStatus] = useState('idle')
  /* Identifiant du conseil -> échéance déjà servie. */
  const [served, setServed] = useState(() => readStored(SERVED_KEY, {}))

  const dueTips = useMemo(() => collectDueReminders(new Date(), served), [served])

  /* Rattrapage : la fenêtre d'un conseil est souvent déjà refermée, et un
     utilisateur qui active les rappels en septembre ne doit pas recevoir
     sept notifications d'un coup. On sert donc le plus RÉCENT — le seul
     encore d'actualité — et on marque TOUT comme servi : un rattrapage
     sert l'information du moment, pas l'archivage de la campagne. La
     boucle est mise à jour même si l'affichage échoue, pour ne pas
     boucler à chaque ouverture. */
  useEffect(() => {
    if (!enabled || !supported || readPermission() !== 'granted') return
    if (dueTips.length === 0) return

    const now = new Date()
    const year = now.getFullYear()
    const freshest = dueTips
      .map((tip) => ({ tip, deadline: reminderDueDate(tip.reminder, year) }))
      .sort((a, b) => b.deadline - a.deadline)[0]

    display(freshest.tip.reminder.title, freshest.tip.reminder.body, `agroci-calendrier-${freshest.tip.id}`)

    const next = { ...served }
    dueTips.forEach((tip) => {
      next[tip.id] = dueStamp(reminderDueDate(tip.reminder, year))
    })
    writeStored(SERVED_KEY, next)
    setServed(next)
  }, [dueTips, enabled, served, supported])

  const activate = useCallback(async () => {
    if (!supported) {
      setStatus('unsupported')
      return false
    }

    setStatus('pending')
    const nextPermission = readPermission() === 'granted' ? 'granted' : await askPermission()
    setPermission(nextPermission)

    if (nextPermission !== 'granted') {
      setStatus(nextPermission === 'denied' ? 'denied' : 'inactive')
      return false
    }

    writeStored(ENABLED_KEY, true)
    setEnabled(true)
    setStatus('active')

    /* Preuve du canal : sans notification immédiate, l'utilisateur ne peut
       pas vérifier que l'autorisation a bien été prise en compte. */
    display(
      'AgroCI+ — rappels activés',
      'Cycles cacao et café suivis à chaque ouverture de l’application.',
      'agroci-calendrier-actif'
    )
    return true
  }, [supported])

  /* Activation silencieuse, à appeler quand une AUTRE autorisation de
     notification vient d'être accordée (le bouton d'alertes prix de
     l'écran principal) : pas de seconde notification de confirmation, ce
     serait un doublon. Sans effet tant que l'autorisation n'est pas
     accordée — activer avant produirait un état « actif » sans rien
     afficher. */
  const enable = useCallback(() => {
    if (!supported || readPermission() !== 'granted') return false
    writeStored(ENABLED_KEY, true)
    setEnabled(true)
    return true
  }, [supported])

  return { supported, permission, enabled, status, dueCount: dueTips.length, activate, enable }
}

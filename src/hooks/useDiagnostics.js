import Dexie from 'dexie'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../db'
import { useOnlineStatus } from './useOnlineStatus'
import { recoverInterruptedSends, registerDiagnosticsSync, sendDiagnostics } from '../sync'
import { DIAGNOSTIC_STATUS, IA_UNAVAILABLE } from '../services/diagnosticService'

/* Garde-fou quota : on refuse d'écrire une photo si le navigateur ne peut
   plus garantir la sauvegarde, et on dégage l'espace en retirant les
   diagnostics DÉJÀ ENVOYÉS (jamais ceux en attente : ce sont eux qui
   portent la valeur pour le planteur). */

const MAX_IMAGE_BYTES = 900 * 1024
const HEADROOM_BYTES = 12 * 1024 * 1024
const MIN_FREE_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_EDGE = 1024
const JPEG_QUALITY = 0.7

/* Fenêtre de regroupement des relectures déclenchées par les écritures
   d'IndexedDB. Assez long pour absorber un flush complet, assez court pour
   que l'interface reste perçue comme immédiate. */
const STORAGE_RELOAD_DELAY = 300

const QUOTA_MESSAGES = {
  insufficient: 'Le stockage de cet appareil est plein. Envoyez vos diagnostics en attente puis réessayez.',
  evicted: 'Le stockage était plein : d’anciens diagnostics déjà envoyés ont été supprimés pour libérer de l’espace.',
  failed: 'La photo n’a pas pu être sauvegardée.',
  unreadable: 'Cette photo n’a pas pu être lue. Choisissez-en une autre.'
}

/* Messages d'envoi : distincts selon la cause, pour ne jamais annoncer
   une transmission qui n'a pas eu lieu. */
const DEFERRED_MESSAGE = 'Pas de connexion : l’envoi est programmé et partira automatiquement au retour du réseau.'
const UNEXPECTED_MESSAGE = 'L’envoi a été interrompu. Vos photos restent enregistrées en attente.'

function isQuotaError(error) {
  if (!error) return false
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  )
}

async function getStorageEstimate() {
  try {
    if (navigator.storage?.estimate) return await navigator.storage.estimate()
  } catch {
    /* API indisponible : on continue sans information de quota */
  }
  return null
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* refus navigateur : l'app reste fonctionnelle, sans garantie de persistence */
  }
}

async function freeSpace(requiredBytes) {
  const estimate = await getStorageEstimate()
  if (!estimate || typeof estimate.quota !== 'number') return true
  const free = estimate.quota - (estimate.usage || 0)
  return free >= Math.max(requiredBytes, MIN_FREE_BYTES)
}

async function evictOldestSent() {
  const sent = await db.diagnostics.where('status').equals('sent').sortBy('createdAt')
  const removed = []
  for (const item of sent) {
    await db.diagnostics.delete(item.id)
    removed.push(item)
    if (await freeSpace(HEADROOM_BYTES)) break
  }
  return removed.length
}

/* Redimensionne et recompresse si le blob est trop lourd ou n'est pas déjà
   un JPEG. L'écran de capture compresse déjà ; ce filet garantit qu'aucune
   image brute n'atteint IndexedDB (raw 4 Mo de photo = store saturé). */
function normalizeImage(image) {
  if (!image) return Promise.resolve(null)
  if (image.type === 'image/jpeg' && image.size <= MAX_IMAGE_BYTES) return Promise.resolve(image)

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(image)
    const element = new Image()
    element.onload = () => {
      const ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(element.width, element.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(element.width * ratio))
      canvas.height = Math.max(1, Math.round(element.height * ratio))
      const context = canvas.getContext('2d')
      context.drawImage(element, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl)
        blob ? resolve(blob) : reject(new Error('compression'))
      }, 'image/jpeg', JPEG_QUALITY)
    }
    element.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('image'))
    }
    element.src = objectUrl
  })
}

export function useDiagnostics() {
  const [diagnostics, setDiagnostics] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  /* Verrous en ref : ni l'un ni l'autre ne doit provoquer un rendu, et
     l'autre doit être lisible depuis un callback (flush réseau). */
  const sendingRef = useRef(false)
  /* Lectures et relectures de la table : voir `loadDiagnostics` et
     l'abonnement `storagemutated` plus bas. */
  const loadingRef = useRef(false)
  const reloadTimer = useRef(null)
  const isOnline = useOnlineStatus()
  const isOnlineRef = useRef(isOnline)
  isOnlineRef.current = isOnline

  const loadDiagnostics = useCallback(async () => {
    /* Une seule lecture à la fois : deux relectures qui se chevauchent
       s'écrivent dans l'ordre de leur FIN, pas de leur DÉBUT — un résultat
       ancien peut donc écraser un résultat plus récent. */
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const items = await db.diagnostics.orderBy('createdAt').reverse().toArray()
      setDiagnostics(items)
      setError('')
    } catch {
      setError('Les diagnostics ne peuvent pas être chargés. Réessayez.')
    } finally {
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    /* Session précédente interrompue au milieu d'un envoi : ces photos
       redeviennent envoyables, sinon l'écran afficherait « Traitement en
       cours » pour toujours. */
    recoverInterruptedSends().then(() => loadDiagnostics())
    loadDiagnostics()
    requestPersistentStorage()

    /* `storagemutated` se déclenche sur CHAQUE écriture de la table, y
       compris celles du flush en cours (2 écritures par photo). Chacune
       déclenchait une relecture complète — donc le rechargement de tous
       les blobs, plusieurs dizaines de Mo pour un carnet fourni — et un
       rendu de la liste à chaque fois. Sur un téléphone d'entrée de gamme,
       c'était le principal poste de lenteur de l'écran Diagnostic.
       Regroupé sur une courte fenêtre : le même état final, une seule
       lecture, un seul rendu. */
    const scheduleReload = () => {
      if (reloadTimer.current) return
      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null
        loadDiagnostics()
      }, STORAGE_RELOAD_DELAY)
    }

    Dexie.on('storagemutated', scheduleReload)
    return () => {
      Dexie.on('storagemutated').unsubscribe(scheduleReload)
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current)
        reloadTimer.current = null
      }
    }
  }, [loadDiagnostics])

  /* Synchronisation automatique : le passage hors ligne -> en ligne vide
     la file sans intervention du planteur, qui n'a rien demandé et
     souvent pas de réseau au moment de la photo. Le flush est aussi
     enregistré en Background Sync pour les cas où l'onglet est fermé. */
  useEffect(() => {
    if (!isOnline || sendingRef.current) return
    sendDiagnostics()
      .then((result) => {
        if (result.sent > 0) {
          setMessage(`Connexion rétablie : ${result.sent} diagnostic${result.sent > 1 ? 's' : ''} transmis.`)
        }
      })
      .catch(() => {
        /* le flush est réessayé au prochain passage en ligne */
      })
  }, [isOnline])

  const saveDiagnostic = useCallback(async ({ image, note, location, aiResult }) => {
    let stored = null
    try {
      stored = await normalizeImage(image)
    } catch {
      setError(QUOTA_MESSAGES.unreadable)
      return { success: false, error: QUOTA_MESSAGES.unreadable }
    }

    const payload = {
      image: stored,
      note: note.trim(),
      /* Localité et pré-diagnostic sont figés AU MOMENT de la capture : le
         planteur peut changer de ville ensuite, le diagnostic doit rester
         rattaché à ce qu'il a réellement photographié. */
      location: (location ?? '').trim(),
      aiResult: aiResult ?? IA_UNAVAILABLE,
      status: DIAGNOSTIC_STATUS.PENDING,
      createdAt: Date.now(),
      attempts: 0,
      lastError: ''
    }

    try {
      const needed = (stored?.size || 0) + HEADROOM_BYTES
      let evicted = 0

      if (!(await freeSpace(needed))) {
        evicted = await evictOldestSent()
        await loadDiagnostics()
        if (evicted > 0) setNotice(QUOTA_MESSAGES.evicted)
        if (!(await freeSpace(needed))) {
          setError(QUOTA_MESSAGES.insufficient)
          return { success: false, error: QUOTA_MESSAGES.insufficient, evicted }
        }
      }

      try {
        await db.diagnostics.add(payload)
      } catch (writeError) {
        if (!isQuotaError(writeError)) throw writeError
        /* Quota atteint entre la vérification et l'écriture : on purge
           puis on réessaie une seule fois. */
        await evictOldestSent()
        await loadDiagnostics()
        if (!(await freeSpace(needed))) {
          setError(QUOTA_MESSAGES.insufficient)
          return { success: false, error: QUOTA_MESSAGES.insufficient, evicted }
        }
        await db.diagnostics.add(payload)
        setNotice(QUOTA_MESSAGES.evicted)
      }

      await loadDiagnostics()
      await registerDiagnosticsSync()
      return { success: true, evicted: evicted > 0 }
    } catch (writeError) {
      const message = isQuotaError(writeError) ? QUOTA_MESSAGES.insufficient : QUOTA_MESSAGES.failed
      setError(message)
      return { success: false, error: message }
    }
  }, [loadDiagnostics])

  const sendNow = useCallback(async () => {
    /* Un seul envoi à la fois : deux clics rapides ne doivent pas
       doubler la requête. Le verrou est une ref pour ne pas provoquer
       de rendu supplémentaire. */
    if (sendingRef.current) return { success: false, error: 'Un envoi est déjà en cours.' }
    sendingRef.current = true
    setIsSending(true)
    try {
      if (!isOnlineRef.current) {
        /* Pas de réseau : la file est confiée au Service Worker, qui
           reprendra au retour de la connexion. */
        await registerDiagnosticsSync()
        return { success: true, deferred: true, error: DEFERRED_MESSAGE }
      }
      const result = await sendDiagnostics()
      if (result.sent > 0) {
        setMessage(
          result.pending > 0
            ? `Diagnostic transmis. ${result.pending} photo${result.pending > 1 ? 's' : ''} restent en attente.`
            : 'Diagnostic transmis à l’équipe.'
        )
      }
      if (result.error) setError(result.error)
      return { success: result.sent > 0, sent: result.sent, pending: result.pending, error: result.error }
    } catch {
      setError(UNEXPECTED_MESSAGE)
      return { success: false, error: UNEXPECTED_MESSAGE }
    } finally {
      sendingRef.current = false
      setIsSending(false)
    }
  }, [])

  const clearNotice = useCallback(() => setNotice(''), [])

  return {
    diagnostics,
    /* « En attente » = rien n'est parti et rien ne bouge. Un envoi en
       cours est compté à part : sinon le compteur annoncerait 0 pendant
       que la photo est déjà partie. */
    pendingCount: diagnostics.filter((item) => item.status === DIAGNOSTIC_STATUS.PENDING).length,
    sendingCount: diagnostics.filter((item) => item.status === DIAGNOSTIC_STATUS.SENDING).length,
    saveDiagnostic,
    sendNow,
    isSending,
    message,
    clearMessage: useCallback(() => setMessage(''), []),
    error,
    notice,
    clearNotice,
    reload: loadDiagnostics
  }
}

import Dexie from 'dexie'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../db'
import { registerDiagnosticsSync } from '../sync'

/* Garde-fou quota : on refuse d'écrire une photo si le navigateur ne peut
   plus garantir la sauvegarde, et on dégage l'espace en retirant les
   diagnostics DÉJÀ ENVOYÉS (jamais ceux en attente : ce sont eux qui
   portent la valeur pour le planteur). */

const MAX_IMAGE_BYTES = 900 * 1024
const HEADROOM_BYTES = 12 * 1024 * 1024
const MIN_FREE_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_EDGE = 1024
const JPEG_QUALITY = 0.7

const QUOTA_MESSAGES = {
  insufficient: 'Le stockage de cet appareil est plein. Envoyez vos diagnostics en attente puis réessayez.',
  evicted: 'Le stockage était plein : d’anciens diagnostics déjà envoyés ont été supprimés pour libérer de l’espace.',
  failed: 'La photo n’a pas pu être sauvegardée.',
  unreadable: 'Cette photo n’a pas pu être lue. Choisissez-en une autre.'
}

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

  const loadDiagnostics = useCallback(async () => {
    try {
      const items = await db.diagnostics.orderBy('createdAt').reverse().toArray()
      setDiagnostics(items)
      setError('')
    } catch {
      setError('Les diagnostics ne peuvent pas être chargés. Réessayez.')
    }
  }, [])

  useEffect(() => {
    loadDiagnostics()
    requestPersistentStorage()
    const handleStorageChange = () => loadDiagnostics()
    Dexie.on('storagemutated', handleStorageChange)
    return () => Dexie.on('storagemutated').unsubscribe(handleStorageChange)
  }, [loadDiagnostics])

  const saveDiagnostic = useCallback(async ({ image, note }) => {
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
      status: 'pending',
      createdAt: Date.now()
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
    try {
      await registerDiagnosticsSync()
      return { success: true }
    } catch {
      const message = 'L’envoi sera réessayé dès que possible.'
      setError(message)
      return { success: false, error: message }
    }
  }, [])

  const clearNotice = useCallback(() => setNotice(''), [])

  return {
    diagnostics,
    pendingCount: diagnostics.filter((item) => item.status === 'pending').length,
    saveDiagnostic,
    sendNow,
    error,
    notice,
    clearNotice,
    reload: loadDiagnostics
  }
}

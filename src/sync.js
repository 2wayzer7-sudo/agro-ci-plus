import { db } from './db'
import { DIAGNOSTIC_STATUS, SEND_FAILURE, blobToDataUri, sendDiagnosticToSlack } from './services/diagnosticService'

/* File d'attente des diagnostics : la photo vit dans IndexedDB, l'envoi
   part dès que le réseau le permet. Le statut est écrit AVANT chaque
   tentative (`sending`) puis après (`sent` / retour à `pending`) : l'écran
   affiche ainsi la vérité, et un plantage en cours de route laisse la
   photo en attente plutôt que bloquée à « Traitement en cours ».

   Le `sending` écrit en base est réparable : `recoverInterruptedSends()`
   le rebascule en `pending` au démarrage. Sans cela, un onglet fermé au
   milieu d'un envoi afficherait « Traitement en cours » jusqu'à la fin
   des temps — un mensonge d'interface provoqué par un simple rechargement. */

const PENDING = DIAGNOSTIC_STATUS.PENDING
const SENDING = DIAGNOSTIC_STATUS.SENDING
const SENT = DIAGNOSTIC_STATUS.SENT

/* Un échec réseau ou un déploiement non configuré ne sera pas corrigé
   par un nouvel essai immédiat sur les photos suivantes : on s'arrête
   pour ne pas consummer la batterie et le quota de données. */
const FATAL_FAILURES = [SEND_FAILURE.OFFLINE, SEND_FAILURE.NOT_CONFIGURED, SEND_FAILURE.NETWORK]

/* Verrou PARTAGÉ par tous les appelants de la page.
   `useDiagnostics` est instancié deux fois en même temps (App.jsx pour le
   compteur de la barre de navigation, DiagnosticScreen pour la liste), et
   chacune déclenche son propre flush : sans ce verrou, deux envois
   parcouraient la même file `pending` et le planteur recevait deux fois la
   même photo. Un verrou en `ref` (celui de `sendNow`) ne protégeait que
   l'intérieur d'une instance. Ici les appelants concurrents partagent le
   MÊME flush au lieu de le dupliquer. */
let flushPromise = null

/* Identifiants réellement en cours d'envoi dans CETTE page. Sert à
   `recoverInterruptedSends` : sans cette liste, monter l'écran Diagnostic
   pendant qu'un envoi tourne rebascule l'item en `pending` (puisque le
   statut en base est `sending`) et l'item part une seconde fois. */
const inFlight = new Set()

/* Toute photo laissée en `sending` par une session interrompée redevient
   envoyable. Appelé au montage de l'écran et avant chaque flush. */
export async function recoverInterruptedSends() {
  try {
    const stuck = await db.diagnostics.where('status').equals(SENDING).toArray()
    /* `inFlight` fait foi : un `sending` écrit par le flush en cours
       n'est pas un envoi interrompu. */
    const interrupted = stuck.filter((item) => !inFlight.has(item.id))
    if (!interrupted.length) return 0
    await db.diagnostics.bulkUpdate(
      interrupted.map((item) => ({ key: item.id, changes: { status: PENDING } }))
    )
    return interrupted.length
  } catch {
    return 0
  }
}

async function queueLength(status) {
  try {
    return await db.diagnostics.where('status').equals(status).count()
  } catch {
    return 0
  }
}

/* Une seule photo à la fois : les envois sont séquentiels pour ne pas
   saturer une connexion 3G avec plusieurs requêtes photo simultanées.
   Fonction PUBLIQUE = point d'entrée verrouillé ; le corps réel est
   `flushDiagnostics`, appelé une seule fois à la fois. */
export function sendDiagnostics() {
  if (!flushPromise) {
    /* `startedAt` sert de filigrane : une photo enregistrée PENDANT le flush
       (réseau lent, planteur qui photographie tout de suite) n'était pas dans
       la liste lue au départ, et resterait en attente jusqu'au prochain
       déclencheur. Un seul passage de plus, et seulement pour elle — jamais
       une boucle : un échec laisse des items `pending` plus anciens, et on ne
       rejoue donc pas les échecs. */
    const startedAt = Date.now()
    flushPromise = flushDiagnostics()
      .then((result) => flushLateArrivals(startedAt, result))
      .finally(() => {
        flushPromise = null
      })
  }
  return flushPromise
}

async function flushLateArrivals(startedAt, previousResult) {
  try {
    const late = await db.diagnostics
      .where('status')
      .equals(PENDING)
      .filter((item) => (item.createdAt ?? 0) > startedAt)
      .count()
    if (late > 0) return flushDiagnostics()
  } catch {
    /* base inaccessible : le prochain flush s'en chargera */
  }
  return previousResult
}

async function flushDiagnostics() {
  let pending
  try {
    pending = await db.diagnostics.where('status').equals(PENDING).sortBy('createdAt')
  } catch {
    return { sent: 0, failed: 0, pending: 0, error: 'Les diagnostics ne peuvent pas être synchronisés.' }
  }

  if (pending.length === 0) {
    return { sent: 0, failed: 0, pending: 0 }
  }

  let sent = 0
  let failed = 0
  let lastError = ''

  for (const item of pending) {
    try {
      /* Marqué AVANT l'écriture du statut : entre les deux, il y a un
         await, et un `recover` déclenché dans cette fenêtre verrait un
         `sending` non encore enregistré et le rebasculerait en `pending`. */
      inFlight.add(item.id)
      /* Statut « Traitement en cours » AVANT le réseau : l'utilisateur
         voit l'état réel, pas une intention. */
      await db.diagnostics.update(item.id, { status: SENDING, lastError: '' })

      const photoDataUri = await blobToDataUri(item.image)
      const result = await sendDiagnosticToSlack(photoDataUri, item.note, item.location, item.aiResult)

      if (result.success) {
        await db.diagnostics.update(item.id, {
          status: SENT,
          sentAt: Date.now(),
          attempts: (item.attempts ?? 0) + 1,
          lastError: ''
        })
        sent += 1
        continue
      }

      /* Retour en `pending` : la photo reste dans la file, rien n'est
         perdu, et `attempts` trace les échecs pour le diagnostic. */
      await db.diagnostics.update(item.id, {
        status: PENDING,
        attempts: (item.attempts ?? 0) + 1,
        lastError: result.message
      })
      failed += 1
      lastError = result.message

      if (FATAL_FAILURES.includes(result.failure)) break
    } catch {
      failed += 1
      lastError = 'L’envoi a été interrompu. Réessayé au prochain retour de connexion.'
      try {
        await db.diagnostics.update(item.id, {
          status: PENDING,
          attempts: (item.attempts ?? 0) + 1,
          lastError
        })
      } catch {
        /* base inaccessible : rien de plus à faire ici */
      }
      break
    } finally {
      /* Libère l'item dans TOUTES les sorties : succès, échec, `continue`,
         `break`, ou exception. Un `finally` s'exécute aussi dans ces deux
         derniers cas, donc aucune trace ne peut rester en `inFlight` et
         rendre un item irrécupérable au prochain `recover`. */
      inFlight.delete(item.id)
    }
  }

  const remaining = await queueLength(PENDING)
  return failed > 0 ? { sent, failed, pending: remaining, error: lastError } : { sent, failed, pending: remaining }
}

/* Tente l'envoi immédiat ; si le réseau manque, on confie le travail au
   Service Worker (Background Sync) qui reprendra au retour de la
   connexion, même après la fermeture de l'onglet. */
export async function registerDiagnosticsSync() {
  try {
    const registration = await navigator.serviceWorker?.ready
    if (registration?.sync?.register) {
      await registration.sync.register('sync-diagnostics')
      return 'background'
    }
    await sendDiagnostics()
    return 'local'
  } catch {
    await sendDiagnostics()
    return 'local'
  }
}

export function listenForSyncMessages(onSync) {
  if (!('serviceWorker' in navigator)) return () => {}
  const handleMessage = async (event) => {
    if (event.data?.type === 'SYNC_DIAGNOSTICS') {
      await sendDiagnostics()
      onSync()
    }
  }
  navigator.serviceWorker.addEventListener('message', handleMessage)
  return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
}

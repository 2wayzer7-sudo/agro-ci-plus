/* ============================================================
   TRANSMISSION DES DIAGNOSTICS VERS SLACK
   ============================================================
   Deux chemins d'envoi, dans cet ordre :

   1. La fonction serveurless `/api/send-diagnostic`
      (`netlify/functions/` sur Netlify, `api/` sur Vercel), qui lit
      `SLACK_WEBHOOK_URL` côté serveur. C'est le chemin SÉCURISÉ : le
      webhook n'existe que dans l'environnement de la fonction, jamais
      dans le bundle du navigateur. Elle ne reçoit QUE du contenu (note,
      localité, pré-diagnostic, photo), jamais des blocs Slack qu'un
      appelant aurait pu forger.

   2. À défaut — fonction absente (404), pas configurée (503), ou
      silencieuse — envoi DIRECT vers le webhook si le build contient
      `VITE_SLACK_WEBHOOK_URL`. Vite INLINE toute variable `VITE_*` dans
      le JavaScript public : l'URL du webhook est alors lisible par tout
      visiteur et permet de poster des messages arbitraires dans le
      canal. À n'utiliser que pour un canal de test dont vous
      accepteriez la publication.

      Ce repli est ce qui supprime le 404 : le message part même si la
      fonction n'est pas déployée, et la perte de la photo y est
      explicite (Slack affiche « photo non publiable ») — jamais un
      succès annoncé à tort.

   Dans les deux cas, le message est fabriqué par `slackBlocks.js` :
   un seul rendu, même contenu à l'identique.
   ============================================================ */

/* Extension explicite : Vite la tolère, et Node (tests, donc aucune
   résolution de style Vite) ne résout pas un chemin sans `.js`. */
import { buildSlackPayload, isPublicPhotoUrl } from './slackBlocks.js'

/* Route même origine du relais serveur (aucun secret dans le bundle).
   Sur Netlify, `netlify.toml` réécrit cette route vers
   `/.netlify/functions/send-diagnostic`. */
export const DIAGNOSTIC_ENDPOINT = '/api/send-diagnostic'

/* URL fournie par le build. `?.` : hors Vite (tests Node), `import.meta.env`
   n'existe pas et le module doit rester importable. */
const CONFIGURED_WEBHOOK = (import.meta.env?.VITE_SLACK_WEBHOOK_URL ?? '').trim()

/* On n'accepte qu'une URL Slack en HTTPS : une variable d'environnement
   mal remplie (ou pointant par erreur vers un autre service) ne doit pas
   pouvoir transformer l'app en client HTTP arbitraire. */
export const SLACK_WEBHOOK_URL = /^https:\/\/hooks\.slack(-gov)?\.com\//i.test(CONFIGURED_WEBHOOK)
  ? CONFIGURED_WEBHOOK
  : ''

/* Vrai si le repli direct est possible, i.e. si le build a embarqué une URL
   de webhook valide. */
export const isDirectWebhookConfigured = Boolean(SLACK_WEBHOOK_URL)

export const DIAGNOSTIC_STATUS = Object.freeze({
  PENDING: 'pending',
  SENDING: 'sending',
  SENT: 'sent'
})

/* Motifs d'échec, consommés par l'écran pour formuler un message exact
   au lieu d'un « l'envoi a échoué » qui ne dit rien. */
export const SEND_FAILURE = Object.freeze({
  OFFLINE: 'offline',
  NOT_CONFIGURED: 'not_configured',
  PAYLOAD: 'payload',
  NETWORK: 'network',
  SERVER: 'server'
})

/* Garde-fous de taille, appliqués CÔTÉ CLIENT pour ne pas transporter
   un payload que le serveur refusera de toute façon. */
const MAX_NOTE_LENGTH = 2000
const MAX_LOCATION_LENGTH = 120
const MAX_LABEL_LENGTH = 160
/* Base64 = 4/3 de la taille binaire. 1,4 M de base7 ≈ 1,05 Mo d'image,
   au-dessus la requête frôle la limite de corps d'une fonction
   serverless. */
const MAX_WIRE_PHOTO_LENGTH = 1400000
/* Chaque TENTATIVE a son propre délai : sinon un relais qui ne répond pas
   consommerait tout le budget et le repli direct n'aurait plus de temps. */
const RELAY_TIMEOUT_MS = 8000
const WEBHOOK_TIMEOUT_MS = 10000

/* Pré-diagnostic IA : aucun service n'est branché à ce jour (même
   situation que le push distant, cf. sw.js). Le champ est donc
   explicitement marqué indisponible plutôt que d'inventer un résultat —
   un diagnostic faux coûte plus cher qu'un diagnostic absent. */
export const IA_UNAVAILABLE = Object.freeze({
  available: false,
  label: null,
  confidence: null,
  severity: null
})

function clampText(value, maxLength) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed
}

/* Le contenu envoyé ne doit jamais pouvoir casser la mise en forme du
   message Slack ni injecter un lien : on retire d'abord les caractères
   de contrôle, on tronque ensuite. */
function sanitizeContent(value, maxLength) {
  return clampText(String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' '), maxLength)
}

function isPublicUrl(value) {
  return isPublicPhotoUrl(value)
}

/* Photo : data URI (transmise à la fonction, qui la publie si un
   hébergement d'images est configuré) ou URL déjà publique. */
function normalizePhotoUrl(photoUrl) {
  if (typeof photoUrl !== 'string') return ''
  const value = photoUrl.trim()
  if (!value) return ''
  if (value.startsWith('data:image/')) {
    return value.length <= MAX_WIRE_PHOTO_LENGTH ? value : ''
  }
  return isPublicUrl(value) ? value : ''
}

/* Un blob d'IndexedDB -> data URI base64. FileReader est préféré à
   `arrayBuffer` + conversion manuelle : pas de buffer intermédiaire, et
   le type MIME du blob est respecté. */
export function blobToDataUri(blob) {
  if (!blob || typeof blob !== 'object' || typeof blob.size !== 'number') {
    return Promise.resolve('')
  }
  if (blob.size === 0) return Promise.resolve('')
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    /* Lecture impossible : on transmet sans photo plutôt que d'abandonner
       la note du planteur, qui porte l'essentiel de l'information. */
    reader.onerror = () => resolve('')
    reader.readAsDataURL(blob)
  })
}

/* Formate le pré-diagnostic pour l'affichage. Accepte aussi bien un
   résultat complet que l'état « indisponible », pour que l'intégration
   soit prête le jour où le modèle sera branché sans retoucher l'écran. */
export function normalizeAiResult(raw) {
  if (!raw || typeof raw !== 'object' || raw.available !== true) return IA_UNAVAILABLE
  return {
    available: true,
    label: sanitizeContent(raw.label, MAX_LABEL_LENGTH),
    confidence: Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : null,
    severity: ['low', 'medium', 'high'].includes(raw.severity) ? raw.severity : null
  }
}

export function isNetworkAvailable() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/* ---------- Les deux tentatives ----------

   Chacune renvoie un résultat normalisé, jamais une exception :
     { ok: true, photoPublished }
     { ok: false, retry, failure, message }
   `retry` = « un autre chemin peut encore passer ». Un refus de contenu
   (400/413) est le SEUL cas où l'on n'essaie rien ailleurs : le même
   payload serait refusé partout. */

/* Statuts qui signifient « il n'y a pas de relais exploitable ici » : la
   route n'existe pas (404), autre chose l'occupe (405/501), ou la fonction
   répond qu'aucun webhook n'est configuré (503). */
const RELAY_ABSENT_STATUS = new Set([404, 405, 501, 503])

const RELAY_ABSENT_MESSAGE = 'Envoi Slack non configuré sur ce déploiement : vos photos restent enregistrées en attente.'
const RELAY_MALFORMED_MESSAGE = 'Le relais d’envoi ne répond pas comme une fonction : vos photos restent enregistrées en attente.'

/* Le relais peut être absent pour TOUT le déploiement (site Vercel sans la
   fonction, mauvaise configuration d'hébergeur). Une fois constaté, inutile
   de répéter un aller-retour 404 avant chaque photo : le repli direct devient
   le chemin normal. Détention par session uniquement — un déploiement ne
   peut pas changer sans rechargement de la page. */
let relayAbsent = false

function readJsonSafely(text) {
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

function networkMessage(error) {
  return error?.name === 'AbortError'
    ? 'Le service d’envoi ne répond pas : réessayé au prochain retour de connexion.'
    : 'Connexion interrompue pendant l’envoi : réessayé au prochain retour de connexion.'
}

async function postJson(url, body, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

/* Tentative 1 — la fonction serveur, qui lit le webhook côté serveur.
   Seul du CONTENU est transmis, jamais des blocs Slack qu'un appelant
   aurait pu forger. Exportée pour être testable sans navigateur. */
export async function attemptRelay(content) {
  if (relayAbsent) {
    return { ok: false, retry: true, failure: SEND_FAILURE.NOT_CONFIGURED, message: RELAY_ABSENT_MESSAGE }
  }

  let response
  try {
    response = await postJson(DIAGNOSTIC_ENDPOINT, JSON.stringify(content), RELAY_TIMEOUT_MS)
  } catch (error) {
    /* Réseau coupé ou relais muet : le repli direct ne dépend pas du même
       chemin réseau, il peut encore passer. */
    return { ok: false, retry: true, failure: SEND_FAILURE.NETWORK, message: networkMessage(error) }
  }

  const answer = await response.text().catch(() => '')

  if (response.ok) {
    /* Une SPA servie en 200 (le catch-all `/*` d'un hébergeur) renvoie
       index.html : ce n'est PAS un relais. Sans ce test, l'app annoncerait
       un envoi réussi alors que rien n'est parti du tout. */
    const payload = readJsonSafely(answer)
    if (!payload) {
      relayAbsent = true
      return { ok: false, retry: true, failure: SEND_FAILURE.NOT_CONFIGURED, message: RELAY_MALFORMED_MESSAGE }
    }
    return { ok: true, photoPublished: Boolean(payload.photoPublished) }
  }

  if (RELAY_ABSENT_STATUS.has(response.status)) {
    relayAbsent = true
    return { ok: false, retry: true, failure: SEND_FAILURE.NOT_CONFIGURED, message: RELAY_ABSENT_MESSAGE }
  }

  if (response.status === 400 || response.status === 413) {
    return { ok: false, retry: false, failure: SEND_FAILURE.PAYLOAD, message: 'Photo ou note trop volumineuse pour être transmise.' }
  }

  return {
    ok: false,
    retry: true,
    failure: SEND_FAILURE.SERVER,
    message: `Le service d’envoi a répondu par une erreur (${response.status}).`
  }
}

/* Tentative 2 — le webhook appelé DIRECTEMENT par le navigateur (Slack
   autorise les requêtes cross-origin sur son endpoint, `Access-Control-
   Allow-Origin: *`). Aucune fonction, donc aucune publication de photo :
   le message part sans image, ce que Slack signale.

   `webhookUrl` est un PARAMÈTRE et non la constante du module : c'est ce
   qui permet de tester la branche de repli dans Node, où
   `import.meta.env` n'existe pas et où aucun webhook n'est configuré. */
export async function attemptWebhook({ note, place, ai, photoUrl, capturedAt, webhookUrl }) {
  const body = JSON.stringify(buildSlackPayload({ note, location: place, aiResult: ai, photoUrl, capturedAt }))

  let response
  try {
    response = await postJson(webhookUrl, body, WEBHOOK_TIMEOUT_MS)
  } catch (error) {
    return { ok: false, failure: SEND_FAILURE.NETWORK, message: networkMessage(error) }
  }

  const answer = (await response.text().catch(() => '')).trim()

  if (response.ok) {
    /* Slack répond 200 avec le corps « ok », ou 200 avec un refus :
       response.ok seul ne suffit donc pas, le corps est vérifié aussi. */
    if (answer && answer.toLowerCase() !== 'ok') {
      return {
        ok: false,
        failure: SEND_FAILURE.SERVER,
        message: `Slack a refusé le message : ${answer.slice(0, 120)}`
      }
    }
    return { ok: true, photoPublished: Boolean(photoUrl) }
  }

  /* Un 404 vient ici de Slack, pas d'une fonction absente : le webhook est
     révoqué ou mal collé. Réessayer n'y changerait rien, et l'utilisateur
     doit savoir qu'aucun envoi ne partira tant que ce n'est pas corrigé. */
  if (response.status === 404 || response.status === 410) {
    return {
      ok: false,
      failure: SEND_FAILURE.NOT_CONFIGURED,
      message: 'Webhook Slack invalide ou révoqué sur ce déploiement : vos photos restent enregistrées en attente.'
    }
  }

  return { ok: false, failure: SEND_FAILURE.SERVER, message: `Slack a répondu par une erreur (${response.status}).` }
}

/* ---------- Fonction principale ----------
   sendDiagnosticToSlack(photoData, userNote, location, iaResult)
   -> { success: true, photoPublished } | { success: false, failure, message }

   Ne lève jamais : l'appelant est un enqueueur, pas un handler de clic,
   et une exception ici ferait perdre la trace de la file d'attente. */
export async function sendDiagnosticToSlack(photoData, userNote, location, iaResult) {
  if (!isNetworkAvailable()) {
    return {
      success: false,
      failure: SEND_FAILURE.OFFLINE,
      message: 'Hors connexion : la photo reste en attente et partira automatiquement.'
    }
  }

  const note = sanitizeContent(userNote, MAX_NOTE_LENGTH)
  const place = sanitizeContent(location, MAX_LOCATION_LENGTH)
  const ai = normalizeAiResult(iaResult)
  const photo = normalizePhotoUrl(photoData)

  /* Une photo seule ne suffit pas à alerter l'équipe : sans note ni lieu,
     le message est inexploitable. On évite un aller-retour inutile. */
  if (!note && !place && !photo) {
    return {
      success: false,
      failure: SEND_FAILURE.PAYLOAD,
      message: 'Rien à transmettre : ni note, ni localité, ni photo.'
    }
  }

  const photoIsRemote = isPublicUrl(photo) && !photo.startsWith('data:')
  const remotePhoto = photoIsRemote ? photo : ''
  const capturedAt = Date.now()

  const relay = await attemptRelay({
    note,
    location: place,
    aiResult: ai,
    photoDataUri: remotePhoto ? '' : photo,
    photoUrl: remotePhoto,
    capturedAt
  })

  if (relay.ok) {
    return { success: true, photoPublished: relay.photoPublished }
  }

  /* Repli direct impossible (pas de webhook dans le build) ou inutile (le
     payload lui-même est refusé) : on rend le motif exact du relais. */
  if (!relay.retry || !isDirectWebhookConfigured) {
    return { success: false, failure: relay.failure, message: relay.message }
  }

  const direct = await attemptWebhook({ note, place, ai, photoUrl: remotePhoto, capturedAt, webhookUrl: SLACK_WEBHOOK_URL })

  if (direct.ok) {
    return { success: true, photoPublished: direct.photoPublished }
  }

  /* Le repli direct est le dernier chemin : son échec est définitif, mais
     on ne remplace PAS son motif par celui du relais, plus indicatif pour
     l'utilisateur. */
  return { success: false, failure: direct.failure, message: direct.message }
}

/* ============================================================
   FONCTION SERVEURLESS — relais Slack (Netlify)
   ============================================================
   Équivalent Netlify de `api/send-diagnostic.js` (Vercel) : même contrat
   HTTP, même rendu de message, une seule implémentation du Block Kit
   (`src/services/slackBlocks.js`, importé tel quel).

   Différences avec la version Vercel, dictées par la plateforme :
     1. handler au style Netlify en mode Lambda (`handler(event)` ->
        `{ statusCode, body }`) ;
     2. la photo est publiée dans Netlify Blobs puis servie par
        `netlify/functions/diagnostic-photo.js`, car un blob Netlify n'a
        pas d'URL publique (contrairement au `downloadUrl` de Vercel Blob).

   ⚠️ Pas de `export const config = { path: ... }` ici : sur Netlify, poser
   un `path` personnalisé DÉSACTIVE l'URL par défaut
   `/.netlify/functions/<nom>`, ce qui casserait la règle de réécriture
   `/api/send-diagnostic` -> `/.netlify/functions/send-diagnostic`
   (cf. netlify.toml). Le chemin personnalisé se met donc côté config.

   Variables d'environnement (serveur uniquement, à définir dans l'UI
   Netlify — un fichier `.env` n'est PAS lu au déploiement) :
   - SLACK_WEBHOOK_URL   REQUIS. Incoming webhook du canal.
   Netlify Blobs n'exige AUCUNE variable : siteID et token sont injectés
   par la plateforme dans l'événement (`event.blobs`). Sans Blobs actif,
   le message part SANS image — jamais de lien mort, et le planteur n'est
   jamais told qu'une photo a été transmise quand elle ne l'a pas été.
   ============================================================ */

import { connectLambda, getStore } from '@netlify/blobs'
import { buildSlackPayload, cleanText, MAX_LOCATION_LENGTH, MAX_NOTE_LENGTH } from '../../src/services/slackBlocks.js'
import { PHOTO_STORE, buildPhotoKey, buildPhotoUrl } from '../lib/photos.js'

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || ''

const SLACK_TIMEOUT_MS = 10000
const MAX_PHOTO_BYTES = 1100000
/* Un data URI de 1,1 Mo fait ~1,47 Mo en base64 : on refuse bien avant la
   limite de corps d'une fonction (6 Mo sur Netlify) pour ne pas payer
   l'invocation d'un payload voué à être refusé. */
const MAX_BODY_LENGTH = 1600000

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function respond(statusCode, payload, extraHeaders) {
  return { statusCode, headers: { ...JSON_HEADERS, ...extraHeaders }, body: JSON.stringify(payload) }
}

/* ---------- Lecture du corps ---------- */

function readBody(event) {
  const raw = typeof event?.body === 'string' ? event.body : ''
  if (!raw) return {}
  if (event.isBase64Encoded) {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    } catch {
      return null
    }
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/* ---------- Publication de la photo (optionnelle) ---------- */

function parseDataUri(dataUri) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUri ?? ''))
  if (!match) return null
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return null
  return { subtype: match[1] === 'jpeg' ? 'jpg' : match[1], bytes }
}

/* Tout échec est NON FATAL : le message part quand même, sans image. Une
   photo non publiée est une information manquante, pas une photo perdue —
   elle reste enregistrée chez le planteur (IndexedDB), qui peut
   retransmettre ou appeler son conseiller. */
async function publishPhoto(event, dataUri) {
  const image = parseDataUri(dataUri)
  if (!image) return ''

  try {
    /* En mode Lambda, le contexte Blobs n'est PAS initialisé
       automatiquement : `connectLambda` le lit dans l'événement et doit
       précéder tout `getStore`. */
    connectLambda(event)
    const store = getStore(PHOTO_STORE)
    const key = buildPhotoKey(image.subtype)
    /* `Blob` et non `Buffer` : c'est le type documenté par l'API Blobs
       (ArrayBuffer | Blob | string). */
    await store.set(key, new Blob([image.bytes], { type: `image/${image.subtype}` }), {
      metadata: { contentType: `image/${image.subtype}` }
    })
    return buildPhotoUrl(event, key)
  } catch {
    return ''
  }
}

/* ---------- Handler ---------- */

export const handler = async (event) => {
  if (event?.httpMethod !== 'POST') {
    return respond(405, { error: 'method_not_allowed' }, { Allow: 'POST' })
  }

  /* Un relais Slack public est une cible : on refuse les requêtes
     cross-site (le navigateur de l'app est toujours same-origin). */
  const headers = event?.headers || {}
  if ((headers['sec-fetch-site'] || headers['Sec-Fetch-Site']) === 'cross-site') {
    return respond(403, { error: 'forbidden' })
  }

  if (typeof event.body === 'string' && event.body.length > MAX_BODY_LENGTH) {
    return respond(413, { error: 'payload_too_large' })
  }

  const body = readBody(event)
  if (!body || typeof body !== 'object') return respond(400, { error: 'invalid_json' })

  if (!SLACK_WEBHOOK_URL) {
    return respond(503, { error: 'not_configured' })
  }

  const note = cleanText(body.note, MAX_NOTE_LENGTH)
  const location = cleanText(body.location, MAX_LOCATION_LENGTH)
  const photoDataUri = typeof body.photoDataUri === 'string' ? body.photoDataUri : ''
  const photoUrl = typeof body.photoUrl === 'string' && /^https:\/\//i.test(body.photoUrl.trim())
    ? body.photoUrl.trim()
    : ''

  if (!note && !location && !photoDataUri && !photoUrl) {
    return respond(400, { error: 'empty_payload' })
  }

  /* Publication facultative : sans Blobs, `publishedUrl` reste vide et le
     message part SANS image, ce que Slack signale explicitement. */
  const publishedUrl = photoUrl || (await publishPhoto(event, photoDataUri))
  const slackPayload = buildSlackPayload({
    note,
    location,
    aiResult: body.aiResult,
    photoUrl: publishedUrl,
    capturedAt: body.capturedAt
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS)

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
      signal: controller.signal
    })

    /* Slack répond 200 avec le corps « ok », ou 200 avec un message
       d'erreur : un simple test sur response.ok ne suffit pas. */
    const answer = await response.text().catch(() => '')
    if (!response.ok || (answer && answer.trim() !== 'ok')) {
      return respond(502, { error: 'slack_rejected' })
    }

    return respond(200, { ok: true, photoPublished: Boolean(publishedUrl), photoUrl: publishedUrl })
  } catch {
    return respond(502, { error: 'slack_unreachable' })
  } finally {
    clearTimeout(timeout)
  }
}

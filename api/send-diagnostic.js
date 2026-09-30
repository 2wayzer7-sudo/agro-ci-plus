/* ============================================================
   FONCTION SERVEURLESS — relais Slack (Vercel)
   ============================================================
   Chemin d'envoi SÉCURISÉ : le webhook n'existe que dans l'environnement
   du serveur (`SLACK_WEBHOOK_URL`) et n'est jamais livré au navigateur.

   Il sert de repli lorsque `VITE_SLACK_WEBHOOK_URL` n'est pas
   renseignée dans le build : le client bascule alors sur cette fonction.
   Le client n'envoie volontairement QUE du contenu (note, localité,
   pré-diagnostic, photo) — jamais des `blocks` Slack qu'il aurait pu
   forger. Le rendu Block Kit est ici celui de `src/services/slackBlocks.js`,
   importé tel quel : un seul format pour les deux chemins.

   Variables d'environnement (côté serveur uniquement) :
   - SLACK_WEBHOOK_URL        REQUIS. Incoming webhook du canal.
   - BLOB_READ_WRITE_TOKEN    OPTIONNEL. Publie la photo pour que Slack
   - BLOB_STORE_ID            OPTIONNEL. l'affiche en vraie image.
   Sans ces deux dernières, le message est posté sans image : on ne
   prétend JAMAIS avoir transmis une photo qu'on n'a pas pu publier.
   ============================================================ */

import { buildSlackPayload, cleanText, MAX_LOCATION_LENGTH, MAX_NOTE_LENGTH } from '../src/services/slackBlocks.js'

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || ''
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || ''
const BLOB_STORE_ID = process.env.BLOB_STORE_ID || ''

const SLACK_TIMEOUT_MS = 10000
const MAX_PHOTO_BYTES = 1100000

/* ---------- Publication de la photo (optionnelle) ---------- */

function parseDataUri(dataUri) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUri ?? ''))
  if (!match) return null
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return null
  return { subtype: match[1] === 'jpeg' ? 'jpg' : match[1], bytes }
}

/* API REST Vercel Blob, appelée en direct : aucune dépendance à
   installer, et le secret reste côté serveur. Tout échec est non fatal
   (le message part quand même, sans image). */
async function publishPhoto(dataUri) {
  if (!BLOB_READ_WRITE_TOKEN || !BLOB_STORE_ID) return null
  const image = parseDataUri(dataUri)
  if (!image) return null

  const name = `diagnostics/${Date.now()}-${crypto.randomUUID()}.${image.subtype}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS)

  try {
    const response = await fetch(`https://blob.vercel-storage.com/v1/${BLOB_STORE_ID}/${name}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${BLOB_READ_WRITE_TOKEN}`,
        'x-api-version': '7',
        'content-type': `image/${image.subtype}`
      },
      body: image.bytes,
      signal: controller.signal
    })
    if (!response.ok) return null
    const payload = await response.json().catch(() => ({}))
    return payload?.downloadUrl || payload?.url || null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/* ---------- Handler ---------- */

function readBody(req) {
  if (!req?.body) return {}
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return null
    }
  }
  return typeof req.body === 'object' ? req.body : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  /* Un relais Slack public est une cible : on refuse les requêtes
     cross-site (le navigateur de l'app est toujours same-origin) et on
     plafonne la taille. À durcir avec une authentification réelle si le
     déploiement devient public. */
  if (req.headers?.['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'forbidden' })
  }

  const body = readBody(req)
  if (!body) return res.status(400).json({ error: 'invalid_json' })

  if (!SLACK_WEBHOOK_URL) {
    return res.status(503).json({ error: 'not_configured' })
  }

  const note = cleanText(body.note, MAX_NOTE_LENGTH)
  const location = cleanText(body.location, MAX_LOCATION_LENGTH)
  const photoDataUri = typeof body.photoDataUri === 'string' ? body.photoDataUri : ''
  const photoUrl = typeof body.photoUrl === 'string' && /^https:\/\//i.test(body.photoUrl.trim())
    ? body.photoUrl.trim()
    : ''

  if (!note && !location && !photoDataUri && !photoUrl) {
    return res.status(400).json({ error: 'empty_payload' })
  }

  /* Publication facultative de la photo : sans hébergement configuré,
     publishedUrl reste null et le message part SANS image, ce que Slack
     signale explicitement. Jamais de lien mort, jamais de fausse image. */
  const publishedUrl = photoUrl || (await publishPhoto(photoDataUri))
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
      return res.status(502).json({ error: 'slack_rejected' })
    }

    return res.status(200).json({ ok: true, photoPublished: Boolean(publishedUrl) })
  } catch {
    return res.status(502).json({ error: 'slack_unreachable' })
  } finally {
    clearTimeout(timeout)
  }
}

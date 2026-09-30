/* ============================================================
   BLOCK KIT SLACK — RENDU DU MESSAGE DE DIAGNOSTIC
   ============================================================
   Module PUR, sans React ni navigateur, importé à l'identique par
   `src/services/diagnosticService.js` (envoi direct) et
   `api/send-diagnostic.js` (relais serveur). Une seule implémentation
   du format : les deux chemins d'envoi produisent exactement le même
   message, donc un test de rendu vaut pour les deux.

   Règle absolute : le contenu du planteur ne doit JAMAIS piloter la mise
   en forme du canal. D'où `escapeMrkdwn` sur chaque texte inséré — sans
   lui, une note contenant `<!channel>` déclencherait une mention
   générale de l'équipe, et `<https://…>` injecterait un lien cliquable.
   ============================================================ */

export const MAX_NOTE_LENGTH = 2000
export const MAX_LOCATION_LENGTH = 120
export const MAX_LABEL_LENGTH = 160
export const SLACK_BLOCK_LIMIT = 50

/* Slack interprète `&`, `<` et `>` dans son mrkdwn. */
export function escapeMrkdwn(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function cleanText(value, maxLength) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export function formatTimestamp(capturedAt) {
  const fallback = new Date()
  const date = Number.isFinite(capturedAt) ? new Date(capturedAt) : fallback
  const usable = Number.isNaN(date.getTime()) ? fallback : date
  return usable.toISOString().slice(0, 16).replace('T', ' ')
}

export function isPublicPhotoUrl(value) {
  return typeof value === 'string' && /^https:\/\//i.test(value.trim())
}

const SEVERITY_LABEL = {
  low: ' · gravité faible',
  medium: ' · gravité moyenne',
  high: ' · gravité élevée'
}

/* ---------- Construction du message ---------- */

export function buildSlackBlocks({ note, location, aiResult, photoUrl, capturedAt } = {}) {
  const safeNote = cleanText(note, MAX_NOTE_LENGTH)
  const safeLocation = cleanText(location, MAX_LOCATION_LENGTH)

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🧪 Diagnostic cacao / café', emoji: true }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📍 *${escapeMrkdwn(safeLocation || 'Localité inconnue')}* · reçu le ${formatTimestamp(capturedAt)}`
        }
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Ce que dit le planteur*\n${safeNote ? escapeMrkdwn(safeNote) : '_aucune note_'}`
      }
    }
  ]

  if (aiResult?.available === true) {
    const label = cleanText(aiResult.label, MAX_LABEL_LENGTH) || 'hypothèse non nommée'
    const confidence = Number.isFinite(aiResult.confidence)
      ? ` · confiance ${Math.round(aiResult.confidence * 100)} %`
      : ''
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Pré-diagnostic IA*\n${escapeMrkdwn(label)}${confidence}${SEVERITY_LABEL[aiResult.severity] ?? ''}` }
    })
  } else {
    /* Aucun service IA n'est branché : on l'écrit dans le message plutôt
       que de laisser croire qu'une analyse automatique a eu lieu. */
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '🧠 Pré-diagnostic IA indisponible — analyse à faire manuellement.' }]
    })
  }

  if (isPublicPhotoUrl(photoUrl)) {
    blocks.push({
      type: 'image',
      image_url: photoUrl.trim(),
      alt_text: 'Photo du diagnostic transmise par un planteur'
    })
  } else {
    /* Slack n'affiche qu'une image DÉJÀ hébergée : un data URI local
       produirait une image cassée dans le canal. */
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '📷 Photo non publiable : aucune URL publique d’image n’a pu être fournie.'
        }
      ]
    })
  }

  return blocks.slice(0, SLACK_BLOCK_LIMIT)
}

export function buildSlackPayload({ note, location, aiResult, photoUrl, capturedAt } = {}) {
  const place = cleanText(location, MAX_LOCATION_LENGTH)
  return {
    text: `Diagnostic planteur — ${place || 'localité inconnue'}`,
    blocks: buildSlackBlocks({ note, location: place, aiResult, photoUrl, capturedAt })
  }
}

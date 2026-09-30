/* ============================================================
   PARTAGÉ — stockage des photos de diagnostic (Netlify Blobs)
   ============================================================
   Importé par les deux fonctions de `netlify/functions/`. Volontairement
   HORS du dossier des fonctions : Netlify déploie TOUT fichier de
   `netlify/functions/` comme une fonction, un utilitaire y créerait une
   fonction sans handler.

   Rappel Netlify : un blob n'a pas d'URL publique. Il n'est lisible qu'à
   travers le site qui le contient — d'où `netlify/functions/diagnostic-photo.js`,
   seule façon d'obtenir une URL que les serveurs de Slack sachent
   télécharger. C'est ce qui remplace le `downloadUrl` de Vercel Blob.
   ============================================================ */

export const PHOTO_STORE = 'diagnostic-photos'

/* Clé = horodatage + UUID. La forme est VERROUILLÉE : c'est la seule
   garantie qu'un appelant ne peut pas lire une autre clé du store que
   celles qu'il a lui-même produites (le store est un espace de noms
   partagé par tout le site). */
const KEY_PATTERN = /^(\d{13})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpg|webp)$/

const SUBTYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

export function isValidPhotoKey(key) {
  return typeof key === 'string' && KEY_PATTERN.test(key)
}

export function contentTypeFor(key) {
  const match = KEY_PATTERN.exec(String(key ?? ''))
  return match ? SUBTYPES[match[3]] : 'application/octet-stream'
}

export function buildPhotoKey(subtype) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? '0000000-0000-4000-8000-000000000000'
  return `${Date.now()}-${uuid}.${subtype}`
}

/* URL absolue de la photo, déduite de l'hôte qui a reçu la requête :
   le lien reste donc valable sur un deploy de production comme sur une
   prévisualisation de branche, sans configuration supplémentaire. */
export function buildPhotoUrl(event, key) {
  const headers = event?.headers || {}
  const host = headers.host || headers.Host || ''
  if (!host) return ''
  const proto = headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'] || 'https'
  return `${proto}://${host}/.netlify/functions/diagnostic-photo?key=${encodeURIComponent(key)}`
}

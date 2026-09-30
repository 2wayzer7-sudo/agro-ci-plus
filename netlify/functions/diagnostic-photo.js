/* ============================================================
   FONCTION SERVEURLESS — sert une photo de diagnostic (Netlify Blobs)
   ============================================================
   Un blob Netlify n'a pas d'URL publique : Slack ne peut l'afficher que
   s'il existe une URL HTTP que ses serveurs savent télécharger. Cette
   fonction EST cette URL — appelée par Slack avec la clé communicate dans
   le message, jamais par un utilisateur.

   Conséquence sur la vie privée : la photo est servie à quiconque détient
   le lien. La clé (horodatage + UUID v4) est donc la seule protection, ce
   qui est la pratique admise pour une URL de capacité. Le store est
   strictement borné : seule la forme exacte de clé produite par
   `netlify/lib/photos.js` est acceptée, ce qui interdit de lire une autre
   clé du site.

   Style Web (Request -> Response) et non Lambda : une réponse binaire se
   construit nativement avec `new Response(arrayBuffer)`, sans passer par
   un base64. Le contexte Blobs est injecté automatiquement dans ce mode
   (contrairement au mode Lambda, où il faut appeler `connectLambda`), d'où
   l'absence de cette fonction dans `send-diagnostic.js`.
   ============================================================ */

import { getStore } from '@netlify/blobs'
import { PHOTO_STORE, contentTypeFor, isValidPhotoKey } from '../lib/photos.js'

/* La clé est unique et immuable : le cache peut être long. */
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=31536000, immutable' }

export default async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Méthode non autorisée', { status: 405, headers: { Allow: 'GET' } })
  }

  const key = new URL(request.url).searchParams.get('key') ?? ''
  if (!isValidPhotoKey(key)) {
    return new Response('Clé invalide', { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  let data
  try {
    data = await getStore(PHOTO_STORE).get(key, { type: 'arrayBuffer' })
  } catch {
    return new Response('Photo indisponible', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!data) {
    return new Response('Photo introuvable', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  return new Response(data, {
    headers: { 'Content-Type': contentTypeFor(key), ...CACHE_HEADERS }
  })
}

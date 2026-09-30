/* ============================================================
   ENVOI DES DIAGNOSTICS — chaîne de repli
   ============================================================
   Vérifie le vrai module `src/services/diagnosticService.js` avec un
   `fetch` simulé, sans navigateur ni webhook configuré.

   Le point critique est le 404 : la route `/api/send-diagnostic` peut
   être servie par le catch-all SPA d'un hébergeur (200 + index.html) ou
   ne pas exister du tout (404). Dans les deux cas, l'app doit dire
   « non configuré » — jamais « envoyé », ce qui ferait croire au planteur
   que sa photo est partie chez l'équipe alors qu'elle est restée dans son
   téléphone.

   Chaque scénario réimporte le module (`?v=n`) : le service mémorise
   « relais absent » pour la session, il faut donc un état neuf à chaque
   fois.
   ============================================================ */

const results = []

function check(label, got, want) {
  const ok = got === want
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} -> ${got}${ok ? '' : `   attendu: ${want}`}`)
}

/* Réponse minimale : le service ne lit que `ok`, `status` et `text()`. */
function reply({ ok = true, status = 200, body = '' } = {}) {
  return { ok, status, text: async () => body }
}

let calls = []

/* `handler` reçoit (url, options) et répond. Une URL sans handler fait
   échouer le test : aucune requête ne doit partir ailleurs que prévu. */
function mockFetch(handler) {
  calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: options?.body })
    if (!handler) throw new Error(`requête inattendue vers ${url}`)
    return handler(String(url), options)
  }
}

const NOTE = 'feuilles tachées de brun'
const PLACE = 'Daloa'
const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/C000'
const VERSION = { v: 0 }
const freshModule = () => import(`./src/services/diagnosticService.js?v=${++VERSION.v}`)

/* ---------- 1. Le relais fonctionne ---------- */
{
  mockFetch(() => reply({ body: JSON.stringify({ ok: true, photoPublished: true }) }))
  const { sendDiagnosticToSlack } = await freshModule()
  const result = await sendDiagnosticToSlack('', NOTE, PLACE)

  check('relais OK : envoi réussi', result.success, true)
  check('relais OK : photo publiée relayée', result.photoPublished, true)
  check('relais OK : une seule requête', calls.length, 1)
  check('relais OK : route même origine', calls[0].url, '/api/send-diagnostic')
  /* Le relais ne doit jamais recevoir de blocs Slack forgés par le client. */
  const sent = JSON.parse(calls[0].body)
  check('relais OK : contenu seul, pas de blocks', sent.blocks, undefined)
  check('relais OK : note transmise', sent.note, NOTE)
}

/* ---------- 2. 404 : la fonction n'est pas déployée ---------- */
{
  mockFetch(() => reply({ ok: false, status: 404, body: 'Not Found' }))
  const { sendDiagnosticToSlack } = await freshModule()
  const result = await sendDiagnosticToSlack('', NOTE, PLACE)

  check('404 : PAS de faux succès', result.success, false)
  check('404 : motif non configuré', result.failure, 'not_configured')
  check('404 : pas de second chemin (build sans webhook)', calls.length, 1)
}

/* ---------- 3. Le catch-all SPA renvoie index.html en 200 ---------- */
{
  mockFetch(() => reply({ body: '<!doctype html><html>AgroCI+</html>' }))
  const { sendDiagnosticToSlack } = await freshModule()
  const result = await sendDiagnosticToSlack('', NOTE, PLACE)

  check('200 HTML : PAS de faux succès', result.success, false)
  check('200 HTML : motif non configuré', result.failure, 'not_configured')
}

/* ---------- 4. 503 : la fonction répond mais aucun webhook n'est configuré ---------- */
{
  mockFetch(() => reply({ ok: false, status: 503, body: JSON.stringify({ error: 'not_configured' }) }))
  const { sendDiagnosticToSlack } = await freshModule()
  const result = await sendDiagnosticToSlack('', NOTE, PLACE)

  check('503 : motif non configuré', result.failure, 'not_configured')
  check('503 : PAS de faux succès', result.success, false)
}

/* ---------- 5. Le relais absent est mémorisé pour la session ---------- */
{
  mockFetch(() => reply({ ok: false, status: 404, body: 'Not Found' }))
  const { sendDiagnosticToSlack } = await freshModule()
  await sendDiagnosticToSlack('', NOTE, PLACE)
  await sendDiagnosticToSlack('', 'autre note', PLACE)

  check('mémorisation : un seul 404 pour toute la session', calls.length, 1)
}

/* ---------- 6. Payload refusé : inutile d'insister ailleurs ---------- */
{
  mockFetch(() => reply({ ok: false, status: 413, body: JSON.stringify({ error: 'payload_too_large' }) }))
  const { sendDiagnosticToSlack } = await freshModule()
  const result = await sendDiagnosticToSlack('data:image/jpeg;base64,Zm9v', NOTE, PLACE)

  check('413 : motif payload', result.failure, 'payload')
  check('413 : pas de relance', calls.length, 1)
}

/* ---------- 7. Rien à transmettre : aucun aller-retour ---------- */
{
  mockFetch(null)
  const { sendDiagnosticToSlack } = await freshModule()
  const result = await sendDiagnosticToSlack('', '   ', '')

  check('payload vide : refusé sans requête', result.failure, 'payload')
  check('payload vide : zéro requête', calls.length, 0)
}

/* ---------- 8. Hors connexion : la file attend ---------- */
{
  mockFetch(null)
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true })
  const { sendDiagnosticToSlack } = await freshModule()
  const result = await sendDiagnosticToSlack('', NOTE, PLACE)
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true })

  check('hors ligne : motif offline', result.failure, 'offline')
  check('hors ligne : zéro requête', calls.length, 0)
}

/* ---------- 9. Repli direct : le webhook est appelé et le message part ---------- */
{
  mockFetch(() => reply({ body: 'ok' }))
  const { attemptWebhook } = await freshModule()
  const result = await attemptWebhook({
    note: NOTE,
    place: PLACE,
    ai: { available: false },
    photoUrl: '',
    capturedAt: Date.UTC(2026, 0, 15, 8, 30),
    webhookUrl: WEBHOOK
  })

  check('repli direct : envoi réussi', result.ok, true)
  check('repli direct : poste sur hooks.slack.com', calls[0].url, WEBHOOK)
  check('repli direct : photo non publiée', result.photoPublished, false)

  const blocks = JSON.parse(calls[0].body).blocks
  check('repli direct : Block Kit rendu', blocks[0].text.text, '🧪 Diagnostic cacao / café')
  check('repli direct : localité dans le contexte', blocks[1].elements[0].text.includes(PLACE), true)
  check('repli direct : pas de lien mort', blocks.some((block) => block.type === 'image'), false)
}

/* ---------- 10. Repli direct : Slack refuse ---------- */
{
  mockFetch(() => reply({ body: 'invalid_payload' }))
  const { attemptWebhook } = await freshModule()
  const result = await attemptWebhook({
    note: NOTE, place: PLACE, ai: { available: false }, photoUrl: '', capturedAt: Date.now(), webhookUrl: WEBHOOK
  })

  check('Slack refuse : échec', result.ok, false)
  check('Slack refuse : motif serveur', result.failure, 'server')
  check('Slack refuse : message cité', result.message.includes('invalid_payload'), true)
}

/* ---------- 11. Repli direct : webhook révoqué ---------- */
{
  mockFetch(() => reply({ ok: false, status: 404, body: 'no_team' }))
  const { attemptWebhook } = await freshModule()
  const result = await attemptWebhook({
    note: NOTE, place: PLACE, ai: { available: false }, photoUrl: '', capturedAt: Date.now(), webhookUrl: WEBHOOK
  })

  /* 404 ici vient de Slack, pas d'une fonction absente : le dire
     « non configuré » évite une boucle de réessais sur une cause qui ne
     se corrigera pas toute seule. */
  check('webhook révoqué : motif non configuré', result.failure, 'not_configured')
  check('webhook révoqué : échec', result.ok, false)
}

/* ---------- 12. Repli direct : réseau coupé ---------- */
{
  mockFetch(() => { throw Object.assign(new Error('offline'), { name: 'TypeError' }) })
  const { attemptWebhook } = await freshModule()
  const result = await attemptWebhook({
    note: NOTE, place: PLACE, ai: { available: false }, photoUrl: '', capturedAt: Date.now(), webhookUrl: WEBHOOK
  })

  check('repli direct : réseau coupé', result.failure, 'network')
  check('repli direct : échec annoncé', result.ok, false)
}

console.log('')
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} verifications reussies`)
process.exit(passed === results.length ? 0 : 1)

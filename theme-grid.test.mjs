/* Harness temporaire : charge le VRAI src/hooks/useTheme.js sous un
   DOM simulé, sans React (le module n'utilise useSyncExternalStore
   qu'au moment du rendu d'un composant, jamais au chargement). */
const results = []

function check(label, got, want) {
  const ok = got === want
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} -> ${got}${ok ? '' : `   attendu: ${want}`}`)
}

function makeEnv({ stored, legacy, systemDark }) {
  const ls = new Map()
  if (stored !== undefined) ls.set('theme', stored)
  if (legacy !== undefined) ls.set('agroci:theme', legacy)
  const listeners = new Set()
  const dark = { media: '(prefers-color-scheme: dark)', matches: systemDark, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  const other = { media: 'x', matches: false, addEventListener() {}, removeEventListener() {} }
  globalThis.window = {
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: (k) => ls.delete(k)
    },
    matchMedia: (q) => (q === '(prefers-color-scheme: dark)' ? dark : other)
  }
  const root = {
    attrs: {},
    getAttribute(k) { return this.attrs[k] ?? null },
    setAttribute(k, v) { this.attrs[k] = v }
  }
  globalThis.document = { documentElement: root }
  return { ls, dark, root, fire: (matches) => { dark.matches = matches; listeners.forEach((fn) => fn({ matches })) } }
}

const { resolveTheme, applyTheme, storeTheme, DEFAULT_THEME } = await import('./src/hooks/useTheme.js')

console.log(`DEFAULT_THEME exporte = ${JSON.stringify(DEFAULT_THEME)}`)
console.log('')

/* --- GRILLE DEMANDEE : 4 cas --- */
let env = makeEnv({ systemDark: false })
check('1. 1er acces, aucun storage, systeme CLAIR', resolveTheme(), 'light')

env = makeEnv({ systemDark: true })
check('2. 1er acces, aucun storage, systeme SOMBRE', resolveTheme(), 'dark')

env = makeEnv({ stored: 'light', systemDark: true })
check('3. choix manuel light, systeme SOMBRE', resolveTheme(), 'light')

env = makeEnv({ stored: 'dark', systemDark: false })
check('4. choix manuel dark, systeme CLAIR', resolveTheme(), 'dark')

console.log('')

/* --- ETAT INITIAL --- */
env = makeEnv({ systemDark: false })
check('etat initial sans storage, systeme clair', env.root.getAttribute('data-theme') ?? resolveTheme(), 'light')

/* --- DOM : data-theme pose sur <html> --- */
env = makeEnv({ systemDark: true })
applyTheme(resolveTheme())
check('data-theme ecrit sur documentElement', env.root.getAttribute('data-theme'), 'dark')

/* --- PERSISTANCE : toggle ecrit immediatement --- */
env = makeEnv({ systemDark: false })
storeTheme('dark')
check('storeTheme ecrit dans localStorage', env.ls.get('theme'), 'dark')
check('valeur invalide refusee', (storeTheme('nuit'), env.ls.get('theme')), 'dark')

/* --- MIGRATION DE LA CLE LEGACY --- */
env = makeEnv({ legacy: 'dark', systemDark: false })
check('legacy agroci:theme lu', resolveTheme(), 'dark')
check('migre vers la cle theme', env.ls.get('theme'), 'dark')
check('ancienne cle supprimee', env.ls.get('agroci:theme'), undefined)

/* --- SYNC DYNAMIQUE : le systeme bascule en direct --- */
env = makeEnv({ systemDark: false })
check('avant bascule systeme (aucun choix)', resolveTheme(), 'light')
env.fire(true)
check('systeme passe en SOMBRE sans rechargement', resolveTheme(), 'dark')
env.fire(false)
check('systeme repasse en CLAIR sans rechargement', resolveTheme(), 'light')

/* --- LE CHOIX MANUEL BLOQUE LE SYSTEME --- */
env = makeEnv({ stored: 'light', systemDark: false })
env.fire(true)
check('choix manuel light : systeme sombre IGNORE', resolveTheme(), 'light')
env.fire(true)
check('systeme sombre repete : toujours light', resolveTheme(), 'light')

env = makeEnv({ stored: 'dark', systemDark: true })
env.fire(false)
check('choix manuel dark : systeme clair IGNORE', resolveTheme(), 'dark')

/* --- VALEUR INVALIDE EN STORAGE --- */
env = makeEnv({ stored: 'neon', systemDark: true })
check('storage corrompu : fallback systeme sombre', resolveTheme(), 'dark')
env = makeEnv({ stored: 'neon', systemDark: false })
check('storage corrompu : fallback systeme clair', resolveTheme(), 'light')

/* --- LOCALSTORAGE INDISPONIBLE (navigation privee) --- */
globalThis.window = { matchMedia: (q) => ({ matches: q === '(prefers-color-scheme: dark)', addEventListener() {}, removeEventListener() {} }) }
globalThis.document = { documentElement: { attrs: {}, getAttribute(k) { return this.attrs[k] ?? null }, setAttribute(k, v) { this.attrs[k] = v } } }
check('stockage bloque, systeme sombre : pas de crash', resolveTheme(), 'dark')
check('stockage bloque, stockage theme : pas de crash', storeTheme('light'), undefined)

console.log('')
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} verifications reussies`)
process.exit(passed === results.length ? 0 : 1)

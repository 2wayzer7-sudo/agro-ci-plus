/* Vérifie que le bootstrap INLINE d'index.html (extrait du fichier réel)
   décide exactement comme src/hooks/useTheme.js. Une divergence entre les
   deux provoquerait un flash de mauvaise matière au chargement. */
import { readFileSync } from 'node:fs'

const html = readFileSync('index.html', 'utf8')
const script = html.match(/<script>([\s\S]*?)<\/script>/)
if (!script) {
  console.error('script inline introuvable')
  process.exit(1)
}
const bootstrap = new Function('window', 'document', script[1])

function runInline(store, systemDark) {
  const ls = new Map(store)
  const win = {
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: (k) => ls.delete(k)
    },
    matchMedia: (q) => ({ matches: q === '(prefers-color-scheme: dark)' ? systemDark : false })
  }
  const root = {
    attrs: {},
    getAttribute(k) { return this.attrs[k] ?? null },
    setAttribute(k, v) { this.attrs[k] = v }
  }
  bootstrap(win, { documentElement: root })
  return { applied: root.getAttribute('data-theme'), ls }
}

const mod = await import('./src/hooks/useTheme.js')

function runModule(store, systemDark) {
  const ls = new Map(store)
  const root = {
    attrs: {},
    getAttribute(k) { return this.attrs[k] ?? null },
    setAttribute(k, v) { this.attrs[k] = v }
  }
  globalThis.window = {
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: (k) => ls.delete(k)
    },
    matchMedia: (q) => ({ matches: q === '(prefers-color-scheme: dark)' ? systemDark : false })
  }
  return { applied: mod.resolveTheme(), ls }
}

const cases = [
  [[], false, 'light'],
  [[], true, 'dark'],
  [[['theme', 'light']], true, 'light'],
  [[['theme', 'dark']], false, 'dark'],
  [[['agroci:theme', 'dark']], false, 'dark'],
  [[['agroci:theme', 'light']], true, 'light'],
  [[['theme', 'neon']], true, 'dark'],
  [[['theme', 'neon']], false, 'light']
]

let pass = 0
for (const [store, dark, want] of cases) {
  const a = runInline(store, dark)
  const b = runModule(store, dark)
  const agree = a.applied === b.applied && b.applied === want
  const key = store.length ? store[0][0] : '(aucun)'
  const val = store.length ? store[0][1] : ''
  if (agree) pass++
  console.log(
    `${agree ? 'PASS' : 'FAIL'}  storage=${key}${val ? '=' + val : ''}`.padEnd(46) +
    `systeme=${(dark ? 'sombre' : 'clair').padEnd(7)}inline=${a.applied.padEnd(6)}module=${b.applied.padEnd(6)}attendu=${want}`
  )
  if (a.ls.get('theme') !== b.ls.get('theme')) {
    console.log(`      DIVERGENCE DE MIGRATION: inline=${a.ls.get('theme')} module=${b.ls.get('theme')}`)
  }
}
console.log('')
console.log(`${pass}/${cases.length} bootstrap inline et module concordent`)
process.exit(pass === cases.length ? 0 : 1)

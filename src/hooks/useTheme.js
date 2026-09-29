import { useCallback, useSyncExternalStore } from 'react'

/* Moteur de thème à source unique.
 *
 * L'état vit au niveau du module, pas dans chaque composant. Trois
 * écransmontent chacun un ThemeToggle : avec un useState local, on
 * aurait trois copies de l'état et trois abonnements à matchMedia qui
 * se désynchronisent. useSyncExternalStore lit la source unique, donc
 * tous les toggles affichent le même état et il n'y a qu'un écouteur.
 *
 * Clé de stockage : 'theme' (canonique). L'ancienne clé
 * 'agroci:theme' est lue une fois puis migrée, pour qu'un planteur
 * qui avait déjà choisi son thème ne se retrouve pas replacé sur la
 * préférence système.
 */

const STORAGE_KEY = 'theme'
const LEGACY_STORAGE_KEY = 'agroci:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const THEMES = ['light', 'dark']

/* Papier Tactile est la valeur initiale de l'état. La résolution
   ci-dessous peut ensuite basculer en Bioluminescent si l'appareil
   demande explicitement le mode sombre : l'état de départ reste
   'light', c'est la préférence système qui décide ensuite. */
export const DEFAULT_THEME = 'light'

function storage() {
  try {
    return window.localStorage
  } catch {
    /* navigation privée iOS, iframe sandbox : stockage indisponible */
    return null
  }
}

/* Choix manuel explicite, ou null si le planteur n'en a pas fait. */
function readStoredTheme() {
  const store = storage()
  if (!store) return null
  try {
    const stored = store.getItem(STORAGE_KEY)
    if (THEMES.includes(stored)) return stored
    const legacy = store.getItem(LEGACY_STORAGE_KEY)
    if (THEMES.includes(legacy)) {
      /* migration transparente, une seule fois */
      store.setItem(STORAGE_KEY, legacy)
      store.removeItem(LEGACY_STORAGE_KEY)
      return legacy
    }
  } catch {
    /* quota atteint ou lecture refusée */
  }
  return null
}

function systemTheme() {
  try {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
  } catch {
    return DEFAULT_THEME
  }
}

/* Préférence manuelle > préférence système > défaut clair. */
export function resolveTheme() {
  return readStoredTheme() ?? systemTheme()
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme)
}

/* n'écrit jamais une valeur hors palette : une entrée corrompue dans
   localStorage ferait basculer le prochain démarrage sur une matière
   inexistante, dont aucune règle CSS ne définit les couleurs. */
export function storeTheme(theme) {
  if (!THEMES.includes(theme)) return
  const store = storage()
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, theme)
  } catch {
    /* le thème s'applique quand même, il ne sera pas mémorisé */
  }
}

/* ---- source unique d'état ---- */

let currentTheme = DEFAULT_THEME
let initialized = false
const listeners = new Set()

function getSnapshot() {
  return currentTheme
}

function setTheme(next) {
  if (!THEMES.includes(next) || next === currentTheme) return
  currentTheme = next
  applyTheme(next)
  listeners.forEach((listener) => listener())
}

/* MediaQueryList.addEventListener manque sur les WebView Android
   antérieurs à Chrome 84 : repli sur l'API dépréciée. */
function subscribe(query, onChange) {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }
  query.addListener(onChange)
  return () => query.removeListener(onChange)
}

function initialize() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  currentTheme = resolveTheme()
  applyTheme(currentTheme)

  const query = window.matchMedia(DARK_QUERY)
  subscribe(query, (event) => {
    /* Un choix manuel prime TOUJOURS : on n'écoute le système que si
       le planteur n'a jamais tranché lui-même. */
    if (readStoredTheme()) return
    setTheme(event.matches ? 'dark' : 'light')
  })
}

/* Initialisation au chargement du module : currentTheme est donc
   déjà juste avant le tout premier rendu, sans dépendre du premier
   composant qui consomme le thème. */
if (typeof window !== 'undefined') initialize()

export function useTheme() {
  /* Sécurité pour un import tardif : idempotent. */
  initialize()

  const theme = useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange)
      return () => listeners.delete(onStoreChange)
    },
    getSnapshot
  )

  const toggleTheme = useCallback(() => {
    const next = getSnapshot() === 'dark' ? 'light' : 'dark'
    storeTheme(next)
    setTheme(next)
  }, [])

  const selectTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return
    storeTheme(next)
    setTheme(next)
  }, [])

  return { theme, setTheme: selectTheme, toggleTheme }
}

export default useTheme

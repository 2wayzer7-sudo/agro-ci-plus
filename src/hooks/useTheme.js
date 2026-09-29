import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'agroci:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const THEMES = ['light', 'dark']

/* localStorage peut être bloqué (navigation privée iOS, iframe sandbox,
   quota atteint) : toute lecture/écriture est encapsulée. */
function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(stored) ? stored : null
  } catch {
    return null
  }
}

function systemTheme() {
  try {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/* Préférence utilisateur > préférence système. */
export function resolveTheme() {
  return readStoredTheme() ?? systemTheme()
}

export function applyTheme(theme) {
  const root = document.documentElement
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme)
}

export function storeTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* le thème s'applique quand même, il ne sera simplement pas mémorisé */
  }
}

/* MediaQueryList.addEventListener n'existe pas sur les WebView Android
   antérieurs à Chrome 84 : on retombe sur l'API dépréciée. */
function subscribe(query, onChange) {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }
  query.addListener(onChange)
  return () => query.removeListener(onChange)
}

export function useTheme() {
  const [theme, setTheme] = useState(resolveTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onSystemChange = (event) => {
      if (readStoredTheme()) return
      setTheme(event.matches ? 'dark' : 'light')
    }
    return subscribe(query, onSystemChange)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      storeTheme(next)
      return next
    })
  }, [])

  return { theme, setTheme, toggleTheme }
}

export default useTheme

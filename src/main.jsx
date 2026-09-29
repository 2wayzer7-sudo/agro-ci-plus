import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { applyTheme, resolveTheme } from './hooks/useTheme'
import './index.css'

/* Reprend l'amorçage d'index.html et écoute le système : le thème suit
   la préférence en direct, sauf si l'utilisateur l'a verrouillée. */
applyTheme(resolveTheme())
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (event) => {
  try {
    if (window.localStorage.getItem('agroci:theme')) return
  } catch (error) {
    /* stockage indisponible : on suit le système */
  }
  applyTheme(event.matches ? 'dark' : 'light')
})

/* Le Service Worker n'est enregistré que sur un contexte sécurisé
   (HTTPS, ou localhost en développement). Hors HTTPS, l'app reste
   pleinement fonctionnelle en ligne — seule la capacité hors-ligne
   est indisponible, ce qui vaut mieux qu'une exception au chargement. */
if (window.isSecureContext || import.meta.env.DEV) {
  registerSW({ immediate: true })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
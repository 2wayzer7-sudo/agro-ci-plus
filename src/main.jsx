import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { applyTheme, resolveTheme } from './hooks/useTheme'
import './index.css'

/* Reprend l'amorçage d'index.html au cas où le script inline aurait été
   neutralisé (CSP stricte, extension). L'écoute de la préférence
   système et le verrouillage par choix manuel sont gérés au niveau du
   module useTheme : on ne duplique ni l_abonnement ni la lecture du
   stockage ici, sinon deux écouteurs se désynchroniseraient. */
applyTheme(resolveTheme())

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
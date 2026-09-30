import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import SyncIndicator from '../components/SyncIndicator'
import ThemeToggle from '../components/ThemeToggle'
import { useDiagnostics } from '../hooks/useDiagnostics'
import { usePrices } from '../hooks/usePrices'
import { listenForSyncMessages } from '../sync'
import { DIAGNOSTIC_STATUS, IA_UNAVAILABLE } from '../services/diagnosticService'

/* Les « fiches de terrain » (src/data/advice.js) ne sont plus rendues ici :
   l'écran ne sert plus qu'à photographier et suivre ses envois. Le contenu
   reste dans le dépôt — le retirer de l'UI n'est pas le supprimer. */

function formatDiagnosticDate(timestamp) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

/* Libellés d'état. Un état par statut réel : `sending` signifie « la
   requête est partie », jamais « on va essayer ». */
const STATUS_LABELS = {
  [DIAGNOSTIC_STATUS.PENDING]: { icon: '⏳', text: 'En attente d’envoi', className: 'status pending' },
  [DIAGNOSTIC_STATUS.SENDING]: { icon: '🔄', text: 'Traitement en cours...', className: 'status sending' },
  [DIAGNOSTIC_STATUS.SENT]: { icon: '✅', text: 'Envoyé', className: 'status sent' }
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? { icon: '⏳', text: 'En attente d’envoi', className: 'status pending' }
}

/* Vignette : l'URL d'objet est créée UNE fois par photo puis révoquée au
   changement et au démontage. Appeler `URL.createObjectURL` directement
   dans le rendu créait une URL à chaque rendu, jamais libérée — un leak
   qui vide la mémoire d'un téléphone après quelques photos. */
function DiagnosticThumb({ image }) {
  const [objectUrl, setObjectUrl] = useState('')

  useEffect(() => {
    if (!(image instanceof Blob)) {
      setObjectUrl('')
      return undefined
    }
    const url = URL.createObjectURL(image)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  if (!objectUrl) return null
  return <img src={objectUrl} alt="" />
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      const ratio = Math.min(1, 1024 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * ratio)
      canvas.height = Math.round(image.height * ratio)
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl)
        if (blob) resolve(blob)
        else reject(new Error('compression'))
      }, 'image/jpeg', 0.7)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('image'))
    }
    image.src = objectUrl
  })
}

function DiagnosticScreen() {
  const inputRef = useRef(null)
  const [note, setNote] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const { diagnostics, pendingCount, sendingCount, saveDiagnostic, sendNow, isSending, message: sendMessage, error, notice, reload } = useDiagnostics()
  /* La localité vient du hook prix : c'est la ville que le planteur a
     lui-même déclarée, exactement celle affichée dans le badge. */
  const { localityName } = usePrices()

  useEffect(() => listenForSyncMessages(reload), [reload])

  async function handlePhoto(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setIsProcessing(true)
    setMessage('')
    try {
      const compressed = await compressImage(file)
      /* La localité et le pré-diagnostic sont figés ici : le message
         envoyé à Slack doit décrire CETTE photo, pas la ville sélectionnée
         cinq minutes plus tard. */
      const result = await saveDiagnostic({
        image: compressed,
        note,
        location: localityName,
        aiResult: IA_UNAVAILABLE
      })
      if (result.success) {
        setNote('')
        setMessage('Photo enregistrée dans vos diagnostics.')
      }
    } catch {
      setMessage('La photo n’a pas pu être préparée. Réessayez.')
    } finally {
      setIsProcessing(false)
      event.target.value = ''
    }
  }

  /* Le bouton ne ment jamais sur la suite : soit l'envoi a réussi, soit il
     est programmé, soit le canal n'est pas configuré. Le hook a déjà
     écrit le message exact dans `error` / `sendMessage`. */
  const handleSendNow = useCallback(() => {
    sendNow()
  }, [sendNow])

  return (
    <section className="screen">
      <header className="simple-header">
        <div>
          <p className="kicker">Accompagnement du champ</p>
          <h1>Diagnostic maladies</h1>
        </div>
        <div className="header-cluster">
          <span className="header-leaf">✦</span>
          <ThemeToggle />
        </div>
      </header>
      <p className="screen-description">Photographiez une feuille ou une cabosse pour garder une trace et demander conseil plus tard.</p>
      <SyncIndicator count={pendingCount} sending={sendingCount} />
      <div className="capture-card leaf-card">
        <div className="camera-illustration" aria-hidden="true">⌁</div>
        <h2>Un doute sur votre plante ?</h2>
        <p>Une image nette, prise de près, aide à mieux observer.</p>
        <motion.button className="primary-button camera-button" type="button" whileTap={{ scale: 0.97 }} onClick={() => inputRef.current?.click()} disabled={isProcessing}>
          {isProcessing ? 'Préparation de la photo…' : '📸 Photographier une cabosse/feuille'}
        </motion.button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
        <label className="note-label">
          Note du planteur <span className="optional">(facultatif)</span>
          <textarea rows="2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ce que vous avez observé…" />
        </label>
      </div>
      {message && <p className="success-message" role="status">{message}</p>}
      {sendMessage && <p className="success-message" role="status">{sendMessage}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="section-heading">
        <div>
          <span className="eyebrow">Votre historique</span>
          <h2>Diagnostics enregistrés</h2>
        </div>
        {pendingCount > 0 && (
          <button type="button" className="outline-button" onClick={handleSendNow} disabled={isSending}>
            {isSending ? 'Traitement en cours…' : 'Envoyer maintenant'}
          </button>
        )}
      </div>
      <div className="diagnostic-list">
        {diagnostics.length === 0 ? (
          <div className="empty-state">Vos photos apparaîtront ici, même sans connexion.</div>
        ) : diagnostics.map((diagnostic) => {
          const status = statusLabel(diagnostic.status)
          return (
            <article className="diagnostic-item" key={diagnostic.id}>
              <div className="diagnostic-thumb">
                <DiagnosticThumb image={diagnostic.image} />
              </div>
              <div className="diagnostic-meta">
                <strong>Photo du {formatDiagnosticDate(diagnostic.createdAt)}</strong>
                {diagnostic.location && <span className="diagnostic-place">📍 {diagnostic.location}</span>}
                {diagnostic.note && <p>{diagnostic.note}</p>}
                <span className={status.className}>
                  {status.icon} {status.text}
                </span>
                {/* Dernier motif d'échec : un planteur hors ligne doit
                    comprendre pourquoi sa photo n'est toujours pas partie. */}
                {diagnostic.status === DIAGNOSTIC_STATUS.PENDING && diagnostic.lastError && (
                  <span className="diagnostic-reason">{diagnostic.lastError}</span>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default DiagnosticScreen
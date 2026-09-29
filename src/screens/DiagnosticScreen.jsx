import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import SyncIndicator from '../components/SyncIndicator'
import ThemeToggle from '../components/ThemeToggle'
import { useDiagnostics } from '../hooks/useDiagnostics'
import { adviceSheets } from '../data/advice'
import { listenForSyncMessages } from '../sync'

function formatDiagnosticDate(timestamp) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(timestamp)
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
  const [openSheet, setOpenSheet] = useState(null)
  const { diagnostics, pendingCount, saveDiagnostic, sendNow, error, notice, reload } = useDiagnostics()

  useEffect(() => listenForSyncMessages(reload), [reload])

  async function handlePhoto(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setIsProcessing(true)
    setMessage('')
    try {
      const compressed = await compressImage(file)
      const result = await saveDiagnostic({ image: compressed, note })
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

  async function handleSendNow() {
    const result = await sendNow()
    if (result.success) setMessage('L’envoi sera effectué dès qu’une connexion sera disponible.')
  }

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
      <SyncIndicator count={pendingCount} />
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
      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="section-heading">
        <div>
          <span className="eyebrow">Fiches de terrain</span>
          <h2>Que faire en cas de doute ?</h2>
        </div>
        <span className="entry-count">Hors ligne</span>
      </div>
      <div className="advice-list">
        {adviceSheets.map((sheet) => {
          const isOpen = openSheet === sheet.id
          return (
            <article className="advice-card" key={sheet.id}>
              <button
                type="button"
                className="advice-trigger"
                aria-expanded={isOpen}
                onClick={() => setOpenSheet(isOpen ? null : sheet.id)}
              >
                <span className="advice-glyph" aria-hidden="true">{sheet.icon}</span>
                <span className="advice-title">
                  <strong>{sheet.disease}</strong>
                  <span>{sheet.agent}</span>
                </span>
                <span className={`advice-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    className="advice-body"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.6, 1] }}
                  >
                    <p className="advice-symptoms"><strong>Signes :</strong> {sheet.symptoms}</p>
                    <ol className="advice-actions">
                      {sheet.actions.map((action) => <li key={action}>{action}</li>)}
                    </ol>
                    <p className="advice-warning">{sheet.warning}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </article>
          )
        })}
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Votre historique</span>
          <h2>Diagnostics enregistrés</h2>
        </div>
        {pendingCount > 0 && <button type="button" className="outline-button" onClick={handleSendNow}>Envoyer maintenant</button>}
      </div>
      <div className="diagnostic-list">
        {diagnostics.length === 0 ? (
          <div className="empty-state">Vos photos apparaîtront ici, même sans connexion.</div>
        ) : diagnostics.map((diagnostic) => (
          <article className="diagnostic-item" key={diagnostic.id}>
            <div className="diagnostic-thumb">
              {diagnostic.image && <img src={URL.createObjectURL(diagnostic.image)} alt="" />}
            </div>
            <div className="diagnostic-meta">
              <strong>Photo du {formatDiagnosticDate(diagnostic.createdAt)}</strong>
              {diagnostic.note && <p>{diagnostic.note}</p>}
              <span className={diagnostic.status === 'pending' ? 'status pending' : 'status sent'}>
                {diagnostic.status === 'pending' ? '⏳ En attente d’envoi' : '✅ Envoyé'}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default DiagnosticScreen
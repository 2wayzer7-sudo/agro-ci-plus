import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { SEASON_CROPS, SEASON_THEMES, SEASON_TIPS, tipOfTheDay } from '../data/season'
import { useCalendarReminders } from '../hooks/useCalendarReminders'

/* Libellé du bouton de rappels : l'état est porté par la couleur de la
   pastille ET par le libellé, car un bouton désactivé sans raison
   lisible est un piège pour l'utilisateur. */
function reminderLabel({ supported, status, enabled, dueCount }) {
  if (!supported) return '🔔 Rappels indisponibles'
  if (status === 'pending') return '🔔 Demande en cours…'
  if (status === 'denied') return '🔔 Rappels bloqués'
  if (enabled) return dueCount > 0 ? `🔔 Rappels activés · ${dueCount} en attente` : '🔔 Rappels activés'
  return '🔔 Activer les rappels'
}

function statusMessage({ supported, status, dueCount }) {
  if (!supported) return 'Ce navigateur ne gère pas les notifications.'
  if (status === 'denied') return 'Notifications bloquées : autorisez-les dans les réglages du navigateur.'
  if (status === 'inactive') return 'Notifications non accordées : activez-les depuis les réglages du site.'
  if (status === 'active') return `Rappels activés sur ${dueCount} cycle${dueCount > 1 ? 's' : ''} agronomique${dueCount > 1 ? 's' : ''}.`
  return ''
}

function AgriculturalCalendar() {
  const [theme, setTheme] = useState('calendrier')
  const [crop, setCrop] = useState('all')
  const reminders = useCalendarReminders()

  /* Rotation quotidienne stable : le conseil ne change pas d'une carte à
     l'autre d'un simple re-rendu (ce qui se produirait avec un tirage au
     sort dans le rendu). */
  const dailyTip = useMemo(() => tipOfTheDay(), [])

  const visibleTips = useMemo(
    () => SEASON_TIPS.filter((tip) => tip.theme === theme && (crop === 'all' || tip.crop === crop)),
    [theme, crop]
  )

  const label = reminderLabel(reminders)
  const message = statusMessage(reminders)

  return (
    <section className="leaf-card season-calendar" aria-label="Calendrier saisonnier et conseils cacao, café">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Calendrier de campagne</span>
          <h2>Saison &amp; conseils</h2>
        </div>
        <span className="calendar-glyph" aria-hidden="true">🌱</span>
      </div>

      {/* Conseil du jour : toujours affiché, filtres ou non — il suit sa
          propre rotation quotidienne. */}
      <div className="daily-tip">
        <span className="eyebrow">Conseil du jour</span>
        <strong>{dailyTip.title}</strong>
        <span className="calendar-period">{dailyTip.period}</span>
        <p>{dailyTip.body}</p>
      </div>

      <div className="chip-row" role="group" aria-label="Filtrer par thématique">
        {SEASON_THEMES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === theme ? 'chip is-selected' : 'chip'}
            aria-pressed={item.id === theme}
            onClick={() => setTheme(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      <div className="chip-row" role="group" aria-label="Filtrer par culture">
        {SEASON_CROPS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === crop ? 'chip is-selected' : 'chip'}
            aria-pressed={item.id === crop}
            onClick={() => setCrop(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ul className="calendar-list">
        {visibleTips.map((tip) => (
          <li key={tip.id} className="calendar-item">
            <div className="calendar-item-head">
              <strong>{tip.title}</strong>
              <span className={`crop-tag is-${tip.crop}`}>{tip.crop === 'cacao' ? 'Cacao' : 'Café'}</span>
            </div>
            <span className="calendar-period">{tip.period}</span>
            <p>{tip.body}</p>
          </li>
        ))}
      </ul>

      <div className="reminder-row">
        <motion.button
          type="button"
          className="outline-button"
          onClick={reminders.activate}
          disabled={!reminders.supported || reminders.status === 'pending' || reminders.enabled}
          whileTap={{ scale: 0.97 }}
        >
          {label}
        </motion.button>
        {message && <p className="entry-count" role="status">{message}</p>}
      </div>
    </section>
  )
}

export default AgriculturalCalendar

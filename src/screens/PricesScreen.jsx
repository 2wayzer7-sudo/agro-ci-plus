import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import PriceCard from '../components/PriceCard'
import ThemeToggle from '../components/ThemeToggle'
import { db } from '../db'
import { useNotifications } from '../hooks/useNotifications'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { usePrices } from '../hooks/usePrices'

/* Le calculateur reste 100% local : il lit le prix du jour dans le
   tableau déjà en mémoire (usePrices) et n'émet aucune requête. Le choix
   de culture et le dernier poids saisi sont mémorisés dans la table
   `settings` de Dexie pour ne pas ressaisir à chaque visite. */

function formatAmount(value) {
  return new Intl.NumberFormat('fr-FR').format(value)
}

/* Libellés des deux actions : traduisent l'état des permissions en texte
   explicite plutôt qu'en icône seule, pour un utilisateur qui ne voit pas
   la couleur d'état. */
function buildNotifyLabel({ supported, status, permission, enabled }) {
  if (!supported) return '🔔 Alertes indisponibles'
  if (status === 'pending') return '🔔 Demande en cours…'
  if (permission === 'denied') return '🔔 Alertes bloquées'
  return enabled ? '🔔 Alertes prix actives' : '🔔 Activer les alertes prix'
}

function buildGeoLabel({ supported, status }) {
  if (!supported) return '📍 GPS indisponible'
  if (status === 'locating') return '📍 Localisation…'
  return status === 'resolved' ? '📍 Recalculer ma position' : '📍 Détecter mon marché'
}

function PricesScreen() {
  const {
    prices, location, marketName, availableMarkets, changeLocation,
    locateNearestMarket, geoSupported, geoStatus, geoMessage,
    lastUpdated, refreshPrices, error
  } = usePrices()
  const {
    supported: notifySupported, permission, enabled: notifyEnabled, status: notifyStatus,
    message: notifyMessage, toggleNotifications, notifyMarketChange
  } = useNotifications()
  const isOnline = useOnlineStatus()
  const [cropId, setCropId] = useState(prices[0]?.id ?? 'cocoa')
  const [weight, setWeight] = useState('')

  /* Alerte sur changement de marché RÉELLEMENT choisi. La ref évite
     qu'un simple remontage de composant (ou le double montage de
     React.StrictMode en dev) ne déclenche une notification au premier
     rendu. */
  const previousLocation = useRef(location)
  useEffect(() => {
    const fromId = previousLocation.current
    if (fromId === location) return
    previousLocation.current = location
    notifyMarketChange(fromId, location)
  }, [location, notifyMarketChange])

  useEffect(() => {
    let active = true
    db.settings
      .get('harvest-calculator')
      .then((saved) => {
        if (!active || !saved) return
        if (typeof saved.cropId === 'string') setCropId(saved.cropId)
        if (typeof saved.weight === 'string') setWeight(saved.weight)
      })
      .catch(() => {
        /* IndexedDB indisponible : le calculateur reste utilisable, sans mémoire */
      })
    return () => {
      active = false
    }
  }, [])

  function persist(next) {
    db.settings.put({ key: 'harvest-calculator', ...next }).catch(() => {
      /* écriture impossible : aucun impact sur le calcul en cours */
    })
  }

  function handleCropChange(nextCropId) {
    setCropId(nextCropId)
    persist({ cropId: nextCropId, weight })
  }

  function handleWeightChange(event) {
    const value = event.target.value
    setWeight(value)
    persist({ cropId, weight: value })
  }

  const selected = prices.find((price) => price.id === cropId) ?? prices[0]
  const kilos = Number(weight)
  const hasWeight = Number.isFinite(kilos) && kilos > 0
  const total = hasWeight && selected ? Math.round(kilos * selected.price) : 0

  const notifyLabel = buildNotifyLabel({ supported: notifySupported, status: notifyStatus, permission, enabled: notifyEnabled })
  const geoLabel = buildGeoLabel({ supported: geoSupported, status: geoStatus })
  const statusMessage =
    [geoMessage, notifyMessage].filter(Boolean).join(' · ') ||
    'Astuce : la détection GPS et les alertes fonctionnent sans réseau.'

  return (
    <section className="screen prices-screen">
      <header className="screen-header">
        <div className="brand-lockup">
          <picture className="brand-logo">
            <source media="(prefers-color-scheme: dark)" srcSet="/assets/logo-dark.png" />
            <img src="/assets/logo-light.png" alt="Logo AgroCI+" />
          </picture>
          <div>
            <p className="brand-name">AgroCI<span>+</span></p>
            <p className="brand-subtitle">Votre compagnon de champ</p>
          </div>
        </div>
        <div className="header-cluster">
          <ThemeToggle />
          <span className={`offline-pill ${isOnline ? 'is-online' : 'is-offline'}`}>
            <i /> {isOnline ? 'En ligne' : 'Hors ligne prêt'}
          </span>
        </div>
      </header>
      <div className="intro-block">
        <p className="kicker">Mardi 29 septembre</p>
        <h1>Les prix du jour</h1>
        <p className="screen-description">Suivez vos récoltes, même sans réseau.</p>
        <label className="note-label" htmlFor="market-select">
          Marché de référence
          <select id="market-select" value={location} onChange={(event) => changeLocation(event.target.value)}>
            {availableMarkets.map((market) => (
              <option key={market.id} value={market.id}>{market.name}</option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <button
            type="button"
            className="outline-button"
            onClick={() => toggleNotifications(location)}
            disabled={!notifySupported || notifyStatus === 'pending'}
          >
            {notifyLabel}
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={locateNearestMarket}
            disabled={!geoSupported || geoStatus === 'locating'}
          >
            {geoLabel}
          </button>
        </div>
        <p className="entry-count" role="status">{statusMessage}</p>
      </div>
      <div className="price-list">
        {prices.map((price, index) => (
          <PriceCard key={`${location}-${price.id}`} price={price} marketName={marketName} index={index} />
        ))}
      </div>
      <motion.section
        className="entry-form leaf-card harvest-calculator"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        aria-label="Valeur de ma récolte"
      >
        <div>
          <span className="eyebrow">Calcul rapide</span>
          <h2>Valeur de ma récolte</h2>
        </div>
        <p className="screen-description">Saisissez votre poids, le montant se calcule seul avec le prix du jour.</p>
        <div className="form-type-toggle" role="group" aria-label="Culture">
          {prices.map((price) => (
            <button
              key={price.id}
              type="button"
              className={price.id === cropId ? 'selected income' : ''}
              onClick={() => handleCropChange(price.id)}
            >
              {price.crop}
              {price.id === cropId && (
                <motion.span
                  layoutId="harvest-glide"
                  className="toggle-glide"
                  transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.6 }}
                />
              )}
            </button>
          ))}
        </div>
        <label>
          Poids récolté (kg)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={weight}
            onChange={handleWeightChange}
            placeholder="Ex. 250"
          />
        </label>
        <div className="totals-grid harvest-result">
          <div className="balance-total">
            <span>Montant estimé</span>
            <strong className="income-text">{hasWeight ? `${formatAmount(total)} FCFA` : '—'}</strong>
          </div>
        </div>
        {selected && (
          <p className="entry-count">
            {selected.crop} à {formatAmount(selected.price)} {selected.unit.replace('/', ' /')} · marché de {marketName}
          </p>
        )}
      </motion.section>
      <div className="update-row">
        <span>Dernière mise à jour : {lastUpdated}</span>
        <motion.button type="button" className="text-button" whileTap={{ scale: 0.97 }} onClick={refreshPrices}>
          Actualiser <span aria-hidden="true">↻</span>
        </motion.button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <motion.aside className="task-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <span className="task-icon">☀</span>
        <div>
          <span className="eyebrow">Petit rappel</span>
          <p>Observer les jeunes cabosses avant la prochaine pluie.</p>
        </div>
        <span className="task-arrow">→</span>
      </motion.aside>
    </section>
  )
}

export default PricesScreen
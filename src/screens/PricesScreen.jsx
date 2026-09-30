import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import PriceCard from '../components/PriceCard'
import ThemeToggle from '../components/ThemeToggle'
import { db } from '../db'
import { getMarket, normalizeLabel } from '../data/prices'
import { useCalendarReminders } from '../hooks/useCalendarReminders'
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

/* Bandeau national : affiché UNIQUEMENT quand le GPS a appliqué le
   barème de référence (hors bassin de collecte) et que l'utilisateur
   n'est pas en train de saisir. Deux copies identiques : la seconde rend
   la boucle du défilement invisible. */
const TICKER_MESSAGE =
  '📍 Position hors bassin de collecte local — Application du barème et du prix de référence national.'

/* Les deux actions sont des icônes : l'état est porté par la couleur et la
   classe CSS du bouton, plus aucune phrase sous le bloc. Ces tables ne
   servent qu'au nom accessible (aria-label / title), que la couleur seule
   ne peut pas transmettre. */
const NOTIFY_STATES = {
  unavailable: 'Alertes indisponibles sur cet appareil',
  pending: 'Demande d’autorisation des alertes…',
  denied: 'Alertes bloquées dans les réglages du navigateur',
  active: 'Désactiver les alertes prix',
  idle: 'Activer les alertes prix'
}

const GEO_STATES = {
  unavailable: 'GPS indisponible sur cet appareil',
  'out-of-zone': 'Hors zone agricole : marché de référence appliqué',
  locating: 'Localisation en cours…',
  resolved: 'Recalculer ma position',
  idle: 'Détecter mon marché le plus proche'
}

function notifyState({ supported, status, permission, enabled }) {
  if (!supported) return 'unavailable'
  if (status === 'pending') return 'pending'
  if (permission === 'denied') return 'denied'
  return enabled ? 'active' : 'idle'
}

function geoState({ supported, status }) {
  if (!supported) return 'unavailable'
  return ['locating', 'resolved', 'out-of-zone'].includes(status) ? status : 'idle'
}

function PricesScreen() {
  const {
    prices, location, marketName, localityName, usesHubProxy, availableLocalities,
    selectLocality, locateNearestMarket, geoSupported, geoStatus, isNationalReference,
    lastUpdated, refreshPrices, error
  } = usePrices()
  const {
    supported: notifySupported, permission, enabled: notifyEnabled, status: notifyStatus,
    toggleNotifications, notifyMarketChange
  } = useNotifications()
  /* Les conseils de campagne n'occupent plus l'écran : dès que les
     notifications sont accordées, ils passent par ce canal. Le bouton
     d'alertes prix ci-dessus est le SEUL point d'entrée de l'app pour
     l'autorisation — c'est donc lui qui active les rappels agronomiques.
     Silencieux (`enable`, pas `activate`) : ce bouton envoie déjà sa
     notification de confirmation. */
  const { enable: enableCalendarReminders } = useCalendarReminders()
  useEffect(() => {
    if (permission !== 'granted') return
    enableCalendarReminders()
  }, [permission, enableCalendarReminders])
  const isOnline = useOnlineStatus()
  const [cropId, setCropId] = useState(prices[0]?.id ?? 'cocoa')
  const [weight, setWeight] = useState('')
  /* Barre hybride : la zone active tient sur une ligne, la recherche
     n'existe que dans l'overlay. `searchOpen` pilote à la fois l'overlay
     et le masquage du bandeau national. Le champ démarre VIDE : il sert à
     chercher une ville, pas à afficher la ville courante (le badge joue
     déjà ce rôle). */
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const searchRef = useRef(null)
  const searchButtonRef = useRef(null)

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

  /* Fermeture sur clic extérieur : le listener n'existe que le temps de
     l'ouverture, et `pointerdown` précède la perte de focus. */
  useEffect(() => {
    if (!searchOpen) return undefined
    function handlePointerDown(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) closeSearch()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [searchOpen])

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

  /* Autocomplétion : uniquement des VILLES et COMMUNES. Les cultures en
     sont volontairement exclues — cacao et café ont déjà leurs cartes de
     prix affichées en permanence, les lister ici n'apporterait rien et
     confondrait « choisir où je suis » avec « choisir ce que je vends ».
     La comparaison est insensible aux accents : « duekoue » trouve
     « Duékoué ». `slice` borne la hauteur de l'overlay. */
  const options = useMemo(() => {
    const needle = normalizeLabel(query)
    return availableLocalities
      .filter((locality) => normalizeLabel(locality.name).includes(needle))
      .slice(0, 8)
      .map((locality) => ({
        key: `ville-${locality.id}`,
        id: locality.id,
        label: locality.name,
        /* Rattachement affiché AVANT le clic : l'utilisateur voit quel
           barème va s'appliquer avant de valider. */
        hint: getMarket(locality.hubId).name
      }))
  }, [availableLocalities, query])

  function chooseOption(option) {
    if (!option) return
    selectLocality(option.id)
    /* Fermeture instantanée : le champ ne doit jamais rester ouvert sous
       la liste après la sélection. */
    closeSearch()
  }

  function handleQueryChange(event) {
    setQuery(event.target.value)
    setHighlight(0)
  }

  /* Chaque ouverture repart d'une recherche vierge : la ville précédente
     ne pré-sélectionnerait pas la première ligne et masquerait la liste. */
  function openSearch() {
    setQuery('')
    setHighlight(0)
    setSearchOpen(true)
  }

  /* Le focus revient sur la loupe : la fermeture au clavier ne laisse
     jamais l'utilisateur sans point de départ. */
  function closeSearch() {
    setSearchOpen(false)
    setQuery('')
    searchButtonRef.current?.focus()
  }

  function handleSearchKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (options.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlight((current) => (current + step + options.length) % options.length)
      return
    }
    if (event.key === 'Enter') {
      if (options.length === 0) return
      event.preventDefault()
      chooseOption(options[highlight] ?? options[0])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSearch()
    }
  }

  const selected = prices.find((price) => price.id === cropId) ?? prices[0]
  const kilos = Number(weight)
  const hasWeight = Number.isFinite(kilos) && kilos > 0
  const total = hasWeight && selected ? Math.round(kilos * selected.price) : 0

  const notify = notifyState({ supported: notifySupported, status: notifyStatus, permission, enabled: notifyEnabled })
  const geo = geoState({ supported: geoSupported, status: geoStatus })
  const activeOptionId = searchOpen && options[highlight] ? `combo-option-${options[highlight].key}` : undefined
  /* Le bandeau s'efface dès que la recherche est ouverte : la saisie
     manuelle prime sur la référence nationale. Une sélection de marché,
     elle, coupe `isNationalReference` dans le hook. */
  const showTicker = isNationalReference && !searchOpen

  return (
    <section className="screen prices-screen">
      <header className="screen-header">
        <div className="brand-lockup">
          <picture className="brand-logo">
            {/* Variants 192 px : `.brand-logo` fait 42×42 CSS px, la source est
                donc encore ~4,5 fois surdimensionnée. Les 512 px (233/252 Ko)
                étaient peints dans 42 px — même image, dix fois plus d'octets
                à télécharger ET à précacher pour l'usage hors-ligne. */}
            <source media="(prefers-color-scheme: dark)" srcSet="/assets/logo-dark-192.png" />
            <img src="/assets/logo-light-192.png" alt="Logo AgroCI+" width="192" height="192" />
          </picture>
          <div>
            <p className="brand-name">AgroCI<span>+</span></p>
            <p className="brand-subtitle">Votre compagnon de champ</p>
          </div>
        </div>
        <div className="header-cluster">
          <button
            type="button"
            className={`icon-button notify-toggle is-${notify}`}
            onClick={() => toggleNotifications(location)}
            disabled={!notifySupported || notifyStatus === 'pending'}
            aria-pressed={notifyEnabled}
            aria-label={NOTIFY_STATES[notify]}
            title={NOTIFY_STATES[notify]}
          >
            <span aria-hidden="true">{notify === 'active' ? '🔔' : '🔕'}</span>
          </button>
          <ThemeToggle />
          <span
            className={`offline-pill ${isOnline ? 'is-online' : 'is-offline'}`}
            title={isOnline ? 'En ligne' : 'Hors ligne prêt'}
          >
            <i aria-hidden="true" />
            <span className="pill-label">{isOnline ? 'En ligne' : 'Hors ligne prêt'}</span>
          </span>
        </div>
      </header>
      <div className="intro-block">
        <p className="kicker">Mardi 29 septembre</p>
        <h1>Les prix du jour</h1>
        <p className="screen-description">Suivez vos récoltes, même sans réseau.</p>
        <div className="market-anchor" ref={searchRef}>
          <div className="zone-bar">
            <span className={`zone-badge is-${geo}`}>
              <span aria-hidden="true">📍</span>
              <span className="zone-name">{localityName}</span>
            </span>
            <div className="zone-actions">
              <button
                type="button"
                className="icon-button"
                ref={searchButtonRef}
                onClick={openSearch}
                aria-expanded={searchOpen}
                aria-controls="market-search-overlay"
                aria-label="Rechercher votre ville ou localité"
                title="Rechercher votre ville ou localité"
              >
                <span aria-hidden="true">🔍</span>
              </button>
              <button
                type="button"
                className={`icon-button geo-locate is-${geo}`}
                onClick={locateNearestMarket}
                disabled={!geoSupported || geoStatus === 'locating'}
                aria-label={GEO_STATES[geo]}
                title={GEO_STATES[geo]}
              >
                <span aria-hidden="true">🧭</span>
              </button>
            </div>
          </div>
          {/* Rattachement : affiché UNIQUEMENT quand la ville saisie n'est
              pas le hub (Gagnoa → Daloa) et que le GPS n'a pas imposé le
              barème national, auquel cas c'est le bandeau sous la barre
              qui porte déjà l'information. Sinon, une ligne redondante
              sous le badge. */}
          {usesHubProxy && !isNationalReference && (
            <p className="hub-note">Cours appliqué : Barème national (Hub {marketName})</p>
          )}
          {searchOpen && (
            <div className="search-overlay" id="market-search-overlay">
              <input
                id="market-select"
                className="search-input"
                type="text"
                role="combobox"
                autoFocus
                aria-expanded={searchOpen}
                aria-controls="market-listbox"
                aria-autocomplete="list"
                aria-activedescendant={activeOptionId}
                aria-label="Rechercher votre ville ou localité"
                placeholder="Rechercher votre ville ou localité..."
                value={query}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="search"
                enterKeyHint="search"
                onChange={handleQueryChange}
                onKeyDown={handleSearchKeyDown}
              />
              <ul className="combo-menu" id="market-listbox" role="listbox" aria-label="Villes et localités">
                {options.length === 0 ? (
                  <li className="combo-empty" role="presentation">Aucune ville trouvée</li>
                ) : (
                  options.map((option, index) => (
                    <li
                      key={option.key}
                      id={`combo-option-${option.key}`}
                      role="option"
                      aria-selected={index === highlight}
                      className={index === highlight ? 'combo-option is-active' : 'combo-option'}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => chooseOption(option)}
                    >
                      {option.label}
                      <span className="combo-tag">{option.hint === option.label ? 'Hub' : `Hub ${option.hint}`}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
        {showTicker && (
          <div className="ticker" role="status">
            <div className="ticker-track" aria-hidden="true">
              <span className="ticker-item">{TICKER_MESSAGE}</span>
              <span className="ticker-item">{TICKER_MESSAGE}</span>
            </div>
            <span className="visually-hidden">{TICKER_MESSAGE}</span>
          </div>
        )}
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

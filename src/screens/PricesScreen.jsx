import { motion } from 'framer-motion'
import PriceCard from '../components/PriceCard'
import { usePrices } from '../hooks/usePrices'

function PricesScreen() {
  const { prices, lastUpdated, refreshPrices, error } = usePrices()

  return (
    <section className="screen prices-screen">
      <header className="screen-header">
        <div className="brand-lockup">
          <span className="brand-mark">⌁</span>
          <div>
            <p className="brand-name">AgroCI<span>+</span></p>
            <p className="brand-subtitle">Votre compagnon de champ</p>
          </div>
        </div>
        <span className="offline-pill"><i /> Hors ligne prêt</span>
      </header>
      <div className="intro-block">
        <p className="kicker">Mardi 29 septembre</p>
        <h1>Les prix du jour</h1>
        <p className="screen-description">Suivez vos récoltes, même sans réseau.</p>
      </div>
      <div className="price-list">
        {prices.map((price, index) => <PriceCard key={price.id} price={price} index={index} />)}
      </div>
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
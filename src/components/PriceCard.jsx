import { motion } from 'framer-motion'
import { formatPrice } from '../data/prices'

function PriceCard({ price, marketName, index }) {
  const isUp = price.trend === 'up'
  return (
    <motion.article
      className="price-card"
      data-crop={price.id}
      data-market={marketName}
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay: index * 0.1 }}
    >
      <div className="price-card-top">
        <div>
          <span className="eyebrow">{price.id === 'cocoa' ? 'Fève' : 'Grain'}</span>
          <h2>{price.crop}</h2>
        </div>
        <span className={`trend-badge ${isUp ? 'up' : 'down'}`}>
          <span aria-hidden="true">{isUp ? '↗' : '↘'}</span> {isUp ? 'Hausse' : 'Baisse'}
        </span>
      </div>
      <div className="price-value">
        <strong>{formatPrice(price.price)}</strong>
        <span>{price.unit}</span>
      </div>
      <div className="price-card-bottom">
        <span>Marché de {marketName}</span>
        <span className="price-change">{price.change}</span>
      </div>
    </motion.article>
  )
}

export default PriceCard
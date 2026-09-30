import { motion } from 'framer-motion'

/* `sending` est compté à part de `count` : pendant un envoi, annoncer
   « 2 photos en attente » alors que l'une est déjà partie serait faux. */
function SyncIndicator({ count, sending = 0 }) {
  if (!count && !sending) return null

  return (
    <div className="sync-indicator" role="status" aria-live="polite">
      <span className="sync-icon" aria-hidden="true">{sending ? '🔄' : '↗'}</span>
      <span>
        {sending > 0 && `Traitement de ${sending} photo${sending > 1 ? 's' : ''}…`}
        {sending > 0 && count > 0 && ' · '}
        {count > 0 && `${count} photo${count > 1 ? 's' : ''} en attente`}
      </span>
      <span className="sync-dots" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <motion.i
            key={dot}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.18 }}
          />
        ))}
      </span>
    </div>
  )
}

export default SyncIndicator

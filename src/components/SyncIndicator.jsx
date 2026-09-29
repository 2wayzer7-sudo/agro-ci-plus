import { motion } from 'framer-motion'

function SyncIndicator({ count }) {
  if (!count) return null

  return (
    <div className="sync-indicator" role="status" aria-live="polite">
      <span className="sync-icon">↗</span>
      <span>{count} photo{count > 1 ? 's' : ''} en attente</span>
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
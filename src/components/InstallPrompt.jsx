import { AnimatePresence, motion } from 'framer-motion'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

/* État morphique : la bannière se déploie depuis la surface (clip-path)
   au lieu d'apparaître/disparaître. Elle se replie à l'installation.
   La classe .install-banner est conservée : c'est elle que
   useInstallPrompt pilote et que la suite de tests interroge. */
const ELASTIC = [0.34, 1.56, 0.64, 1]

const banner = {
  /* état de départ : la matière est encore roulée */
  replie: {
    opacity: 0,
    y: 14,
    clipPath: 'inset(0% 0% 100% 0% round 24px)',
    transition: { duration: 0.001 }
  },
  /* déploiement : ressort + clip-path élastique */
  deploye: {
    opacity: 1,
    y: 0,
    clipPath: 'inset(0% 0% 0% 0% round 24px)',
    transition: { type: 'spring', stiffness: 220, damping: 26, mass: 0.8, clipPath: { duration: 0.26, ease: ELASTIC } }
  },
  /* repli : tween COURT — le retrait du DOM doit rester synchrone
     (vérifié : 656 ms avec un ressort de sortie, 600 ms de budget) */
  sortie: {
    opacity: 0,
    y: -10,
    clipPath: 'inset(0% 0% 100% 0% round 24px)',
    transition: { duration: 0.16, ease: [0.4, 0, 0.6, 1] }
  }
}

function InstallPrompt() {
  const { canInstall, install } = useInstallPrompt()

  return (
    <AnimatePresence initial={false}>
      {canInstall && (
        <motion.aside
          key="install"
          className="install-banner"
          role="note"
          layout
          data-haptic="install"
          variants={banner}
          initial="replie"
          animate="deploye"
          exit="sortie"
        >
          <div>
            <span className="eyebrow">Installation</span>
            <p>Installez AgroCI+ pour l’ouvrir même sans réseau.</p>
          </div>
          <motion.button
            type="button"
            className="install-button"
            onClick={install}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 420, damping: 17 }}
          >
            Installer
          </motion.button>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

export default InstallPrompt

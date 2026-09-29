import { AnimatePresence, motion } from 'framer-motion'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import InstallPrompt from './components/InstallPrompt'
import DiagnosticScreen from './screens/DiagnosticScreen'
import JournalScreen from './screens/JournalScreen'
import PricesScreen from './screens/PricesScreen'
import { useAmbientField } from './hooks/useAmbientField'
import { useDiagnostics } from './hooks/useDiagnostics'

/* État morphique : la page ne se remplace pas, elle se dé replie.
   clip-path + ressort = la matière mesma se replie au lieu d'une fenêtre qui saute. */
const pageVariants = {
  initial: { opacity: 0, x: '6%', clipPath: 'inset(0% 0% 100% 0% round 30px)', filter: 'blur(4px)' },
  animate: { opacity: 1, x: 0, clipPath: 'inset(0% 0% 0% 0% round 0px)', filter: 'blur(0px)' },
  exit: { opacity: 0, x: '-4%', clipPath: 'inset(0% 0% 100% 0% round 30px)', filter: 'blur(4px)' }
}

function App() {
  const location = useLocation()
  const { pendingCount } = useDiagnostics()
  useAmbientField()

  return (
    <div className="app-shell">
      <main className="main-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            className="page-surface"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.7 }}
          >
            <Routes location={location}>
              <Route path="/" element={<PricesScreen />} />
              <Route path="/diagnostic" element={<DiagnosticScreen />} />
              <Route path="/carnet" element={<JournalScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
        <InstallPrompt />
      </main>
      <BottomNav pendingCount={pendingCount} />
    </div>
  )
}

export default App

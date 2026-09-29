import { AnimatePresence, motion } from 'framer-motion'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import DiagnosticScreen from './screens/DiagnosticScreen'
import JournalScreen from './screens/JournalScreen'
import PricesScreen from './screens/PricesScreen'
import { useDiagnostics } from './hooks/useDiagnostics'

const pageVariants = {
  initial: { x: '7%', opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: '-7%', opacity: 0 }
}

function App() {
  const location = useLocation()
  const { pendingCount } = useDiagnostics()

  return (
    <div className="app-shell">
      <main className="main-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <Routes location={location}>
              <Route path="/" element={<PricesScreen />} />
              <Route path="/diagnostic" element={<DiagnosticScreen />} />
              <Route path="/carnet" element={<JournalScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav pendingCount={pendingCount} />
    </div>
  )
}

export default App
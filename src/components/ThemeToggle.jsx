import { motion } from 'framer-motion'
import { useTheme } from '../hooks/useTheme'

/* Bascule de matière : un seul disque qui pivote d'un demi-tour et
   change de glyphe. `aria-pressed` expose l'état à l'assistance. */
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <motion.button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      whileTap={{ scale: 0.88, rotate: -35 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      aria-pressed={isDark}
      aria-label={isDark ? 'Passer en thème clair' : 'Passer en thème sombre'}
      title={isDark ? 'Thème clair' : 'Thème sombre'}
      data-haptic="theme"
    >
      <motion.span
        className="theme-toggle-disc"
        aria-hidden="true"
        animate={{ rotate: isDark ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <motion.span
          className="theme-toggle-glyph"
          key={isDark ? 'dark' : 'light'}
          initial={{ opacity: 0, scale: 0.6, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.26, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {isDark ? '☾' : '☀'}
        </motion.span>
      </motion.span>
    </motion.button>
  )
}

export default ThemeToggle

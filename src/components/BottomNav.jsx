import { motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Prix', icon: '◈' },
  { to: '/diagnostic', label: 'Diagnostic', icon: '⌁' },
  { to: '/carnet', label: 'Carnet', icon: '▤' }
]

function BottomNav({ pendingCount }) {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          {({ isActive }) => (
            <>
              <span className="nav-icon" aria-hidden="true">{link.icon}</span>
              <span>{link.label}</span>
              {link.to === '/diagnostic' && pendingCount > 0 && (
                <span className="nav-badge">{pendingCount}</span>
              )}
              {isActive && <motion.span layoutId="active-tab" className="active-tab" />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default BottomNav
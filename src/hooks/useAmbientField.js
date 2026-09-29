import { useEffect } from 'react'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const HAPTIC_TARGETS = '.nav-item, button, .price-card, .entry-item, .diagnostic-item, .install-banner, .task-card'

/**
 * Champ ambiant : la matière de l'interface suit l'intention.
 * 1. le pointeur déplace la lueur (--gx / --gy) -> eclairage volumétrique
 * 2. chaque appui pose une onde réelle dans la surface (span.ripple)
 * Aucun state React : tout passe par des variables CSS, donc 0 re-render.
 */
export function useAmbientField() {
  useEffect(() => {
    const root = document.documentElement
    const motionQuery = window.matchMedia(REDUCED_MOTION)
    let frame = 0
    let pointerX = 50
    let pointerY = 16

    const paint = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        root.style.setProperty('--gx', `${pointerX}%`)
        root.style.setProperty('--gy', `${pointerY}%`)
      })
    }

    const onPointerMove = (event) => {
      if (event.pointerType === 'touch' || motionQuery.matches) return
      pointerX = (event.clientX / window.innerWidth) * 100
      pointerY = (event.clientY / window.innerHeight) * 100
      paint()
    }

    const onPointerDown = (event) => {
      if (motionQuery.matches) return
      if (!(event.target instanceof Element)) return
      const surface = event.target.closest(HAPTIC_TARGETS)
      if (!surface) return

      const box = surface.getBoundingClientRect()
      const wave = document.createElement('span')
      const size = Math.max(box.width, box.height) * 2.2

      wave.className = 'ripple'
      wave.setAttribute('aria-hidden', 'true')
      wave.style.width = `${size}px`
      wave.style.height = `${size}px`
      wave.style.left = `${event.clientX - box.left}px`
      wave.style.top = `${event.clientY - box.top}px`

      surface.appendChild(wave)
      wave.addEventListener('animationend', () => wave.remove(), { once: true })
    }

    paint()
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      document.querySelectorAll('.ripple').forEach((node) => node.remove())
    }
  }, [])
}

export default useAmbientField

import { useCallback, useState } from 'react'
import { mockPrices } from '../data/prices'

function getFormattedDate(date = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date)
}

export function usePrices() {
  const [prices, setPrices] = useState(mockPrices)
  const [lastUpdated, setLastUpdated] = useState(getFormattedDate)
  const [error, setError] = useState('')

  const refreshPrices = useCallback(() => {
    try {
      setPrices((currentPrices) => currentPrices.map((item) => ({ ...item })))
      setLastUpdated(getFormattedDate())
      setError('')
    } catch {
      setError('Impossible d’actualiser les prix pour le moment.')
    }
  }, [])

  return { prices, lastUpdated, refreshPrices, error }
}
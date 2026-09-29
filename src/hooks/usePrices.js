import { useCallback, useRef, useState } from 'react'
import { DEFAULT_LOCATION_ID, MARKET_LIST, findNearestMarket, getMarket, isKnownLocation } from '../data/prices'

const LOCATION_STORAGE_KEY = 'agroci:location'

/* Un point GPS de ville n'a pas besoin de précision maximale : désactiver
   `enableHighAccuracy` économise la batterie, et `maximumAge` accepte un
   point déjà acquis récemment au lieu d'epuiser le GPS. */
const GEO_TIMEOUT_MS = 10000
const GEO_MAX_AGE_MS = 5 * 60 * 1000

const GEO_ERROR_MESSAGES = {
  1: 'Localisation refusée : le marché choisi à la main est conservé.',
  2: 'Position indisponible pour le moment : la sélection actuelle est conservée.',
  3: 'La localisation a expiré : réessayez en plein ciel.'
}

function getFormattedDate(date = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date)
}

function geolocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

/* Stockage en lecture-défensive : un navigateur en navigation privée peut
   refuser l'accès et l'app doit rester utilisable dans ce cas. */
function readStoredLocation() {
  try {
    const stored = window.localStorage.getItem(LOCATION_STORAGE_KEY)
    return isKnownLocation(stored) ? stored : DEFAULT_LOCATION_ID
  } catch {
    return DEFAULT_LOCATION_ID
  }
}

function writeStoredLocation(id) {
  try {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, id)
  } catch {
    /* le marché change quand même : seule la persistance est perdue */
  }
}

export function usePrices() {
  const [location, setLocation] = useState(readStoredLocation)
  /* Stockée en Date (objet toujours neuf) : un setState avec la même
     chaîne formatée serait ignoré par React et « Actualiser » semblerait
     inerte. La surface publique reste `lastUpdated`, une chaîne. */
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date())
  const [error, setError] = useState('')
  const [geoStatus, setGeoStatus] = useState('idle')
  const [geoMessage, setGeoMessage] = useState('')

  /* Verrou de session posé dès que le planteur choisit un marché à la
     main. Une ref, pas un state : il ne provoque aucun rendu et reste
     lisible dans le callback asynchrone de getCurrentPosition, qui peut
     arriver bien après le retour du <select>. */
  const manualLocation = useRef(false)

  const market = getMarket(location)
  const prices = market.prices
  const marketName = market.name
  const lastUpdated = getFormattedDate(lastUpdatedAt)

  const applyLocation = useCallback((nextLocationId) => {
    setLocation(nextLocationId)
    writeStoredLocation(nextLocationId)
  }, [])

  const changeLocation = useCallback((newLocationId) => {
    if (!isKnownLocation(newLocationId)) return
    manualLocation.current = true
    setGeoStatus('idle')
    setGeoMessage('Marché choisi à la main : la détection GPS est suspendue.')
    applyLocation(newLocationId)
  }, [applyLocation])

  /* Déclenchée uniquement au tap sur le bouton : aucune requête de
     position n'est émise au chargement, ce qui évite l'invite de
     permission parasite et respecte le choix manuel. */
  const locateNearestMarket = useCallback(() => {
    if (!geolocationSupported()) {
      setGeoStatus('unavailable')
      setGeoMessage('GPS non pris en charge sur cet appareil : utilisez la liste des marchés.')
      return
    }

    setGeoStatus('locating')
    setGeoMessage('Localisation en cours…')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        /* Course possible : le planteur a pu choisir un marché pendant que
           la boîte de dialogue GPS était ouverte. Son choix prime, la
           position ne doit plus rien décider. */
        if (manualLocation.current) {
          setGeoStatus('resolved')
          setGeoMessage('Marché choisi à la main : la position n’a pas été appliquée.')
          return
        }
        const nearest = findNearestMarket({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        })
        if (!nearest) {
          setGeoStatus('unavailable')
          setGeoMessage('Position reçue, mais aucun marché ne correspond.')
          return
        }
        applyLocation(nearest.market.id)
        setGeoStatus('resolved')
        setGeoMessage(`Marché le plus proche : ${nearest.market.name} (à ${Math.round(nearest.distanceKm)} km).`)
      },
      (geoError) => {
        setGeoStatus(geoError?.code === 1 ? 'denied' : 'unavailable')
        setGeoMessage(
          GEO_ERROR_MESSAGES[geoError?.code] ?? 'Localisation impossible : la sélection actuelle est conservée.'
        )
      },
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: GEO_MAX_AGE_MS }
    )
  }, [applyLocation])

  const refreshPrices = useCallback(() => {
    try {
      setLastUpdatedAt(new Date())
      setError('')
    } catch {
      setError('Impossible d’actualiser les prix pour le moment.')
    }
  }, [])

  return {
    location,
    marketName,
    prices,
    availableMarkets: MARKET_LIST,
    changeLocation,
    locateNearestMarket,
    geoSupported: geolocationSupported(),
    geoStatus,
    geoMessage,
    lastUpdated,
    refreshPrices,
    error
  }
}

import { useCallback, useRef, useState } from 'react'
import {
  DEFAULT_LOCATION_ID,
  LOCALITY_LIST,
  MARKET_LIST,
  findNearestMarket,
  getLocality,
  getMarket,
  isKnownLocality,
  isKnownLocation
} from '../data/prices'

const LOCATION_STORAGE_KEY = 'agroci:location'
/* La localité est la ville choisie par l'utilisateur, le hub étant le
   marché qui alimente réellement les prix : deux informations distinctes,
   donc deux clés distinctes. `agroci:location` reste le hub appliqué, il
   n'est jamais réécrit avec l'id d'une commune satellite. */
const LOCALITY_STORAGE_KEY = 'agroci:locality'

/* Un point GPS de ville n'a pas besoin de précision maximale : désactiver
   `enableHighAccuracy` économise la batterie, et `maximumAge` accepte un
   point déjà acquis récemment au lieu d'epuiser le GPS. */
const GEO_TIMEOUT_MS = 10000
const GEO_MAX_AGE_MS = 5 * 60 * 1000

/* Rayon de couverture du service : au-delà, la position de l'utilisateur
   n'appartient plus au bassin de production suivi (Abidjan, Yamoussoukro,
   un point GPS erroné…). Appliquer le marché le plus proche afficherait
   alors des prix hors zone agricole : on conserve le marché courant. */
const MARKET_RANGE_KM = 100

/* Marché de référence affiché hors zone : Daloa (DEFAULT_LOCATION_ID),
   résolu une seule fois au chargement du module. */
const REFERENCE_MARKET = getMarket(DEFAULT_LOCATION_ID)

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

/* Localité choisie par le planteur. Repli sur la référence nationale si
   rien n'est stocké ou si l'entrée est corrompue : l'application démarre
   toujours sur un état connu, jamais sur un undefined qui casserait le
   rendu du badge. */
function readStoredLocality() {
  try {
    const stored = window.localStorage.getItem(LOCALITY_STORAGE_KEY)
    return isKnownLocality(stored) ? stored : DEFAULT_LOCATION_ID
  } catch {
    return DEFAULT_LOCATION_ID
  }
}

function writeStoredLocality(id) {
  try {
    window.localStorage.setItem(LOCALITY_STORAGE_KEY, id)
  } catch {
    /* le badge change quand même : seule la persistance est perdue */
  }
}

export function usePrices() {
  const [location, setLocation] = useState(readStoredLocation)
  const [localityId, setLocalityId] = useState(readStoredLocality)
  /* Stockée en Date (objet toujours neuf) : un setState avec la même
     chaîne formatée serait ignoré par React et « Actualiser » semblerait
     inerte. La surface publique reste `lastUpdated`, une chaîne. */
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date())
  const [error, setError] = useState('')
  const [geoStatus, setGeoStatus] = useState('idle')
  const [geoMessage, setGeoMessage] = useState('')
  /* Vrai tant que le barème appliqué est celui de la référence nationale :
     le GPS était hors bassin de collecte. Tout choix manuel l'annule. */
  const [isNationalReference, setIsNationalReference] = useState(false)

  /* Verrou de session posé dès que le planteur choisit un marché à la
     main. Une ref, pas un state : il ne provoque aucun rendu et reste
     lisible dans le callback asynchrone de getCurrentPosition, qui peut
     arriver bien après le retour du champ de recherche. */
  const manualLocation = useRef(false)

  const market = getMarket(location)
  const prices = market.prices
  const marketName = market.name
  const lastUpdated = getFormattedDate(lastUpdatedAt)
  /* Localité choisie : celle affichée dans le badge, jamais le hub. */
  const locality = getLocality(localityId)
  const localityName = locality ? locality.name : REFERENCE_MARKET.name
  /* Vrai seulement si un intermédiaire existe : « Cours appliqué : Barème
     national (Hub Daloa) » n'a aucun sens quand le planteur EST à Daloa, le
     badge suffit alors. */
  const usesHubProxy = Boolean(locality) && locality.hubId !== locality.id

  const applyLocation = useCallback((nextLocationId) => {
    setLocation(nextLocationId)
    writeStoredLocation(nextLocationId)
  }, [])

  /* Sélection d'une ville ou commune : le badge affiche la ville saisie et
     le barème appliqué est celui du hub de rattachement. `applyLocation`
     persiste le hub, donc Gagnoa survit à un rechargement sans réinjecter
     Gagnoa dans la clé des marchés. */
  const selectLocality = useCallback((nextLocalityId) => {
    const next = getLocality(nextLocalityId)
    if (!next) return
    manualLocation.current = true
    setIsNationalReference(false)
    setGeoStatus('idle')
    setGeoMessage(`Ville choisie : ${next.name}.`)
    setLocalityId(next.id)
    writeStoredLocality(next.id)
    applyLocation(next.hubId)
  }, [applyLocation])

  const changeLocation = useCallback((newLocationId) => {
    if (!isKnownLocation(newLocationId)) return
    manualLocation.current = true
    /* Un marché nommé par le planteur prime toujours sur le barème
       national : le bandeau d'avertissement doit s'éteindre. */
    setIsNationalReference(false)
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

    /* Le tap sur 📍 est une intention explicite et neuve : le verrou posé
       par un CHOIX ANTÉRIEUR est levé, sinon le GPS deviendrait inopérant
       après le premier choix manuel. La course reste protégée — un choix
       effectué PENDANT la requête prime encore sur la position reçue. */
    manualLocation.current = false

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
        /* Seuil de zone : hors bassin de collecte (> 100 km — Abidjan,
           Bouaké, Korhogo…), la position ne dicte AUCUN marché lointain.
           On impose la référence nationale, qui reste le seul barème
           pertinent hors de la zone, et on le signale. */
        if (nearest.distanceKm > MARKET_RANGE_KM) {
          applyLocation(DEFAULT_LOCATION_ID)
          setIsNationalReference(true)
          setGeoStatus('out-of-zone')
          setGeoMessage(`Hors zone agricole (> ${MARKET_RANGE_KM} km). Marché de référence par défaut : ${REFERENCE_MARKET.name}`)
          return
        }
        /* Dans le bassin : marché le plus proche, persisté par
           applyLocation (localStorage 'agroci:location'). */
        applyLocation(nearest.market.id)
        setIsNationalReference(false)
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
    /* `location` reste le hub appliqué : les cartes, le calculateur et le
       journal continuent de lire exactement les mêmes prix qu'avant. */
    localityName,
    usesHubProxy,
    availableLocalities: LOCALITY_LIST,
    selectLocality,
    availableMarkets: MARKET_LIST,
    changeLocation,
    locateNearestMarket,
    geoSupported: geolocationSupported(),
    geoStatus,
    geoMessage,
    isNationalReference,
    lastUpdated,
    refreshPrices,
    error
  }
}

/* Prix de référence par marché. Données de DÉMONSTRATION : aucun appel
   réseau, aucune source officielle branchée. Seuls les montants de Daloa
   sont repris tels quels de l'historique ; les autres marchés sont des
   valeurs plausibles calées sur les bassins de production réels
   (prime à l'est, décote portuaire au sud-ouest). À remplacer par la
   source officielle dès qu'elle existera.

   `coords` sert au calcul du marché le plus proche : ce sont les centres
   urbains de référence, pas les coordonnées GPS de l'utilisateur. */

const buildMarket = (id, name, coords, cocoa, coffee) => ({
  id,
  name,
  coords,
  prices: [
    { id: 'cocoa', crop: 'Cacao', price: cocoa.price, unit: 'FCFA/kg', trend: cocoa.trend, change: cocoa.change, updatedAt: '2026-09-29' },
    { id: 'coffee', crop: 'Café', price: coffee.price, unit: 'FCFA/kg', trend: coffee.trend, change: coffee.change, updatedAt: '2026-09-29' }
  ]
})

export const DEFAULT_LOCATION_ID = 'daloa'

export const MARKET_PRICES = {
  daloa: buildMarket('daloa', 'Daloa', { lat: 6.8774, lng: -6.4502 }, { price: 1650, trend: 'up', change: '+50 FCFA' }, { price: 1200, trend: 'down', change: '-25 FCFA' }),
  sanpedro: buildMarket('sanpedro', 'San-Pédro', { lat: 4.7485, lng: -6.6363 }, { price: 1600, trend: 'up', change: '+30 FCFA' }, { price: 1150, trend: 'down', change: '-15 FCFA' }),
  soubre: buildMarket('soubre', 'Soubré', { lat: 5.7856, lng: -6.6022 }, { price: 1580, trend: 'up', change: '+20 FCFA' }, { price: 1100, trend: 'down', change: '-10 FCFA' }),
  abengourou: buildMarket('abengourou', 'Abengourou', { lat: 6.7297, lng: -3.4964 }, { price: 1720, trend: 'up', change: '+60 FCFA' }, { price: 1250, trend: 'down', change: '-20 FCFA' })
}

/* Identité stable : la liste ne doit pas être reconstruite à chaque rendu,
   sinon le champ de recherche de PricesScreen perd sa référence. */
export const MARKET_LIST = Object.freeze(
  Object.values(MARKET_PRICES).map((market) => Object.freeze({ id: market.id, name: market.name }))
)

/* ---------- Villes & communes agricoles rattachées à un hub ----------
   Un planteur ne connaît pas les « hubs » de la plateforme : il connaît
   sa commune. Chaque localité est donc rattachée à un hub officiel dont
   elle applique le barème et les cours.

   Rattachements retenus :
   - bassin Daloa      : Daloa, Gagnoa, Issia, Sinfra, Vavoua, Duékoué, Guiglo
   - bassin Soubré     : Soubré, Méagui, Sassandra
   - bassin San-Pédro  : San-Pédro, Tabou
   - bassin Abengourou : Abengourou, Agnibilékrou, Bondoukou, Agboville
   Méagui et Sassandra relèvent du même bassin que San-Pédro et Soubré
   (sous-préfectures rattachées) mais sont plus proches de Soubré, d'où le
   hub choisi ; Tabou, sous-préfecture de San-Pédro, suit San-Pédro. */

const LOCALITY_HUBS = [
  { id: 'daloa', name: 'Daloa', hubId: 'daloa' },
  { id: 'gagnoa', name: 'Gagnoa', hubId: 'daloa' },
  { id: 'issia', name: 'Issia', hubId: 'daloa' },
  { id: 'sinfra', name: 'Sinfra', hubId: 'daloa' },
  { id: 'vavoua', name: 'Vavoua', hubId: 'daloa' },
  { id: 'duekoue', name: 'Duékoué', hubId: 'daloa' },
  { id: 'guiglo', name: 'Guiglo', hubId: 'daloa' },
  { id: 'soubre', name: 'Soubré', hubId: 'soubre' },
  { id: 'meagui', name: 'Méagui', hubId: 'soubre' },
  { id: 'sassandra', name: 'Sassandra', hubId: 'soubre' },
  { id: 'sanpedro', name: 'San-Pédro', hubId: 'sanpedro' },
  { id: 'tabou', name: 'Tabou', hubId: 'sanpedro' },
  { id: 'abengourou', name: 'Abengourou', hubId: 'abengourou' },
  { id: 'agnibilekrou', name: 'Agnibilékrou', hubId: 'abengourou' },
  { id: 'bondoukou', name: 'Bondoukou', hubId: 'abengourou' },
  { id: 'agboville', name: 'Agboville', hubId: 'abengourou' }
]

const LOCALITY_INDEX = new Map(LOCALITY_HUBS.map((item) => [item.id, item]))

export const isKnownLocality = (id) => typeof id === 'string' && LOCALITY_INDEX.has(id)

export function getLocality(id) {
  return isKnownLocality(id) ? LOCALITY_INDEX.get(id) : null
}

/* Liste de recherche : triée par nom (français) ET figée. L'ordre stable
   évite qu'une localité change de rang à chaque rendu. */
export const LOCALITY_LIST = Object.freeze(
  LOCALITY_HUBS.slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map((item) => Object.freeze(item))
)

/* Comparaison insensible aux accents et à la casse : « duekoue » doit
   trouver « Duékoué », sans quoi la recherche échoue sur les villes dont
   le nom porte un signe diacritique. */
export function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export const isKnownLocation = (id) => typeof id === 'string' && Object.hasOwn(MARKET_PRICES, id)

export function getMarket(id) {
  return MARKET_PRICES[isKnownLocation(id) ? id : DEFAULT_LOCATION_ID]
}

export function formatPrice(value) {
  return new Intl.NumberFormat('fr-FR').format(value)
}

/* ---------- Géolocalisation : marché le plus proche (Haversine) ---------- */

const EARTH_RADIUS_KM = 6371
const toRadians = (degrees) => (degrees * Math.PI) / 180

const isFiniteCoordinate = (value) => typeof value === 'number' && Number.isFinite(value)

/* Distance orthodromique entre deux points { lat, lng }, en kilomètres.
   Le clamp à 1 du sinus protège Math.asin d'un dépassement dû aux
   arrondis flottants, qui rendrait le résultat NaN. */
export function haversineKm(from, to) {
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/* Renvoie { market, distanceKm } pour la position donnée, ou null si la
   position est inexploitable (NaN, null, coordonnées absentes). */
export function findNearestMarket(position) {
  if (!position || !isFiniteCoordinate(position.lat) || !isFiniteCoordinate(position.lng)) return null

  let best = null
  for (const market of Object.values(MARKET_PRICES)) {
    const distanceKm = haversineKm(position, market.coords)
    if (!best || distanceKm < best.distanceKm) best = { market, distanceKm }
  }
  return best
}

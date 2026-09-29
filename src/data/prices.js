export const mockPrices = [
  {
    id: 'cocoa',
    crop: 'Cacao',
    price: 1650,
    unit: 'FCFA/kg',
    location: 'Daloa',
    trend: 'up',
    change: '+50 FCFA',
    updatedAt: '2026-09-29'
  },
  {
    id: 'coffee',
    crop: 'Café',
    price: 1200,
    unit: 'FCFA/kg',
    location: 'Daloa',
    trend: 'down',
    change: '-25 FCFA',
    updatedAt: '2026-09-29'
  }
]

export function formatPrice(value) {
  return new Intl.NumberFormat('fr-FR').format(value)
}
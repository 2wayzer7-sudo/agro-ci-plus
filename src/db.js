import Dexie from 'dexie'

export const db = new Dexie('agro-ci-plus')

db.version(1).stores({
  entries: '++id, type, category, date, createdAt',
  diagnostics: '++id, status, createdAt',
  settings: 'key'
})

export function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}
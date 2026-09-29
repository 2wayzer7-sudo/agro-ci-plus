import Dexie from 'dexie'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../db'

export function useEntries() {
  const [entries, setEntries] = useState([])
  const [totals, setTotals] = useState({ spent: 0, earned: 0, balance: 0 })
  const [error, setError] = useState('')

  const loadEntries = useCallback(async () => {
    try {
      const latestEntries = await db.entries.orderBy('createdAt').reverse().limit(20).toArray()
      const allEntries = await db.entries.toArray()
      const nextTotals = allEntries.reduce((result, entry) => {
        if (entry.type === 'expense') result.spent += entry.amount
        if (entry.type === 'income') result.earned += entry.amount
        result.balance = result.earned - result.spent
        return result
      }, { spent: 0, earned: 0, balance: 0 })
      setEntries(latestEntries)
      setTotals(nextTotals)
      setError('')
    } catch {
      setError('Le carnet ne peut pas être chargé. Réessayez.')
    }
  }, [])

  useEffect(() => {
    loadEntries()
    const handleStorageChange = () => loadEntries()
    Dexie.on('storagemutated', handleStorageChange)
    return () => Dexie.on('storagemutated').unsubscribe(handleStorageChange)
  }, [loadEntries])

  const addEntry = useCallback(async (entry) => {
    try {
      await db.entries.add({
        ...entry,
        amount: Number(entry.amount),
        createdAt: Date.now()
      })
      await loadEntries()
      return { success: true }
    } catch {
      const message = 'L’écriture n’a pas pu être enregistrée.'
      setError(message)
      return { success: false, error: message }
    }
  }, [loadEntries])

  const deleteEntry = useCallback(async (id) => {
    try {
      await db.entries.delete(id)
      await loadEntries()
      return { success: true }
    } catch {
      const message = 'L’écriture n’a pas pu être supprimée.'
      setError(message)
      return { success: false, error: message }
    }
  }, [loadEntries])

  return { entries, totals, addEntry, deleteEntry, error, reload: loadEntries }
}
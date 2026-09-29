import { useCallback, useEffect, useState } from 'react'
import { db } from '../db'
import { registerDiagnosticsSync } from '../sync'

export function useDiagnostics() {
  const [diagnostics, setDiagnostics] = useState([])
  const [error, setError] = useState('')

  const loadDiagnostics = useCallback(async () => {
    try {
      const items = await db.diagnostics.orderBy('createdAt').reverse().toArray()
      setDiagnostics(items)
      setError('')
    } catch {
      setError('Les diagnostics ne peuvent pas être chargés. Réessayez.')
    }
  }, [])

  useEffect(() => {
    loadDiagnostics()
    const handleStorageChange = () => loadDiagnostics()
    db.on('storagemutated', handleStorageChange)
    return () => db.on.storagemutated.unsubscribe(handleStorageChange)
  }, [loadDiagnostics])

  const saveDiagnostic = useCallback(async ({ image, note }) => {
    try {
      await db.diagnostics.add({
        image,
        note: note.trim(),
        status: 'pending',
        createdAt: Date.now()
      })
      await loadDiagnostics()
      await registerDiagnosticsSync()
      return { success: true }
    } catch {
      const message = 'La photo n’a pas pu être sauvegardée.'
      setError(message)
      return { success: false, error: message }
    }
  }, [loadDiagnostics])

  const sendNow = useCallback(async () => {
    try {
      await registerDiagnosticsSync()
      return { success: true }
    } catch {
      const message = 'L’envoi sera réessayé dès que possible.'
      setError(message)
      return { success: false, error: message }
    }
  }, [])

  return {
    diagnostics,
    pendingCount: diagnostics.filter((item) => item.status === 'pending').length,
    saveDiagnostic,
    sendNow,
    error,
    reload: loadDiagnostics
  }
}
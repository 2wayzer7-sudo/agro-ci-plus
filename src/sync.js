import { db } from './db'

// This is intentionally a local stub until the future Supabase endpoint exists.
export async function sendDiagnostics() {
  try {
    const pending = await db.diagnostics.where('status').equals('pending').toArray()
    // Future API call: upload each compressed image, then mark it as "sent".
    return { sent: 0, pending: pending.length }
  } catch {
    return { sent: 0, pending: 0, error: 'Les diagnostics ne peuvent pas être synchronisés.' }
  }
}

export async function registerDiagnosticsSync() {
  try {
    const registration = await navigator.serviceWorker?.ready
    if (registration?.sync?.register) {
      await registration.sync.register('sync-diagnostics')
      return 'background'
    }
    await sendDiagnostics()
    return 'local'
  } catch {
    await sendDiagnostics()
    return 'local'
  }
}

export function listenForSyncMessages(onSync) {
  if (!('serviceWorker' in navigator)) return () => {}
  const handleMessage = async (event) => {
    if (event.data?.type === 'SYNC_DIAGNOSTICS') {
      await sendDiagnostics()
      onSync()
    }
  }
  navigator.serviceWorker.addEventListener('message', handleMessage)
  return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
}
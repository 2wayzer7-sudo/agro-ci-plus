import { useEffect, useState } from 'react'

const PROBE_URL = 'https://www.gstatic.com/generate_204'
const PROBE_TIMEOUT = 5000
const POLL_INTERVAL = 30000

async function probeNetwork() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT)
  try {
    await fetch(PROBE_URL, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false)

  useEffect(() => {
    let active = true
    const apply = (value) => {
      if (active) setIsOnline(value)
    }
    const refresh = async () => apply(await probeNetwork())
    const handleOnline = () => refresh()
    const handleOffline = () => apply(false)

    refresh()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    const poll = setInterval(refresh, POLL_INTERVAL)

    return () => {
      active = false
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(poll)
    }
  }, [])

  return isOnline
}

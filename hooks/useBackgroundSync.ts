'use client'

import { useEffect, useRef } from 'react'

export function useBackgroundSync(onSync: () => void, intervalMs = 60_000) {
  const onSyncRef = useRef(onSync)
  onSyncRef.current = onSync

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>

    const runSync = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        await fetch('/api/sync', { method: 'POST' })
        onSyncRef.current()
      } catch {}
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runSync()
    }

    timer = setInterval(runSync, intervalMs)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [intervalMs])
}

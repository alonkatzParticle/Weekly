export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const g = globalThis as any

  // Warm in-memory cache from DB on every server start (SQLite or Postgres)
  try {
    const { initDB } = await import('./lib/db')
    const { loadBoardCacheFromDb } = await import('./lib/monday')
    await initDB()
    await loadBoardCacheFromDb()
  } catch (e) {
    console.error('[startup] Failed to load board cache from DB:', e)
  }

  // Schedule 8am daily full sync — guard against HMR re-registration
  if (g._cronScheduled) return
  g._cronScheduled = true

  try {
    const cron = (await import('node-cron')).default

    cron.schedule('0 8 * * *', async () => {
      console.log('[cron] 8am full sync starting...')
      try {
        const { getBoardIds, initDB } = await import('./lib/db')
        const { clearBoardCache, fetchAllBoardTasks } = await import('./lib/monday')
        await initDB()
        const boards = await getBoardIds()
        const boardIds = boards.map((b: any) => b.board_id)
        const token = process.env.MONDAY_TOKEN
        if (!token || boardIds.length === 0) return
        clearBoardCache()
        await fetchAllBoardTasks(boardIds, token, true)
        console.log('[cron] 8am full sync complete')
      } catch (e) {
        console.error('[cron] 8am sync failed:', e)
      }
    })

    console.log('[startup] 8am daily sync scheduled')
  } catch (e) {
    console.error('[startup] Failed to schedule cron:', e)
  }
}

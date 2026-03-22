import { NextRequest, NextResponse } from 'next/server'
import { fetchTasksForUser, clearBoardCache } from '@/lib/monday'
import { getBoardIds, initDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await initDB()
    const { searchParams } = new URL(req.url)
    const mondayUserId = searchParams.get('user_id')
    const weekStart = searchParams.get('week_start')
    const weekEnd = searchParams.get('week_end')
    const nextWeekStart = searchParams.get('next_week_start')
    const nextWeekEnd = searchParams.get('next_week_end')
    const force = searchParams.get('force') === 'true'

    if (!mondayUserId || !weekStart || !weekEnd) {
      return NextResponse.json({ error: 'Missing required params' }, { status: 400 })
    }

    const token = process.env.MONDAY_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'MONDAY_TOKEN is not set in environment variables' }, { status: 500 })
    }

    const boards = await getBoardIds()
    const boardIds = boards.map((b: any) => b.board_id)
    if (boardIds.length === 0) {
      return NextResponse.json({ lastWeek: [], thisWeek: [] })
    }

    // If force refresh, wipe the board metadata cache
    if (force) clearBoardCache()

    const nwEnd = nextWeekEnd ?? weekEnd
    const nwStart = nextWeekStart ?? weekStart

    const allTasks = await fetchTasksForUser(boardIds, mondayUserId, token, weekStart, nwEnd, force)

    const lastWeekTasks = allTasks
      .filter(t => t.timeline_end && t.timeline_end >= weekStart && t.timeline_end <= weekEnd)
      .sort((a, b) => (a.timeline_end ?? '').localeCompare(b.timeline_end ?? ''))

    const thisWeekTasks = allTasks
      .filter(t => t.timeline_end && t.timeline_end >= nwStart && t.timeline_end <= nwEnd)
      .sort((a, b) => (a.timeline_end ?? '').localeCompare(b.timeline_end ?? ''))

    return NextResponse.json({ lastWeek: lastWeekTasks, thisWeek: thisWeekTasks })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
